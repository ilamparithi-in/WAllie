import { ipcMain, BrowserWindow, session, Menu, app, dialog, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { state } from './state';
import { saveAccounts, saveSettings, getAccountStorageSizes, invalidateStorageCache } from './config';
import { importExtension, installWebStoreExtension, toggleExtension, removeExtension, checkForWebStoreUpdates } from './extensions';
import { createAccountView, getActiveWebContents, resetZoom, changeZoom, injectCustomCssForView, injectAccountStyling } from './views';
import { switchActiveAccount, updateActiveViewBounds, animateSettingsTransition, toggleDevToolsForAccount, removeAccountLogic, initializeAccountsLoad, getInitialWindowSize, unloadAccountLogic, loadAccountLogic, notifyAccountListChanged } from './window';
import { getNotificationHistory, clearNotificationHistoryCache, createNotification, createLogEntry, closeDbusNotificationByTag } from './notifications';
import { Account, GlobalSettings, DEFAULT_ACCOUNT_SETTINGS, AccountSettings } from '../shared/types';
import { getAccountById, focusActiveView, getPreloadPath, getAccountsWithLoadedStatus } from './utils';
import { downloadManager } from './downloads';

const execAsync = promisify(exec);

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

  ipcMain.on('account:focus-active', () => {
    focusActiveView();
  });

  ipcMain.on('settings:toggle', (_event, isOpen: boolean) => {
    console.log('IPC Received: settings:toggle, isOpen:', isOpen);
    animateSettingsTransition(isOpen);
    if (!isOpen) focusActiveView();
  });

  ipcMain.on('disclaimer:toggle', (_event, isOpen: boolean) => {
    console.log('IPC Received: disclaimer:toggle, isOpen:', isOpen);
    state.disclaimerOpen = isOpen;
    updateActiveViewBounds();
    if (!isOpen) focusActiveView();
  });

  ipcMain.on('protocol:toggle-prompt', (_event, isOpen: boolean) => {
    console.log('IPC Received: protocol:toggle-prompt, isOpen:', isOpen);
    state.protocolPromptOpen = isOpen;
    updateActiveViewBounds();
    if (!isOpen) focusActiveView();
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

  ipcMain.handle('account:get-all', () => getAccountsWithLoadedStatus());
  ipcMain.handle('account:get-active-id', () => state.activeAccountId);
  
  ipcMain.on('account:switch', async (_event, id: string) => {
    await switchActiveAccount(id);
  });

  ipcMain.handle('account:unload', async (_event, id: string) => {
    return await unloadAccountLogic(id);
  });

  ipcMain.handle('account:load', async (_event, id: string) => {
    return await loadAccountLogic(id);
  });

  ipcMain.on('zoom:reset', () => {
    const activeContents = getActiveWebContents();
    if (activeContents) {
      resetZoom(activeContents);
    }
  });

  ipcMain.on('zoom:trigger-step', (_event, direction: 'in' | 'out') => {
    if (state.globalSettings?.ctrlScrollZoomEnabled === false) return;
    const activeContents = getActiveWebContents();
    if (activeContents) {
      changeZoom(activeContents, direction);
    }
  });


  ipcMain.on('settings:reset-app-scale', async () => {
    if (!state.globalSettings) return;
    state.globalSettings.appScale = 100;
    await saveSettings(state.globalSettings);
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.mainWindow.webContents.setZoomFactor(1.0);
      state.mainWindow.webContents.send('settings:global-changed', state.globalSettings);
    }
    for (const view of state.accountViews.values()) {
      if (view && !view.webContents.isDestroyed()) {
        view.webContents.setZoomFactor(1.0);
      }
    }
    updateActiveViewBounds();
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
    if (typeof id !== 'string' || typeof newName !== 'string') return false;
    const sanitizedName = newName.trim().substring(0, 100);
    if (!sanitizedName) return false;
    const account = getAccountById(id);
    if (account) {
      account.name = sanitizedName;
      saveAccounts();
      notifyAccountListChanged();
      return true;
    }
    return false;
  });

  ipcMain.handle('account:update-emoji', (_event, id: string, emoji: string) => {
    if (typeof id !== 'string' || typeof emoji !== 'string') return false;
    const sanitizedEmoji = emoji.trim().substring(0, 20);
    const account = getAccountById(id);
    if (account) {
      account.emoji = sanitizedEmoji;
      saveAccounts();
      notifyAccountListChanged();
      return true;
    }
    return false;
  });

  ipcMain.handle('account:remove', async (_event, id: string) => {
    return await removeAccountLogic(id);
  });

  ipcMain.on('account:context-menu', (event, accountId: string) => {
    const account = getAccountById(accountId);
    if (!account) return;

    const isLoaded = state.accountViews.has(accountId) && !state.accountViews.get(accountId)?.webContents.isDestroyed();

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
    const { width, height } = getInitialWindowSize(1200, 800, state.mainWindow);
    const cwsWin = new BrowserWindow({
      width,
      height,
      webPreferences: {
        preload: getPreloadPath(),
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
    const account = getAccountById(accountId);
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

  ipcMain.handle('extension:check-updates', async (_event, accountId?: string) => {
    return await checkForWebStoreUpdates(accountId);
  });

  // Storage Handlers
  ipcMain.handle('account:get-storage-sizes', async (_event, accountId: string) => {
    const account = getAccountById(accountId);
    if (!account) return { cache: 0, localStorage: 0, indexedDb: 0, cookies: 0 };
    return await getAccountStorageSizes(account.partition);
  });

  ipcMain.handle('account:clear-storage', async (_event, accountId: string, type: 'cache' | 'media') => {
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
        if (state.mainWindow && !state.mainWindow.isDestroyed()) {
          const choice = await dialog.showMessageBox(state.mainWindow, {
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

  // Settings Handlers
  ipcMain.handle('settings:get-global', () => state.globalSettings);

  ipcMain.handle('settings:save-global', async (_event, newSettings: GlobalSettings) => {
    if (!state.globalSettings) return false;
    const oldScale = state.globalSettings.appScale || 100;
    const disclaimerJustAccepted = newSettings.disclaimerAccepted && !state.globalSettings.disclaimerAccepted;
    const scaleChanged = newSettings.appScale !== undefined && newSettings.appScale !== oldScale;

    state.globalSettings = newSettings;
    await saveSettings(state.globalSettings);

    const newBaseScale = (newSettings.appScale || 100) / 100;
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      try {
        state.mainWindow.webContents.setZoomFactor(newBaseScale);
      } catch (e) {}
      state.mainWindow.webContents.send('settings:global-changed', state.globalSettings);
    }
    
    if (scaleChanged) {
      for (const view of state.accountViews.values()) {
        if (view && !view.webContents.isDestroyed()) {
          try {
            const currentFactor = view.webContents.getZoomFactor();
            const relativeZoom = currentFactor / (oldScale / 100);
            view.webContents.setZoomFactor(newBaseScale * relativeZoom);
          } catch (e) {}
        }
      }
      updateActiveViewBounds();

      // Show native system dialog prompt for scale confirmation
      if (newSettings.appScale !== 100 && state.mainWindow && !state.mainWindow.isDestroyed()) {
        const targetWindow = state.mainWindow;
        setTimeout(async () => {
          try {
            const result = await dialog.showMessageBox(targetWindow, {
              type: 'question',
              buttons: ['Keep Scale', 'Revert Scale'],
              defaultId: 0,
              cancelId: 1,
              title: 'Confirm App Scale',
              message: `App Scale changed to ${newSettings.appScale}%`,
              detail: 'Does WAllie UI display properly at this scale level?',
              noLink: true,
            });

            if (result.response !== 0) { // Revert clicked or window closed
              console.log(`Reverting App Scale back to ${oldScale}%`);
              state.globalSettings!.appScale = oldScale;
              await saveSettings(state.globalSettings!);
              const revertedBaseScale = oldScale / 100;
              targetWindow.webContents.setZoomFactor(revertedBaseScale);
              targetWindow.webContents.send('settings:global-changed', state.globalSettings);
              for (const view of state.accountViews.values()) {
                if (view && !view.webContents.isDestroyed()) {
                  view.webContents.setZoomFactor(revertedBaseScale);
                }
              }
              updateActiveViewBounds();
            }
          } catch (err) {
            console.error('Error in scale confirmation dialog:', err);
          }
        }, 100);
      }
    }

    if (disclaimerJustAccepted) {
      console.log('Legal disclaimer accepted. Initializing account views.');
      await initializeAccountsLoad();
    }
    return true;
  });

  ipcMain.handle('account:update-settings', (_event, accountId: string, settings: Account['settings']) => {
    const account = getAccountById(accountId);
    if (account) {
      account.settings = settings;
      saveAccounts();
      state.mainWindow?.webContents.send('account:list-changed', state.accounts, state.activeAccountId);
      return true;
    }
    return false;
  });

  ipcMain.handle('account:save-css', (_event, accountId: string, customCss: string, selectedTheme: string) => {
    if (typeof accountId !== 'string' || typeof customCss !== 'string' || typeof selectedTheme !== 'string') return false;
    const safeCss = customCss.substring(0, 100000); // Limit CSS to 100KB
    const safeTheme = selectedTheme.substring(0, 100);
    const account = getAccountById(accountId);
    if (account) {
      if (!account.settings) {
        account.settings = { ...DEFAULT_ACCOUNT_SETTINGS };
      }
      account.settings.customCss = safeCss;
      account.settings.selectedTheme = safeTheme;
      saveAccounts();

      const view = state.accountViews.get(accountId);
      if (view) {
        injectAccountStyling(accountId, view.webContents);
      }
      return true;
    }
    return false;
  });

  ipcMain.handle('account:save-appearance', (_event, accountId: string, appearance: Partial<AccountSettings>) => {
    if (typeof accountId !== 'string' || !appearance || typeof appearance !== 'object') return false;
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
    if (typeof appearance.monoFontFamily === 'string') {
      account.settings.monoFontFamily = appearance.monoFontFamily.substring(0, 200);
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

  ipcMain.handle('wallpaper:select-file', async () => {
    if (!state.mainWindow || state.mainWindow.isDestroyed()) return null;
    const result = await dialog.showOpenDialog(state.mainWindow, {
      title: 'Choose Chat Wallpaper Image',
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] },
      ],
      properties: ['openFile'],
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    try {
      const image = nativeImage.createFromPath(filePath);
      if (image.isEmpty()) return null;

      const size = image.getSize();
      const maxEdge = 1920;
      let finalImage = image;

      if (size.width > maxEdge || size.height > maxEdge) {
        const scale = Math.min(maxEdge / size.width, maxEdge / size.height);
        finalImage = image.resize({
          width: Math.round(size.width * scale),
          height: Math.round(size.height * scale),
          quality: 'better',
        });
      }

      const jpegBuffer = finalImage.toJPEG(82);
      return `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;
    } catch (err) {
      console.error('Failed to process wallpaper image:', err);
      return null;
    }
  });

  ipcMain.handle('customcss:select-file', async () => {
    if (!state.mainWindow || state.mainWindow.isDestroyed()) return null;
    const result = await dialog.showOpenDialog(state.mainWindow, {
      title: 'Choose Custom CSS Stylesheet',
      filters: [
        { name: 'CSS Stylesheets', extensions: ['css'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return null;
    }

    try {
      const content = await fs.promises.readFile(result.filePaths[0], 'utf-8');
      return content.substring(0, 500000); // 500KB max
    } catch (err) {
      console.error('Failed to read custom CSS file:', err);
      return null;
    }
  });

  ipcMain.handle('system:get-fonts', async () => {
    try {
      const { stdout } = await execAsync('fc-list : family');
      const families = new Set<string>();
      stdout.split('\n').forEach((line) => {
        line.split(',').forEach((f) => {
          const trimmed = f.trim();
          if (trimmed && !trimmed.startsWith('.')) {
            families.add(trimmed);
          }
        });
      });
      return Array.from(families).sort((a, b) => a.localeCompare(b));
    } catch (err) {
      return [
        'Inter',
        'Roboto',
        'Open Sans',
        'Lato',
        'Montserrat',
        'Poppins',
        'Ubuntu',
        'Cantarell',
        'DejaVu Sans',
        'Fira Sans',
        'Segoe UI',
        'Helvetica Neue',
        'Arial',
        'sans-serif',
      ];
    }
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
  ipcMain.on('notification:create', async (event, data: { title: string; body: string; icon: string; tag: string; canReply?: boolean }) => {
    if (!data || typeof data !== 'object') return;
    const sanitizedData = {
      title: typeof data.title === 'string' ? data.title.substring(0, 300) : '',
      body: typeof data.body === 'string' ? data.body.substring(0, 1000) : '',
      icon: typeof data.icon === 'string' ? data.icon.substring(0, 500000) : '', // Max 500KB icon string
      tag: typeof data.tag === 'string' ? data.tag.substring(0, 100) : '',
      canReply: typeof data.canReply === 'boolean' ? data.canReply : true,
    };
    await createNotification(sanitizedData, event.sender);
  });

  ipcMain.on('notification:create-log-entry', async (event, data: { title: string; body: string }) => {
    await createLogEntry(data, event.sender);
  });

  ipcMain.on('webview:clicked', () => {
    if (state.settingsOpen && state.mainWindow) {
      state.mainWindow.webContents.send('settings:close-request');
    }
  });

  ipcMain.on('notification:close-request', (_event, _tag: string) => {
    // Intentionally no-op to prevent WhatsApp Web's browser auto-dismiss timer from
    // prematurely killing desktop notifications before the user can type a reply.
  });

  ipcMain.handle('notification:get-history', () => {
    return getNotificationHistory();
  });

  ipcMain.handle('notification:clear-history', (_event, options?: any) => {
    clearNotificationHistoryCache(options);
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

  // Download Manager Handlers
  ipcMain.handle('downloads:choose-folder', async () => {
    return downloadManager.chooseDownloadsFolder();
  });

  ipcMain.handle('downloads:open-file', async (_event, filePath: string) => {
    return downloadManager.openDownloadedFile(filePath);
  });

  ipcMain.handle('downloads:show-in-folder', (_event, filePath: string) => {
    return downloadManager.showItemInFolder(filePath);
  });

  ipcMain.handle('downloads:get-history', () => {
    return downloadManager.getHistory();
  });

  ipcMain.handle('downloads:clear-history', async () => {
    return downloadManager.clearHistory();
  });

  ipcMain.on('download:set-intent', (_event, data: { intent: any; filename?: string }) => {
    downloadManager.setIntent(data.intent, data.filename);
  });

  // App Version Info Handler
  ipcMain.handle('app:get-version-info', () => {
    if (typeof __APP_VERSION_INFO__ !== 'undefined' && __APP_VERSION_INFO__) {
      return __APP_VERSION_INFO__;
    }
    return {
      version: app.getVersion(),
      displayVersion: `v${app.getVersion()}`,
      commitHash: 'unknown',
      commitCount: 0,
      baseVersion: app.getVersion(),
      targetVersion: app.getVersion(),
      isRelease: true,
      isDirty: false,
      buildDate: new Date().toISOString(),
    };
  });
}
