import { ipcMain, BrowserWindow, session, Menu, app } from 'electron';
import path from 'node:path';
import { state } from './state';
import { saveAccounts, saveSettings, getAccountStorageSizes, invalidateStorageCache } from './config';
import { importExtension, installWebStoreExtension, toggleExtension, removeExtension } from './extensions';
import { createAccountView, getActiveWebContents, resetZoom, injectCustomCssForView } from './views';
import { switchActiveAccount, updateActiveViewBounds, animateSettingsTransition, toggleDevToolsForAccount, removeAccountLogic, initializeAccountsLoad } from './window';
import { getNotificationHistory, clearNotificationHistoryCache, createNotification, createLogEntry } from './notifications';
import { Account, GlobalSettings, DEFAULT_ACCOUNT_SETTINGS } from '../shared/types';

export function registerIpcHandlers() {
  ipcMain.on('window:minimize', (event) => {
    console.log('IPC Received: window:minimize');
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      win.minimize();
    } else {
      state.mainWindow?.minimize();
    }
  });

  ipcMain.on('window:maximize', (event) => {
    console.log('IPC Received: window:maximize');
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    } else {
      if (state.mainWindow?.isMaximized()) {
        state.mainWindow.unmaximize();
      } else {
        state.mainWindow?.maximize();
      }
    }
  });

  ipcMain.on('window:close', (event) => {
    console.log('IPC Received: window:close');
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      win.close();
    } else if (state.mainWindow) {
      state.mainWindow.close();
    }
  });

  ipcMain.handle('window:isMaximized', (event) => {
    console.log('IPC Handle: window:isMaximized');
    const win = BrowserWindow.fromWebContents(event.sender);
    return win?.isMaximized() ?? false;
  });

  ipcMain.on('window:toggle-always-on-top', (event) => {
    console.log('IPC Received: window:toggle-always-on-top');
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      const isAlwaysOnTop = !win.isAlwaysOnTop();
      win.setAlwaysOnTop(isAlwaysOnTop, 'screen-saver');
      event.sender.send('window:always-on-top-changed', isAlwaysOnTop);
    }
  });

  ipcMain.handle('window:get-always-on-top', (event) => {
    console.log('IPC Handle: window:get-always-on-top');
    const win = BrowserWindow.fromWebContents(event.sender);
    return win?.isAlwaysOnTop() ?? false;
  });

  ipcMain.handle('account:get-name-for-session', (event) => {
    console.log('IPC Handle: account:get-name-for-session');
    for (const account of state.accounts) {
      const accSession = session.fromPartition(account.partition);
      if (accSession === event.sender.session) {
        return account.name;
      }
    }
    return 'WhatsApp';
  });

  ipcMain.on('settings:toggle', (_event, isOpen: boolean) => {
    console.log('IPC Received: settings:toggle, isOpen:', isOpen);
    animateSettingsTransition(isOpen);
    if (!isOpen) {
      const activeView = state.accountViews.get(state.activeAccountId);
      if (activeView && !activeView.webContents.isDestroyed()) {
        activeView.webContents.focus();
      }
    }
  });

  ipcMain.on('disclaimer:toggle', (_event, isOpen: boolean) => {
    console.log('IPC Received: disclaimer:toggle, isOpen:', isOpen);
    state.disclaimerOpen = isOpen;
    updateActiveViewBounds();
    if (!isOpen) {
      const activeView = state.accountViews.get(state.activeAccountId);
      if (activeView && !activeView.webContents.isDestroyed()) {
        activeView.webContents.focus();
      }
    }
  });

  ipcMain.on('protocol:toggle-prompt', (_event, isOpen: boolean) => {
    console.log('IPC Received: protocol:toggle-prompt, isOpen:', isOpen);
    state.protocolPromptOpen = isOpen;
    updateActiveViewBounds();
    if (!isOpen) {
      const activeView = state.accountViews.get(state.activeAccountId);
      if (activeView && !activeView.webContents.isDestroyed()) {
        activeView.webContents.focus();
      }
    }
  });

  ipcMain.on('devtools:toggle-wallie', () => {
    console.log('IPC Received: devtools:toggle-wallie');
    if (state.mainWindow) {
      if (state.mainWindow.webContents.isDevToolsOpened()) {
        state.mainWindow.webContents.closeDevTools();
      } else {
        state.mainWindow.webContents.openDevTools({ mode: 'detach' });
      }
    }
  });

  ipcMain.handle('account:get-all', () => state.accounts);
  ipcMain.handle('account:get-active-id', () => state.activeAccountId);
  
  ipcMain.on('account:switch', async (_event, id: string) => {
    await switchActiveAccount(id);
  });

  ipcMain.on('zoom:reset', () => {
    const activeContents = getActiveWebContents();
    if (activeContents) {
      resetZoom(activeContents);
    }
  });

  ipcMain.on('account:reload-active', () => {
    const activeView = state.accountViews.get(state.activeAccountId);
    if (activeView) {
      console.log(`Reloading active view for account: ${state.activeAccountId}`);
      activeView.webContents.reload();
    }
  });

  ipcMain.on('account:reload', (_event, accountId: string) => {
    const view = state.accountViews.get(accountId);
    if (view) {
      console.log(`Reloading view for account: ${accountId}`);
      view.webContents.reload();
    }
  });

  ipcMain.on('app:relaunch', () => {
    console.log('IPC Received: app:relaunch. Relaunching application.');
    app.relaunch();
    app.exit(0);
  });

  ipcMain.handle('account:add', async (_event, customName?: string) => {
    const newIndex = state.accounts.length + 1;
    const newId = `acc_${Date.now()}`;
    const newAccount: Account = {
      id: newId,
      name: customName || `Account ${newIndex}`,
      partition: `persist:account_${newId}`,
      unreadCount: 0,
      loggedIn: false,
      extensions: [],
      emoji: '',
    };
    state.accounts.push(newAccount);
    await saveAccounts();
    await switchActiveAccount(newAccount.id);
    return newAccount;
  });

  ipcMain.handle('account:rename', (_event, id: string, newName: string) => {
    console.log('IPC Handle: account:rename');
    const account = state.accounts.find((a) => a.id === id);
    if (account) {
      account.name = newName;
      saveAccounts();
      state.mainWindow?.webContents.send('account:list-changed', state.accounts, state.activeAccountId);

      const devtoolsWin = state.devtoolsWindows.get(id);
      if (devtoolsWin && !devtoolsWin.isDestroyed()) {
        devtoolsWin.setTitle(`DevTools - ${newName}`);
        devtoolsWin.webContents.executeJavaScript(`
          const badgeEl = document.querySelector('.titlebar-left-badge');
          if (badgeEl) badgeEl.textContent = ${JSON.stringify(newName)};
          document.title = 'DevTools - ' + ${JSON.stringify(newName)};
          const metaEl = document.querySelector('meta[name="account-name"]');
          if (metaEl) metaEl.setAttribute('content', encodeURIComponent(${JSON.stringify(newName)}));
        `).catch((err) => console.error('Failed to update devtools window title:', err));
      }

      return true;
    }
    return false;
  });

  ipcMain.handle('account:update-emoji', (_event, id: string, emoji: string) => {
    const account = state.accounts.find((a) => a.id === id);
    if (account) {
      account.emoji = emoji;
      saveAccounts();
      state.mainWindow?.webContents.send('account:list-changed', state.accounts, state.activeAccountId);
      return true;
    }
    return false;
  });

  ipcMain.handle('account:remove', async (_event, id: string) => {
    return await removeAccountLogic(id);
  });

  ipcMain.on('account:context-menu', (event, accountId: string) => {
    const account = state.accounts.find((a) => a.id === accountId);
    if (!account) return;

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
      {
        label: 'Remove Account',
        enabled: state.accounts.length > 1,
        click: async () => {
          await removeAccountLogic(accountId);
        },
      },
    ]);

    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    menu.popup({ window: targetWindow || undefined });
  });

  // Extension Engine Handlers
  ipcMain.handle('extension:import', async (_event, accountId: string, importType: 'folder' | 'archive') => {
    return await importExtension(accountId, importType);
  });

  ipcMain.on('webstore:open', (_event, accountId: string) => {
    const cwsWin = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.cjs'),
        partition: 'persist:webstore',
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
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

  ipcMain.handle('webstore:check-installed', (_event, accountId: string, extensionId: string) => {
    const account = state.accounts.find((a) => a.id === accountId);
    if (!account || !account.extensions) return false;
    return account.extensions.some((ext) => ext.id === extensionId);
  });

  ipcMain.handle('extension:install-webstore', async (_event, accountId: string, urlOrId: string) => {
    return await installWebStoreExtension(accountId, urlOrId);
  });

  ipcMain.handle('extension:toggle', async (_event, accountId: string, extensionId: string, enabled: boolean) => {
    return await toggleExtension(accountId, extensionId, enabled);
  });

  ipcMain.handle('extension:remove', async (_event, accountId: string, extensionId: string) => {
    return await removeExtension(accountId, extensionId);
  });

  // Storage Handlers
  ipcMain.handle('account:get-storage-sizes', async (_event, accountId: string) => {
    const account = state.accounts.find((a) => a.id === accountId);
    if (!account) return { cache: 0, localStorage: 0, indexedDb: 0, cookies: 0 };
    return await getAccountStorageSizes(account.partition);
  });

  ipcMain.handle('account:clear-storage', async (_event, accountId: string, type: 'cache' | 'media') => {
    const account = state.accounts.find((a) => a.id === accountId);
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
        await accountSession.clearStorageData({
          storages: ['filesystem', 'websql'],
        });
        console.log(`Filesystem and WebSQL cleared for account: ${accountId}`);

        let view = state.accountViews.get(accountId);
        if (!view) {
          const acc = state.accounts.find((a) => a.id === accountId);
          if (acc) {
            view = await createAccountView(acc);
            state.accountViews.set(accountId, view);
          }
        }

        if (view) {
          const runClear = async () => {
            const clearScript = `
              (async () => {
                try {
                  if (!window.indexedDB || !window.indexedDB.databases) return false;
                  const dbs = await window.indexedDB.databases();
                  const keptDbs = ['wawc', 'signal-storage'];
                  for (const db of dbs) {
                    if (db.name && !keptDbs.includes(db.name)) {
                      window.indexedDB.deleteDatabase(db.name);
                    }
                  }
                  return true;
                } catch (err) {
                  return false;
                }
              })()
            `;
            try {
              await view.webContents.executeJavaScript(clearScript);
            } catch (err) {
              console.error('Failed to run selective IndexedDB clear:', err);
            }
          };

          if (view.webContents.isLoading()) {
            view.webContents.once('dom-ready', runClear);
          } else {
            await runClear();
          }
        }
        console.log(`Selective IndexedDB clear initiated for account: ${accountId}`);
      }

      invalidateStorageCache(account.partition);
      return true;
    } catch (error) {
      console.error(`Failed to clear storage for account ${accountId} (type: ${type}):`, error);
      return false;
    }
  });

  // Settings Handlers
  ipcMain.handle('settings:get-global', () => state.globalSettings);

  ipcMain.handle('settings:save-global', async (_event, newSettings: GlobalSettings) => {
    if (!state.globalSettings) return false;
    const disclaimerJustAccepted = newSettings.disclaimerAccepted && !state.globalSettings.disclaimerAccepted;
    state.globalSettings = newSettings;
    await saveSettings(state.globalSettings);
    state.mainWindow?.webContents.send('settings:global-changed', state.globalSettings);
    
    if (disclaimerJustAccepted) {
      console.log('Legal disclaimer accepted. Initializing account views.');
      await initializeAccountsLoad();
    }
    return true;
  });

  ipcMain.handle('account:update-settings', (_event, accountId: string, settings: Account['settings']) => {
    const account = state.accounts.find((a) => a.id === accountId);
    if (account) {
      account.settings = settings;
      saveAccounts();
      state.mainWindow?.webContents.send('account:list-changed', state.accounts, state.activeAccountId);
      return true;
    }
    return false;
  });

  ipcMain.handle('account:save-css', (_event, accountId: string, customCss: string, selectedTheme: string) => {
    const account = state.accounts.find((a) => a.id === accountId);
    if (account) {
      if (!account.settings) {
        account.settings = { ...DEFAULT_ACCOUNT_SETTINGS };
      }
      account.settings.customCss = customCss;
      account.settings.selectedTheme = selectedTheme;
      saveAccounts();

      const view = state.accountViews.get(accountId);
      if (view) {
        injectCustomCssForView(accountId, view.webContents);
      }
      return true;
    }
    return false;
  });

  ipcMain.on('devtools:toggle', () => {
    console.log('IPC Received: devtools:toggle');
    if (state.activeAccountId && state.accountViews.has(state.activeAccountId)) {
      toggleDevToolsForAccount(state.activeAccountId);
    } else {
      if (state.mainWindow?.webContents.isDevToolsOpened()) {
        state.mainWindow.webContents.closeDevTools();
      } else {
        state.mainWindow?.webContents.openDevTools({ mode: 'detach' });
      }
    }
  });

  // Notification Handlers
  ipcMain.on('notification:create', async (event, data: { title: string; body: string; icon: string; tag: string }) => {
    await createNotification(data, event.sender);
  });

  ipcMain.on('notification:create-log-entry', async (event, data: { title: string; body: string }) => {
    await createLogEntry(data, event.sender);
  });

  ipcMain.on('webview:clicked', () => {
    if (state.settingsOpen && state.mainWindow) {
      state.mainWindow.webContents.send('settings:close-request');
    }
  });

  ipcMain.on('notification:close-request', (_event, tag: string) => {
    // Optional tag mapping close
  });

  ipcMain.handle('notification:get-history', () => {
    return getNotificationHistory();
  });

  ipcMain.handle('notification:clear-history', () => {
    clearNotificationHistoryCache();
    return true;
  });

  // Custom Protocol URL Handlers
  ipcMain.on('protocol:ready', () => {
    if (state.pendingProtocolUrl) {
      console.log(`Sending pending protocol URL to ready renderer: ${state.pendingProtocolUrl}`);
      state.mainWindow?.webContents.send('protocol:received-url', state.pendingProtocolUrl);
      state.pendingProtocolUrl = null;
    }
  });

  ipcMain.on('protocol:handle-url', async (_event, accountId: string, urlStr: string) => {
    console.log(`Handling custom protocol URL for account ${accountId}: ${urlStr}`);
    try {
      const url = new URL(urlStr);
      let waPath = '/';
      if (url.hostname === 'send') {
        waPath = '/send' + url.search;
      } else if (url.pathname.startsWith('/send')) {
        waPath = url.pathname + url.search;
      }
      const targetUrl = `https://web.whatsapp.com${waPath}`;
      
      await switchActiveAccount(accountId);
      
      const targetView = state.accountViews.get(accountId);
      if (targetView) {
        targetView.webContents.loadURL(targetUrl);
      }
    } catch (error) {
      console.error('Failed to handle custom protocol redirection:', error);
    }
  });
}
