import { ipcMain, Menu, session, dialog } from 'electron';
import { state } from '../state';
import { saveAccounts, saveSettings, getAccountStorageSizes, invalidateStorageCache, createNewAccount } from '../config';
import {
  getAccountById,
  focusActiveView,
  getAccountsWithLoadedStatus,
  getAccountForWebContents,
  isAccountLoaded,
  getActiveWindow,
} from '../utils';
import {
  switchActiveAccount,
  removeAccountLogic,
  unloadAccountLogic,
  loadAccountLogic,
  notifyAccountListChanged,
  updateActiveViewBounds,
  openAddAccountWindow,
} from '../window';
import { injectAccountStyling } from '../views';
import { AccountSettings, DEFAULT_ACCOUNT_SETTINGS } from '../../shared/types';
import {
  validate,
  addAccountOptionsSchema,
  accountIdSchema,
  accountRenameSchema,
  accountEmojiSchema,
  accountCssSchema,
  accountAppearanceSchema,
  accountSettingsSchema,
  storageClearTypeSchema,
} from './schemas';

export function registerAccountHandlers(): void {
  ipcMain.handle('account:get-name-for-session', (event) => {
    const acc = getAccountForWebContents(event.sender);
    return acc ? acc.name : null;
  });

  ipcMain.on('account:focus-active', () => {
    focusActiveView();
  });

  ipcMain.handle('account:get-all', () => getAccountsWithLoadedStatus());

  ipcMain.handle('account:get-active-id', () => state.activeAccountId);

  ipcMain.on('account:switch', async (_event, rawId: unknown) => {
    const id = validate(accountIdSchema, rawId);
    await switchActiveAccount(id);
  });

  ipcMain.handle('account:unload', async (_event, rawId: unknown) => {
    const id = validate(accountIdSchema, rawId);
    return await unloadAccountLogic(id);
  });

  ipcMain.handle('account:load', async (_event, rawId: unknown) => {
    const id = validate(accountIdSchema, rawId);
    return await loadAccountLogic(id);
  });

  ipcMain.on('account:reload-active', () => {
    const activeView = state.accountViews.get(state.activeAccountId);
    if (activeView) {
      console.log(`Reloading active view for account: ${state.activeAccountId}`);
      activeView.webContents.reload();
    }
  });

  ipcMain.on('account:reload', (_event, rawId: unknown) => {
    const accountId = validate(accountIdSchema, rawId);
    const view = state.accountViews.get(accountId);
    if (view) {
      console.log(`Reloading view for account: ${accountId}`);
      view.webContents.reload();
    }
  });

  ipcMain.handle('account:add', async (_event, rawOptions?: unknown) => {
    const validated = validate(addAccountOptionsSchema, rawOptions);
    let customName: string | undefined = undefined;
    let customEmoji: string | undefined = undefined;
    let preload = false;

    if (typeof validated === 'string') {
      if (validated.length > 0) {
        customName = validated;
      }
    } else if (validated && typeof validated === 'object') {
      if (validated.name && validated.name.trim().length > 0) {
        customName = validated.name.trim();
      }
      if (validated.emoji !== undefined) {
        customEmoji = validated.emoji.trim();
      }
      if (typeof validated.preload === 'boolean') {
        preload = validated.preload;
      }
    }

    const newAccount = createNewAccount(customName, undefined, customEmoji);
    state.accounts.push(newAccount);
    await saveAccounts();

    if (preload && state.globalSettings) {
      const currentPreload = state.globalSettings.preloadAccountIds || [];
      if (!currentPreload.includes(newAccount.id)) {
        state.globalSettings.preloadAccountIds = [...currentPreload, newAccount.id];
        await saveSettings(state.globalSettings);
        if (state.mainWindow && !state.mainWindow.isDestroyed()) {
          state.mainWindow.webContents.send('settings:global-changed', state.globalSettings);
        }
        if (state.settingsWindow && !state.settingsWindow.isDestroyed()) {
          state.settingsWindow.webContents.send('settings:global-changed', state.globalSettings);
        }
      }
    }

    await switchActiveAccount(newAccount.id);
    return newAccount;
  });

  ipcMain.on('account:open-add-window', () => {
    openAddAccountWindow();
  });

  ipcMain.on('account:toggle-add-prompt', (_event, isOpen: unknown) => {
    const open = Boolean(isOpen);
    state.addAccountPromptOpen = open;
    if (open) {
      state.activeModals.add('add-account');
    } else {
      state.activeModals.delete('add-account');
    }
    updateActiveViewBounds();
    const isAnyModalOpen =
      (state.activeModals && state.activeModals.size > 0) ||
      state.disclaimerOpen ||
      state.protocolPromptOpen ||
      state.addAccountPromptOpen;
    if (!isAnyModalOpen) focusActiveView();
  });

  ipcMain.handle('account:rename', (_event, rawId: unknown, rawName: unknown) => {
    const { id, newName } = validate(accountRenameSchema, { id: rawId, newName: rawName });
    const account = getAccountById(id);
    if (account) {
      account.name = newName;
      saveAccounts();
      notifyAccountListChanged();
      return true;
    }
    return false;
  });

  ipcMain.handle('account:update-emoji', (_event, rawId: unknown, rawEmoji: unknown) => {
    const { id, emoji } = validate(accountEmojiSchema, { id: rawId, emoji: rawEmoji });
    const account = getAccountById(id);
    if (account) {
      account.emoji = emoji.trim();
      saveAccounts();
      notifyAccountListChanged();
      return true;
    }
    return false;
  });

  ipcMain.handle('account:remove', async (_event, rawId: unknown) => {
    const id = validate(accountIdSchema, rawId);
    return await removeAccountLogic(id);
  });

  ipcMain.on('account:context-menu', (_event, rawId: unknown) => {
    const accountId = validate(accountIdSchema, rawId);
    const account = getAccountById(accountId);
    if (!account) return;

    const isLoaded = isAccountLoaded(accountId);

    const menu = Menu.buildFromTemplate([
      {
        label: 'Rename Account',
        click: () => {
          state.mainWindow?.webContents.send('account:trigger-rename', accountId);
        },
      },
      {
        label: 'Manage Account',
        click: () => {
          state.mainWindow?.webContents.send('settings:open-manage-accounts', accountId);
        },
      },
      { type: 'separator' },
      isLoaded
        ? {
          label: 'Unload Account',
          click: async () => {
            await unloadAccountLogic(accountId);
          },
        }
        : {
          label: 'Load Account',
          click: async () => {
            await loadAccountLogic(accountId);
          },
        },
      {
        label: 'Reload Account',
        click: () => {
          const view = state.accountViews.get(accountId);
          if (view && !view.webContents.isDestroyed()) {
            view.webContents.reload();
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Delete Account',
        enabled: state.accounts.length > 1,
        click: async () => {
          await removeAccountLogic(accountId);
        },
      },
    ]);

    menu.popup();
  });

  ipcMain.handle('account:get-storage-sizes', async (_event, rawId: unknown) => {
    const accountId = validate(accountIdSchema, rawId);
    const account = getAccountById(accountId);
    if (!account) return { cache: 0, localStorage: 0, indexedDb: 0, cookies: 0 };
    return await getAccountStorageSizes(account.partition);
  });

  ipcMain.handle('account:clear-storage', async (_event, rawId: unknown, rawType: unknown) => {
    const accountId = validate(accountIdSchema, rawId);
    const type = validate(storageClearTypeSchema, rawType);
    const account = getAccountById(accountId);
    if (!account) return false;

    const accountSession = session.fromPartition(account.partition);

    try {
      if (type === 'cache') {
        await accountSession.clearCache();
        await accountSession.clearStorageData({
          storages: ['shadercache', 'cachestorage'],
        });
        console.log(`Cache cleared successfully for account: ${accountId}`);
      } else if (type === 'media') {
        const parentWindow = getActiveWindow();
        if (parentWindow && !parentWindow.isDestroyed()) {
          const choice = await dialog.showMessageBox(parentWindow, {
            type: 'warning',
            buttons: ['Cancel', 'Clear Data & Log Out'],
            defaultId: 0,
            cancelId: 0,
            title: 'Clear Media & Databases',
            message: `Are you sure you want to clear media & databases for "${account.name}"?`,
            detail: 'This will wipe all local chat history, media cache, and databases, and will log you out of this account.',
          });

          if (choice.response !== 1) {
            return false;
          }
        }

        const view = state.accountViews.get(accountId);
        if (view && !view.webContents.isDestroyed()) {
          view.webContents.stop();
          await view.webContents.loadURL('about:blank');
        }

        await accountSession.clearStorageData();
        await accountSession.clearCache();
        console.log(`All storage and cache cleared for account: ${accountId}`);

        account.loggedIn = false;
        await saveAccounts();
        if (state.mainWindow && !state.mainWindow.isDestroyed()) {
          state.mainWindow.webContents.send('account:list-changed', state.accounts, state.activeAccountId);
        }

        if (view && !view.webContents.isDestroyed()) {
          await view.webContents.loadURL('https://web.whatsapp.com');
        }
      }

      invalidateStorageCache(account.partition);
      return true;
    } catch (error) {
      console.error(`Failed to clear storage for account ${accountId} (type: ${type}):`, error);
      return false;
    }
  });

  ipcMain.handle('account:update-settings', (_event, rawId: unknown, rawSettings: unknown) => {
    const accountId = validate(accountIdSchema, rawId);
    const settings = validate(accountSettingsSchema, rawSettings);
    const account = getAccountById(accountId);
    if (account) {
      account.settings = settings as unknown as AccountSettings;
      saveAccounts();
      state.mainWindow?.webContents.send('account:list-changed', state.accounts, state.activeAccountId);
      return true;
    }
    return false;
  });

  ipcMain.handle('account:save-css', (_event, rawId: unknown, rawCss: unknown, rawTheme: unknown) => {
    const { accountId, customCss, selectedTheme } = validate(accountCssSchema, {
      accountId: rawId,
      customCss: rawCss,
      selectedTheme: rawTheme,
    });
    const account = getAccountById(accountId);
    if (account) {
      if (!account.settings) {
        account.settings = { ...DEFAULT_ACCOUNT_SETTINGS };
      }
      account.settings.customCss = customCss;
      account.settings.selectedTheme = selectedTheme;
      saveAccounts();

      const view = state.accountViews.get(accountId);
      if (view) {
        injectAccountStyling(accountId, view.webContents);
      }
      return true;
    }
    return false;
  });

  ipcMain.handle('account:save-appearance', (_event, rawId: unknown, rawAppearance: unknown) => {
    const { accountId, appearance } = validate(accountAppearanceSchema, {
      accountId: rawId,
      appearance: rawAppearance,
    });
    const account = getAccountById(accountId);
    if (!account) return false;
    if (!account.settings) {
      account.settings = { ...DEFAULT_ACCOUNT_SETTINGS };
    }

    if (typeof appearance.customCss === 'string') {
      account.settings.customCss = appearance.customCss.substring(0, 500000);
    }
    if (typeof appearance.selectedTheme === 'string') {
      account.settings.selectedTheme = appearance.selectedTheme.substring(0, 100);
    }
    if (typeof appearance.fontFamily === 'string') {
      account.settings.fontFamily = appearance.fontFamily.substring(0, 200);
    }
    if (typeof appearance.fontUrl === 'string') {
      account.settings.fontUrl = appearance.fontUrl.substring(0, 1000);
    }
    if (typeof appearance.monoFontFamily === 'string') {
      account.settings.monoFontFamily = appearance.monoFontFamily.substring(0, 200);
    }
    if (typeof appearance.monoFontUrl === 'string') {
      account.settings.monoFontUrl = appearance.monoFontUrl.substring(0, 1000);
    }
    if (typeof appearance.preferGoogleFont === 'boolean') {
      account.settings.preferGoogleFont = appearance.preferGoogleFont;
    }
    if (typeof appearance.preferGoogleMonoFont === 'boolean') {
      account.settings.preferGoogleMonoFont = appearance.preferGoogleMonoFont;
    }
    if (typeof appearance.followSystemFont === 'boolean') {
      account.settings.followSystemFont = appearance.followSystemFont;
    }
    if (typeof appearance.customWallpaper === 'string') {
      account.settings.customWallpaper = appearance.customWallpaper.substring(0, 5000000);
    }

    saveAccounts();

    const view = state.accountViews.get(accountId);
    if (view) {
      injectAccountStyling(accountId, view.webContents);
    }
    return true;
  });

  ipcMain.on('account:show-dropdown-menu', (_event, rect?: { x: number; y: number; width: number; height: number }) => {
    if (!state.mainWindow || state.mainWindow.isDestroyed()) return;

    const scaleFactor = (state.globalSettings?.appScale || 100) / 100;
    const accounts = state.accounts;

    const menu = Menu.buildFromTemplate([
      ...accounts.map((acc) => {
        const isLoaded = isAccountLoaded(acc.id);
        const unread = acc.unreadCount > 0 ? ` (${acc.unreadCount > 99 ? '99+' : acc.unreadCount})` : '';
        const status = !isLoaded ? ' [unloaded]' : '';
        const label = `${acc.emoji ? acc.emoji + ' ' : ''}${acc.name}${unread}${status}`;
        return {
          label,
          type: 'radio' as const,
          checked: acc.id === state.activeAccountId,
          click: () => {
            switchActiveAccount(acc.id);
          },
        };
      }),
      { type: 'separator' },
      {
        label: '+ Add Account',
        click: () => {
          openAddAccountWindow();
        },
      },
    ]);

    state.mainWindow.webContents.send('account:dropdown-status', true);

    const popupOptions: Electron.PopupOptions = {
      window: state.mainWindow,
      callback: () => {
        if (state.mainWindow && !state.mainWindow.isDestroyed()) {
          state.mainWindow.webContents.send('account:dropdown-status', false);
        }
      },
    };

    if (rect && typeof rect.x === 'number' && typeof rect.y === 'number') {
      popupOptions.x = Math.round(rect.x * scaleFactor);
      popupOptions.y = Math.round((rect.y + (rect.height || 22)) * scaleFactor);
    }

    menu.popup(popupOptions);
  });
}

