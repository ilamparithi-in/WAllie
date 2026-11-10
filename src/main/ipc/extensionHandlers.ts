import { ipcMain, BrowserWindow } from 'electron';
import { state } from '../state';
import {
  importExtension,
  installWebStoreExtension,
  toggleExtension,
  removeExtension,
  checkForWebStoreUpdates,
} from '../extensions';
import { getAccountById, getPreloadPath } from '../utils';
import { getInitialWindowSize } from '../window';
import {
  validate,
  accountIdSchema,
  extensionImportTypeSchema,
  extensionToggleSchema,
  extensionRemoveSchema,
  extensionInstallWebstoreSchema,
} from './schemas';

export function registerExtensionHandlers(): void {
  ipcMain.handle('extension:import', async (_event, rawAccountId: unknown, rawImportType: unknown) => {
    const accountId = validate(accountIdSchema, rawAccountId);
    const importType = validate(extensionImportTypeSchema, rawImportType);
    return await importExtension(accountId, importType);
  });

  ipcMain.on('webstore:open', (_event, rawAccountId: unknown) => {
    const accountId = validate(accountIdSchema, rawAccountId);
    const { width, height } = getInitialWindowSize(1200, 800, state.mainWindow);
    const cwsWin = new BrowserWindow({
      width,
      height,
      webPreferences: {
        preload: getPreloadPath(),
        partition: 'persist:webstore',
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
      },
    });

    cwsWin.removeMenu();
    state.webstoreWindows.set(cwsWin.webContents.id, accountId);

    cwsWin.webContents.on('destroyed', () => {
      state.webstoreWindows.delete(cwsWin.webContents.id);
    });

    cwsWin.loadURL('https://chromewebstore.google.com/');
  });

  ipcMain.handle('webstore:get-target-account-id', (event) => {
    return state.webstoreWindows.get(event.sender.id) || null;
  });

  ipcMain.handle('webstore:check-installed', (_event, rawAccountId: unknown, rawExtensionId: unknown) => {
    const accountId = validate(accountIdSchema, rawAccountId);
    const extensionId = typeof rawExtensionId === 'string' ? rawExtensionId.trim() : '';
    const account = getAccountById(accountId);
    if (!account || !account.extensions) return false;
    return account.extensions.some((ext) => ext.id === extensionId);
  });

  ipcMain.handle('extension:install-webstore', async (_event, rawAccountId: unknown, rawUrlOrId: unknown) => {
    const { accountId, urlOrId } = validate(extensionInstallWebstoreSchema, {
      accountId: rawAccountId,
      urlOrId: rawUrlOrId,
    });
    return await installWebStoreExtension(accountId, urlOrId);
  });

  ipcMain.handle('extension:toggle', async (_event, rawAccountId: unknown, rawExtensionId: unknown, rawEnabled: unknown) => {
    const { accountId, extensionId, enabled } = validate(extensionToggleSchema, {
      accountId: rawAccountId,
      extensionId: rawExtensionId,
      enabled: rawEnabled,
    });
    return await toggleExtension(accountId, extensionId, enabled);
  });

  ipcMain.handle('extension:remove', async (_event, rawAccountId: unknown, rawExtensionId: unknown) => {
    const { accountId, extensionId } = validate(extensionRemoveSchema, {
      accountId: rawAccountId,
      extensionId: rawExtensionId,
    });
    return await removeExtension(accountId, extensionId);
  });

  ipcMain.handle('extension:check-updates', async (_event, rawAccountId?: unknown) => {
    const accountId = typeof rawAccountId === 'string' && rawAccountId.trim() ? validate(accountIdSchema, rawAccountId) : undefined;
    return await checkForWebStoreUpdates(accountId);
  });
}

