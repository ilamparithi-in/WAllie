import { app, Notification, nativeImage, WebContents } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { state } from './state';
import { switchActiveAccount } from './window';
import { getAccountForWebContents } from './utils';
import { HistoricalNotification } from '../shared/types';

export const NOTIFICATION_HISTORY_FILE = path.join(app.getPath('userData'), 'notification_history.json');
const MAX_NOTIFICATIONS = 100;
const HISTORY_FLUSH_DELAY = 5000;

export function getNotificationHistory(): HistoricalNotification[] {
  if (state.notificationHistoryCache === null) {
    try {
      if (fs.existsSync(NOTIFICATION_HISTORY_FILE)) {
        const data = fs.readFileSync(NOTIFICATION_HISTORY_FILE, 'utf8');
        state.notificationHistoryCache = JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load notification history:', error);
    }
    if (!state.notificationHistoryCache) {
      state.notificationHistoryCache = [];
    }
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
        await fs.promises.writeFile(NOTIFICATION_HISTORY_FILE, JSON.stringify(state.notificationHistoryCache, null, 2), 'utf8');
      } catch (error) {
        console.error('Failed to flush notification history to disk:', error);
      }
    }
  }, HISTORY_FLUSH_DELAY);
}

export function logNotificationToHistory(notif: HistoricalNotification) {
  const history = getNotificationHistory();
  history.unshift(notif);
  if (history.length > MAX_NOTIFICATIONS) {
    history.splice(MAX_NOTIFICATIONS);
  }
  scheduleHistoryFlush();
  state.mainWindow?.webContents.send('notification:history-changed', history);
}

export interface ClearHistoryOptions {
  mode: 'all' | 'range' | 'single' | '24h' | '7d' | '30d' | 'older7d' | 'older30d';
  startDate?: string;
  endDate?: string;
}

export function clearNotificationHistoryCache(optionsOrPeriod: string | ClearHistoryOptions = 'all') {
  const now = Date.now();
  const history = getNotificationHistory();

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
      const endMs = options.startDate ? new Date(`${options.startDate}T23:59:59.999`).getTime() : Date.now();
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

export async function createNotification(data: { title: string; body: string; icon: string; tag: string }, senderWebContents: WebContents) {
  const senderAccount = getAccountForWebContents(senderWebContents);
  if (!senderAccount) return;

  const brandedTitle = senderAccount.emoji ? `${senderAccount.emoji} | ${data.title}` : `| ${data.title}`;

  if (state.globalSettings?.notificationLoggingEnabled) {
    logNotificationToHistory({
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      accountId: senderAccount.id,
      accountName: senderAccount.emoji ? `${senderAccount.emoji} ${senderAccount.name}` : senderAccount.name,
      title: data.title,
      body: data.body,
      icon: data.icon,
      timestamp: Date.now(),
    });
  }

  if (senderAccount.settings?.notificationsEnabled === false) {
    return;
  }

  let iconImage: any = null;
  if (data.icon && data.icon.startsWith('data:image')) {
    try {
      iconImage = nativeImage.createFromDataURL(data.icon);
    } catch (err) {
      console.error('Failed to create NativeImage from base64 avatar:', err);
    }
  }

  const nativeNotif = new Notification({
    title: brandedTitle,
    body: data.body,
    icon: iconImage || undefined,
    silent: false,
    actions: [
      { type: 'button', text: 'Open Chat' }
    ]
  });

  const onSelectAction = () => {
    if (state.mainWindow) {
      state.mainWindow.show();
      state.mainWindow.focus();
    }
    if (senderAccount) {
      switchActiveAccount(senderAccount.id);
    }
    senderWebContents.send('notification:clicked-reply', data.tag);
  };

  nativeNotif.on('click', onSelectAction);
  nativeNotif.on('action', (event, index) => {
    if (index === 0) {
      onSelectAction();
    }
  });

  nativeNotif.show();
}

export async function createLogEntry(data: { title: string; body: string }, senderWebContents: WebContents) {
  const senderAccount = getAccountForWebContents(senderWebContents);
  if (!senderAccount) return;

  if (state.globalSettings?.notificationLoggingEnabled) {
    logNotificationToHistory({
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      accountId: senderAccount.id,
      accountName: senderAccount.emoji ? `${senderAccount.emoji} ${senderAccount.name}` : senderAccount.name,
      title: data.title,
      body: data.body,
      icon: '',
      timestamp: Date.now(),
    });
  }
}
