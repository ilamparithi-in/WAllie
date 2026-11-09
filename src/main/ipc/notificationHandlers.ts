import { ipcMain } from 'electron';
import { state } from '../state';
import {
  createNotification,
  createLogEntry,
  closeDbusNotificationByTag,
  closeNotificationByContact,
  getNotificationHistory,
  clearNotificationHistoryCache,
} from '../notifications';
import { getAccountForWebContents, showAppToast } from '../utils';
import {
  validate,
  notificationCreateSchema,
  notificationLogEntrySchema,
  notificationDismissSchema,
  toastPayloadSchema,
} from './schemas';

export function registerNotificationHandlers(): void {
  ipcMain.on('notification:create', async (event, rawData: unknown) => {
    const data = validate(notificationCreateSchema, rawData);
    await createNotification(data, event.sender);
  });

  ipcMain.on('notification:create-log-entry', async (event, rawData: unknown) => {
    const data = validate(notificationLogEntrySchema, rawData);
    await createLogEntry(data, event.sender);
  });

  ipcMain.on('webview:clicked', () => {
    if (state.settingsOpen && state.mainWindow) {
      state.mainWindow.webContents.send('settings:close-request');
    }
  });

  ipcMain.on('notification:close-request', () => {
    // Intentionally no-op to prevent WhatsApp Web's browser auto-dismiss timer from
    // prematurely killing desktop notifications before the user can type a reply.
  });

  ipcMain.on('notification:dismiss-chat', (event, rawData: unknown) => {
    const data = validate(notificationDismissSchema, rawData);
    const senderAccount = getAccountForWebContents(event.sender);
    const accountId = senderAccount?.id;
    if (data.tag) {
      closeDbusNotificationByTag(data.tag);
    }
    if (data.contactName) {
      closeNotificationByContact(data.contactName, accountId);
    }
  });

  ipcMain.handle('notification:get-history', () => {
    return getNotificationHistory();
  });

  ipcMain.handle('notification:clear-history', (_event, options?: unknown) => {
    clearNotificationHistoryCache(options as any);
    return true;
  });

  ipcMain.on('toast:show', (_event, rawPayload: unknown) => {
    const payload = validate(toastPayloadSchema, rawPayload);
    showAppToast(payload.message, payload.url, true);
  });
}

