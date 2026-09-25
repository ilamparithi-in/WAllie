import { app, WebContents } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { state } from './state';
import { switchActiveAccount } from './window';
import { getAccountForWebContents } from './utils';
import { HistoricalNotification } from '../shared/types';
import { getAccountDisplayName } from '../shared/constants';
import { notificationManager } from './notifications/index';

export const NOTIFICATION_HISTORY_FILE = path.join(app.getPath('userData'), 'notification_history.json');
const MAX_NOTIFICATIONS = 100;
const HISTORY_FLUSH_DELAY = 5000;

export function getNotificationHistory(): HistoricalNotification[] {
  if (state.notificationHistoryCache === null) {
    try {
      if (fs.existsSync(NOTIFICATION_HISTORY_FILE)) {
        const data = fs.readFileSync(NOTIFICATION_HISTORY_FILE, 'utf8');
        const parsed = JSON.parse(data);
        state.notificationHistoryCache = Array.isArray(parsed) ? parsed : [];
      }
    } catch (error) {
      console.error('Failed to load notification history:', error);
    }
    if (!state.notificationHistoryCache || !Array.isArray(state.notificationHistoryCache)) {
      state.notificationHistoryCache = [];
    }
  }
  if (!Array.isArray(state.notificationHistoryCache)) {
    state.notificationHistoryCache = [];
  }
  return state.notificationHistoryCache;
}

export function scheduleHistoryFlush() {
  if (state.historyFlushTimeout) {
    clearTimeout(state.historyFlushTimeout);
  }
  state.historyFlushTimeout = setTimeout(async () => {
    state.historyFlushTimeout = null;
    if (state.notificationHistoryCache) {
      try {
        const tempFile = `${NOTIFICATION_HISTORY_FILE}.tmp`;
        await fs.promises.writeFile(tempFile, JSON.stringify(state.notificationHistoryCache, null, 2), 'utf8');
        await fs.promises.rename(tempFile, NOTIFICATION_HISTORY_FILE);
      } catch (error) {
        console.error('Failed to flush notification history to disk:', error);
      }
    }
  }, HISTORY_FLUSH_DELAY);
}

export function logNotificationToHistory(notif: HistoricalNotification) {
  const history = getNotificationHistory();
  if (Array.isArray(history)) {
    history.unshift(notif);
    if (history.length > MAX_NOTIFICATIONS) {
      history.splice(MAX_NOTIFICATIONS);
    }
    scheduleHistoryFlush();
    state.mainWindow?.webContents.send('notification:history-changed', history);
  }
}

export interface ClearHistoryOptions {
  mode: 'all' | 'range' | 'single' | '24h' | '7d' | '30d' | 'older7d' | 'older30d';
  startDate?: string;
  endDate?: string;
}

export function clearNotificationHistoryCache(optionsOrPeriod: string | ClearHistoryOptions = 'all') {
  const now = Date.now();
  const history = getNotificationHistory();
  if (!Array.isArray(history)) {
    state.notificationHistoryCache = [];
    return;
  }

  let options: ClearHistoryOptions;
  if (typeof optionsOrPeriod === 'string') {
    options = { mode: optionsOrPeriod as any };
  } else {
    options = optionsOrPeriod || { mode: 'all' };
  }

  let updatedHistory: HistoricalNotification[];

  switch (options.mode) {
    case 'range': {
      const startMs = options.startDate ? new Date(`${options.startDate}T00:00:00`).getTime() : 0;
      const endMs = options.endDate ? new Date(`${options.endDate}T23:59:59.999`).getTime() : Date.now();
      updatedHistory = history.filter((item) => item.timestamp < startMs || item.timestamp > endMs);
      break;
    }
    case 'single': {
      const startMs = options.startDate ? new Date(`${options.startDate}T00:00:00`).getTime() : 0;
      const endMs = options.endDate ? new Date(`${options.endDate}T23:59:59.999`).getTime() : Date.now();
      updatedHistory = history.filter((item) => item.timestamp < startMs || item.timestamp > endMs);
      break;
    }
    case '24h':
      updatedHistory = history.filter((item) => now - item.timestamp > 24 * 3600 * 1000);
      break;
    case '7d':
      updatedHistory = history.filter((item) => now - item.timestamp > 7 * 24 * 3600 * 1000);
      break;
    case '30d':
      updatedHistory = history.filter((item) => now - item.timestamp > 30 * 24 * 3600 * 1000);
      break;
    case 'older7d':
      updatedHistory = history.filter((item) => now - item.timestamp <= 7 * 24 * 3600 * 1000);
      break;
    case 'older30d':
      updatedHistory = history.filter((item) => now - item.timestamp <= 30 * 24 * 3600 * 1000);
      break;
    case 'all':
    default:
      updatedHistory = [];
      break;
  }

  state.notificationHistoryCache = updatedHistory;
  scheduleHistoryFlush();
  state.mainWindow?.webContents.send('notification:history-changed', updatedHistory);
}

export async function closeDbusNotificationByTag(tag: string) {
  await notificationManager.closeByTag(tag);
}

export async function closeNotificationByContact(contactName: string, accountId?: string) {
  await notificationManager.closeByContact(contactName, accountId);
}

export async function createNotification(
  data: { title: string; body: string; icon: string; tag: string; canReply?: boolean },
  senderWebContents: WebContents
) {
  const senderAccount = getAccountForWebContents(senderWebContents);
  if (!senderAccount) return;

  const brandedTitle = senderAccount.emoji ? `${senderAccount.emoji} | ${data.title}` : `| ${data.title}`;

  if (state.globalSettings?.notificationLoggingEnabled) {
    logNotificationToHistory({
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      accountId: senderAccount.id,
      accountName: getAccountDisplayName(senderAccount),
      title: data.title,
      body: data.body,
      icon: '',
      timestamp: Date.now(),
    });
  }

  if (senderAccount.settings?.notificationsEnabled === false) {
    return;
  }

  const dismissalTimeSec = typeof state.globalSettings?.notificationDismissalTime === 'number'
    ? state.globalSettings.notificationDismissalTime
    : 10;
  const timeoutMs = dismissalTimeSec === -1 ? -1 : (dismissalTimeSec === 0 ? 0 : dismissalTimeSec * 1000);

  const isInlineReplyEnabled = state.globalSettings?.inlineReplyEnabled !== false;

  await notificationManager.notify({
    title: brandedTitle,
    body: data.body,
    icon: data.icon,
    tag: data.tag,
    contactName: data.title,
    accountId: senderAccount.id,
    timeoutMs,
    canReply: isInlineReplyEnabled && data.canReply !== false,
    replyPlaceholder: `Reply to ${data.title}…`,
    actions: [
      { id: 'default', label: 'Open Chat' },
    ],
    onAction: (_actionId) => {
      if (state.mainWindow) {
        if (state.mainWindow.isMinimized()) {
          state.mainWindow.restore();
        }
        state.mainWindow.show();
        state.mainWindow.focus();
      }
      if (senderAccount) {
        switchActiveAccount(senderAccount.id);
      }
      senderWebContents.send('notification:clicked-reply', {
        tag: data.tag,
        contactName: data.title,
      });
    },
    onReply: (replyText) => {
      const body = replyText.trim();
      if (!body) return;

      senderWebContents.send('notification:send-inline-reply', {
        contactName: data.title,
        text: body,
        tag: data.tag,
      });
    },
  });
}

export async function createLogEntry(data: { title: string; body: string }, senderWebContents: WebContents) {
  const senderAccount = getAccountForWebContents(senderWebContents);
  if (!senderAccount) return;

  if (state.globalSettings?.notificationLoggingEnabled) {
    logNotificationToHistory({
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      accountId: senderAccount.id,
      accountName: getAccountDisplayName(senderAccount),
      title: data.title,
      body: data.body,
      icon: '',
      timestamp: Date.now(),
    });
  }
}

export { notificationManager };
