import { app, WebContents } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { state } from './state';
import { switchActiveAccount } from './window';
import { getAccountForWebContents, getConfigDir } from './utils';
import { HistoricalNotification, TimelineEntry, MessageEntry } from '../shared/types';
import { getAccountDisplayName } from '../shared/constants';
import { decodeHtmlEntities } from '../shared/notificationFormatting';
import { notificationManager } from './notifications/index';

export const NOTIFICATION_HISTORY_FILE = path.join(getConfigDir(), 'notification_history.json');
const HISTORY_FLUSH_DELAY = 5000;

export function getEntryTimestampMs(item: TimelineEntry): number {
  if (item.type === 'date_divider') return 0;
  if (!item.timestamp) return 0;
  const parsed = Date.parse(item.timestamp);
  return isNaN(parsed) ? 0 : parsed;
}

export function pruneHistoryByRetention(history: TimelineEntry[]): TimelineEntry[] {
  const retentionDays = typeof state.globalSettings?.notificationRetentionDays === 'number'
    ? state.globalSettings.notificationRetentionDays
    : 30;
  if (retentionDays <= 0) {
    return history;
  }
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  return history.filter((item) => {
    const t = getEntryTimestampMs(item);
    return t >= cutoffMs;
  });
}

export function applyRetentionPruning() {
  const history = getNotificationHistory();
  const updated = pruneHistoryByRetention(history);
  state.notificationHistoryCache = updated;
  scheduleHistoryFlush();
  state.mainWindow?.webContents.send('notification:history-changed', updated);
}

export function getNotificationHistory(): TimelineEntry[] {
  if (state.notificationHistoryCache === null) {
    try {
      if (fs.existsSync(NOTIFICATION_HISTORY_FILE)) {
        const data = fs.readFileSync(NOTIFICATION_HISTORY_FILE, 'utf8');
        const parsed = JSON.parse(data);
        // If file contains legacy entries without a spec 'type', discard and start fresh (no migration)
        if (Array.isArray(parsed) && parsed.every((entry: any) => entry && entry.type)) {
          state.notificationHistoryCache = pruneHistoryByRetention(parsed);
        } else {
          state.notificationHistoryCache = [];
        }
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

export function logNotificationToHistory(notif: TimelineEntry) {
  const history = getNotificationHistory();
  if (Array.isArray(history)) {
    history.unshift(notif);
    const updated = pruneHistoryByRetention(history);
    state.notificationHistoryCache = updated;
    scheduleHistoryFlush();
    state.mainWindow?.webContents.send('notification:history-changed', updated);
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

  let updatedHistory: TimelineEntry[];

  switch (options.mode) {
    case 'range': {
      const startMs = options.startDate ? new Date(`${options.startDate}T00:00:00`).getTime() : 0;
      const endMs = options.endDate ? new Date(`${options.endDate}T23:59:59.999`).getTime() : Date.now();
      updatedHistory = history.filter((item) => {
        const t = getEntryTimestampMs(item);
        return t < startMs || t > endMs;
      });
      break;
    }
    case 'single': {
      const startMs = options.startDate ? new Date(`${options.startDate}T00:00:00`).getTime() : 0;
      const endMs = options.endDate ? new Date(`${options.endDate}T23:59:59.999`).getTime() : Date.now();
      updatedHistory = history.filter((item) => {
        const t = getEntryTimestampMs(item);
        return t < startMs || t > endMs;
      });
      break;
    }
    case '24h':
      updatedHistory = history.filter((item) => now - getEntryTimestampMs(item) > 24 * 3600 * 1000);
      break;
    case '7d':
      updatedHistory = history.filter((item) => now - getEntryTimestampMs(item) > 7 * 24 * 3600 * 1000);
      break;
    case '30d':
      updatedHistory = history.filter((item) => now - getEntryTimestampMs(item) > 30 * 24 * 3600 * 1000);
      break;
    case 'older7d':
      updatedHistory = history.filter((item) => now - getEntryTimestampMs(item) <= 7 * 24 * 3600 * 1000);
      break;
    case 'older30d':
      updatedHistory = history.filter((item) => now - getEntryTimestampMs(item) <= 30 * 24 * 3600 * 1000);
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

  const cleanTitle = decodeHtmlEntities(data.title || '').trim();
  const cleanBody = decodeHtmlEntities(data.body || '').trim();
  const brandedTitle = senderAccount.emoji ? `${senderAccount.emoji} | ${cleanTitle}` : `| ${cleanTitle}`;

  if (state.globalSettings?.notificationLoggingEnabled) {
    const now = new Date();
    logNotificationToHistory({
      type: 'message',
      id: data.tag || `notif_${now.getTime()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: now.toISOString(),
      displayTime: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      direction: 'incoming',
      sender: {
        displayName: cleanTitle,
        avatarUrl: data.icon || undefined,
      },
      accountId: senderAccount.id,
      accountName: getAccountDisplayName(senderAccount),
      content: {
        type: 'text',
        body: cleanBody,
      },
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
    body: cleanBody,
    icon: data.icon,
    tag: data.tag,
    contactName: cleanTitle,
    accountId: senderAccount.id,
    timeoutMs,
    canReply: isInlineReplyEnabled && data.canReply !== false,
    replyPlaceholder: `Reply to ${cleanTitle}…`,
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
        contactName: cleanTitle,
      });
    },
    onReply: (replyText) => {
      const body = replyText.trim();
      if (!body) return;

      senderWebContents.send('notification:send-inline-reply', {
        contactName: cleanTitle,
        text: body,
        tag: data.tag,
      });
    },
  });
}

export async function createLogEntry(data: { title: string; body: string }, senderWebContents: WebContents) {
  const senderAccount = getAccountForWebContents(senderWebContents);
  if (!senderAccount) return;

  const cleanTitle = decodeHtmlEntities(data.title || '').trim();
  const cleanBody = decodeHtmlEntities(data.body || '').trim();

  if (state.globalSettings?.notificationLoggingEnabled) {
    const now = new Date();
    logNotificationToHistory({
      type: 'message',
      id: `log_${now.getTime()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: now.toISOString(),
      displayTime: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      direction: 'incoming',
      sender: {
        displayName: cleanTitle,
      },
      accountId: senderAccount.id,
      accountName: getAccountDisplayName(senderAccount),
      content: {
        type: 'text',
        body: cleanBody,
      },
    });
  }
}

export { notificationManager };
