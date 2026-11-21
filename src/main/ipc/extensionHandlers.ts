import { ipcMain, BrowserWindow, Menu, nativeImage } from 'electron';
import { state } from '../state';
import {
  importExtension,
  installWebStoreExtension,
  toggleExtension,
  toggleExtensionPin,
  setAccountShowExtensionsButton,
  removeExtension,
  checkForWebStoreUpdates,
  openExtensionPopup,
} from '../extensions';
import { getAccountById, getPreloadPath } from '../utils';
import { getInitialWindowSize, openSettingsWindow } from '../window';
import {
  validate,
  accountIdSchema,
  extensionImportTypeSchema,
  extensionToggleSchema,
  extensionTogglePinSchema,
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

  ipcMain.handle('extension:toggle-pin', async (_event, rawAccountId: unknown, rawExtensionId: unknown, rawPinned: unknown) => {
    const { accountId, extensionId, pinned } = validate(extensionTogglePinSchema, {
      accountId: rawAccountId,
      extensionId: rawExtensionId,
      pinned: rawPinned,
    });
    return await toggleExtensionPin(accountId, extensionId, pinned);
  });

  ipcMain.handle('extension:set-show-menu-button', async (_event, rawAccountId: unknown, rawShow: unknown) => {
    const accountId = validate(accountIdSchema, rawAccountId);
    const show = rawShow !== false;
    return await setAccountShowExtensionsButton(accountId, show);
  });

  ipcMain.handle('extension:remove', async (_event, rawAccountId: unknown, rawExtensionId: unknown) => {
    const { accountId, extensionId } = validate(extensionRemoveSchema, {
      accountId: rawAccountId,
      extensionId: rawExtensionId,
    });
    return await removeExtension(accountId, extensionId);
  });

  ipcMain.handle('extension:open-popup', async (_event, rawAccountId: unknown, rawExtensionId: unknown, rawAnchorBounds?: unknown) => {
    let accountId = '';
    if (typeof rawAccountId === 'string' && rawAccountId.trim().length > 0) {
      accountId = validate(accountIdSchema, rawAccountId);
    } else {
      accountId = state.activeAccountId || (state.accounts[0]?.id ?? '');
    }
    const extensionId = typeof rawExtensionId === 'string' ? rawExtensionId.trim() : '';
    const anchorBounds = rawAnchorBounds && typeof rawAnchorBounds === 'object' ? (rawAnchorBounds as any) : undefined;
    return await openExtensionPopup(accountId, extensionId, anchorBounds);
  });

  ipcMain.handle('extension:check-updates', async (_event, rawAccountId?: unknown) => {
    const accountId = typeof rawAccountId === 'string' && rawAccountId.trim() ? validate(accountIdSchema, rawAccountId) : undefined;
    return await checkForWebStoreUpdates(accountId);
  });

  ipcMain.on('extension:show-dropdown-menu', (_event, rawAccountId: unknown, rect?: { x: number; y: number; width: number; height: number }) => {
    if (!state.mainWindow || state.mainWindow.isDestroyed()) return;

    const accountId = typeof rawAccountId === 'string' && rawAccountId ? rawAccountId : state.activeAccountId;
    const account = getAccountById(accountId);
    if (!account) return;

    const hiddenExts = (account.extensions || []).filter((e) => e.enabled && e.hasPopup && e.pinnedInTitlebar === false);
    const scaleFactor = (state.globalSettings?.appScale || 100) / 100;

    const template: Electron.MenuItemConstructorOptions[] = [];

    if (hiddenExts.length === 0) {
      template.push({
        label: 'No Hidden Extensions',
        enabled: false,
      });
    } else {
      for (const ext of hiddenExts) {
        let itemIcon: Electron.NativeImage | undefined;
        if (ext.iconDataUrl) {
          try {
            itemIcon = nativeImage.createFromDataURL(ext.iconDataUrl).resize({ width: 16, height: 16 });
          } catch {}
        }

        template.push({
          label: ext.name,
          icon: itemIcon,
          click: () => {
            openExtensionPopup(accountId, ext.id, rect);
          },
        });
      }
    }

    template.push({ type: 'separator' });
    template.push({
      label: 'Manage Extensions...',
      click: () => {
        openSettingsWindow('extensions', accountId);
      },
    });

    const menu = Menu.buildFromTemplate(template);

    const popupOptions: Electron.PopupOptions = {
      window: state.mainWindow,
    };

    if (rect && typeof rect.x === 'number' && typeof rect.y === 'number') {
      popupOptions.x = Math.round(rect.x * scaleFactor);
      popupOptions.y = Math.round((rect.y + (rect.height || 28)) * scaleFactor);
    }

    menu.popup(popupOptions);
  });
}

