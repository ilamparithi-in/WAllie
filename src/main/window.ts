import { app, BrowserWindow, WebContentsView, Tray, Menu, nativeImage, Notification, session, dialog, shell, screen } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { state } from './state';
import { getAppIcon, isWhatsAppUrl, getAccountById, getAccountsWithLoadedStatus, getPreloadPath, getInitialWindowSize } from './utils';
import { createAccountView, pauseAllMedia, injectCustomCssForView, registerZoomShortcuts, registerContextMenu, handleExternalLinkClick } from './views';
import { safeDeleteExtensionDir } from './extensions';
import { saveSettings, saveAccounts, ACCOUNTS_FILE } from './config';
import { TITLEBAR_HEIGHT } from '../shared/constants';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DRAWER_WIDTH = 450;

let closeTimeout: NodeJS.Timeout | null = null;
let resizeTimeout: NodeJS.Timeout | null = null;

export { getInitialWindowSize };

export function applyActiveViewBoundsImmediately(aView: WebContentsView) {
  if (!state.mainWindow || state.mainWindow.isDestroyed() || !aView) return;
  const [w, h] = state.mainWindow.getContentSize();
  if (state.disclaimerOpen || state.protocolPromptOpen) {
    aView.setVisible(false);
  } else {
    const scaleFactor = (state.globalSettings?.appScale || 100) / 100;
    const scaledTitlebarHeight = Math.round(TITLEBAR_HEIGHT * scaleFactor);
    const scaledDrawerWidth = Math.round(state.settingsDrawerWidth * scaleFactor);
    const vWidth = w - scaledDrawerWidth;

    aView.setVisible(true);
    aView.setBounds({
      x: 0,
      y: scaledTitlebarHeight,
      width: Math.max(0, vWidth),
      height: Math.max(0, h - scaledTitlebarHeight),
    });
    if (!aView.webContents.isDestroyed()) {
      aView.webContents.invalidate();
    }
  }
}

export function updateActiveViewBounds() {
  if (!state.mainWindow || state.mainWindow.isDestroyed()) return;

  if (resizeTimeout) {
    clearTimeout(resizeTimeout);
  }

  resizeTimeout = setTimeout(() => {
    if (!state.mainWindow || state.mainWindow.isDestroyed()) return;
    const aView = state.accountViews.get(state.activeAccountId);
    if (aView) {
      applyActiveViewBoundsImmediately(aView);
    }
    resizeTimeout = null;
  }, 50);
}

export async function switchActiveAccount(newAccountId: string) {
  if (!state.mainWindow || state.mainWindow.isDestroyed()) return;

  const currentView = state.accountViews.get(state.activeAccountId);
  if (state.activeAccountId === newAccountId && currentView) {
    currentView.setVisible(true);
    applyActiveViewBoundsImmediately(currentView);
    if (!currentView.webContents.isDestroyed()) {
      currentView.webContents.focus();
    }
    return;
  }

  // Hide the previous active view cleanly without detaching from the window composition
  if (currentView && currentView !== state.accountViews.get(newAccountId)) {
    currentView.setVisible(false);
  }

  state.activeAccountId = newAccountId;
  let targetView = state.accountViews.get(newAccountId);

  if (!targetView) {
    const acc = getAccountById(newAccountId);
    if (acc) {
      targetView = await createAccountView(acc);
      state.accountViews.set(newAccountId, targetView);
    }
  }

  if (targetView) {
    // Add or bring the target view to the top of the stack
    state.mainWindow.contentView.addChildView(targetView);
    targetView.setVisible(true);
    applyActiveViewBoundsImmediately(targetView);
    updateActiveViewBounds();

    if (!targetView.webContents.isDestroyed()) {
      targetView.webContents.focus();
    }

    injectCustomCssForView(newAccountId, targetView.webContents);

    const zoomPercent = Math.round(targetView.webContents.getZoomFactor() * 100);
    state.mainWindow.webContents.send('zoom:changed', zoomPercent);
  }

  notifyAccountListChanged();
}

export async function initializeAccountsLoad() {
  await switchActiveAccount(state.activeAccountId);

  const preloadIds = state.globalSettings?.preloadAccountIds || [];
  if (preloadIds.length > 0) {
    console.log('Preloading configured accounts in the background...', preloadIds);
    for (const account of state.accounts) {
      if (account.id !== state.activeAccountId && !state.accountViews.has(account.id) && preloadIds.includes(account.id)) {
        createAccountView(account).then((view) => {
          state.accountViews.set(account.id, view);
          if (state.mainWindow && !state.mainWindow.isDestroyed()) {
            state.mainWindow.contentView.addChildView(view);
            view.setVisible(false);
          }
          console.log(`Preloaded account: ${account.name} (${account.id})`);
          notifyAccountListChanged();
        }).catch((err) => {
          console.error(`Failed to preload account ${account.name}:`, err);
        });
      }
    }
  }
}

export function animateSettingsTransition(targetOpen: boolean) {
  if (!state.mainWindow || state.mainWindow.isDestroyed()) return;

  if (closeTimeout) {
    clearTimeout(closeTimeout);
    closeTimeout = null;
  }

  if (resizeTimeout) {
    clearTimeout(resizeTimeout);
    resizeTimeout = null;
  }

  state.settingsOpen = targetOpen;
  state.settingsDrawerWidth = targetOpen ? DRAWER_WIDTH : 0;

  const aView = state.accountViews.get(state.activeAccountId);
  if (aView) {
    applyActiveViewBoundsImmediately(aView);
  } else {
    updateActiveViewBounds();
  }
}

export function createMainWindow() {
  const { width, height } = getInitialWindowSize(1100, 750);
  state.mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 700,
    minHeight: 500,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#111b21',
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      visualZoom: false,
    } as any,
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    state.mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    state.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  registerContextMenu(state.mainWindow.webContents);

  state.mainWindow.webContents.on('console-message', (event) => {
    console.log(`[Renderer Console] [${event.level}] ${event.message} (at ${event.sourceId}:${event.lineNumber})`);
  });

  state.mainWindow.once('ready-to-show', async () => {
    console.log('Main window ready-to-show, activeAccountId:', state.activeAccountId);
    if (!state.globalSettings?.startMinimized) {
      state.mainWindow?.show();
    } else {
      setTimeout(() => {
        if (Notification.isSupported()) {
          const icon = getAppIcon();
          const notification = new Notification({
            title: 'WAllie',
            body: 'WAllie started minimized to the system tray.',
            icon: icon,
          });
          notification.on('click', () => {
            state.mainWindow?.show();
            state.mainWindow?.focus();
          });
          notification.show();
        }
      }, 1000);
    }

    if (state.globalSettings?.disclaimerAccepted) {
      await initializeAccountsLoad();
    } else {
      console.log('Legal disclaimer not yet accepted. Deferring account view load.');
    }
  });

  state.mainWindow.on('focus', () => {
    const activeView = state.accountViews.get(state.activeAccountId);
    if (activeView && !activeView.webContents.isDestroyed()) {
      if (!state.disclaimerOpen && !state.protocolPromptOpen) {
        activeView.webContents.focus();
      }
    }
  });

  state.mainWindow.on('show', () => {
    const activeView = state.accountViews.get(state.activeAccountId);
    if (activeView && !activeView.webContents.isDestroyed()) {
      applyActiveViewBoundsImmediately(activeView);
    }
  });

  state.mainWindow.on('blur', () => {
    for (const view of state.accountViews.values()) {
      if (view && !view.webContents.isDestroyed()) {
        view.webContents.send('zoom:ctrl-state-changed', false);
      }
    }
  });

  registerZoomShortcuts(state.mainWindow.webContents);

  state.mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const parsedUrl = new URL(url);
      const isLocalHost = parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1';
      const isAppUrl = process.env.VITE_DEV_SERVER_URL
        ? url.startsWith(process.env.VITE_DEV_SERVER_URL)
        : url.startsWith('file://');
      if (!isAppUrl && !isLocalHost) {
        event.preventDefault();
        handleExternalLinkClick(url);
      }
    } catch (err: any) {
      event.preventDefault();
      handleExternalLinkClick(url);
    }
  });

  state.mainWindow.webContents.setWindowOpenHandler((details) => {
    handleExternalLinkClick(details.url);
    return { action: 'deny' };
  });

  state.mainWindow.on('resize', updateActiveViewBounds);

  state.mainWindow.on('maximize', () => {
    state.mainWindow?.webContents.send('window:maximized-changed', true);
    setTimeout(updateActiveViewBounds, 100);
  });

  state.mainWindow.on('unmaximize', () => {
    state.mainWindow?.webContents.send('window:maximized-changed', false);
    setTimeout(updateActiveViewBounds, 100);
  });

  state.mainWindow.on('close', (event) => {
    if (state.mainWindow && !(app as any).isQuitting && !state.isQuitting) {
      if (state.globalSettings?.closeToTray) {
        event.preventDefault();
        state.mainWindow.hide();
        if (Notification.isSupported()) {
          const icon = getAppIcon();
          const notification = new Notification({
            title: 'WAllie',
            body: 'WAllie minimized to the system tray and is still running.',
            icon: icon,
          });
          notification.on('click', () => {
            state.mainWindow?.show();
            state.mainWindow?.focus();
          });
          notification.show();
        }
      } else {
        (app as any).isQuitting = true;
        state.isQuitting = true;
        app.quit();
      }
    }
  });
}

export function createTray() {
  const icon = getAppIcon({ width: 16, height: 16 });

  state.tray = new Tray(icon);
  state.tray.setToolTip('WAllie');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show WhatsApp',
      click: () => {
        state.mainWindow?.show();
        state.mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        (app as any).isQuitting = true;
        state.isQuitting = true;
        app.quit();
      },
    },
  ]);

  state.tray.setContextMenu(contextMenu);
  state.tray.on('click', () => {
    if (state.mainWindow?.isVisible()) {
      state.mainWindow.hide();
    } else {
      state.mainWindow?.show();
      state.mainWindow?.focus();
    }
  });
}

export function toggleDevToolsForAccount(accountId: string) {
  const view = state.accountViews.get(accountId);
  if (!view || view.webContents.isDestroyed()) return;

  if (view.webContents.isDevToolsOpened()) {
    view.webContents.closeDevTools();
  } else {
    view.webContents.openDevTools({ mode: 'detach' });
  }
}

export async function removeAccountLogic(id: string): Promise<boolean> {
  if (state.accounts.length <= 1) return false;
  const account = getAccountById(id);
  if (!account) return false;

  if (state.mainWindow) {
    const choice = await dialog.showMessageBox(state.mainWindow, {
      type: 'warning',
      buttons: ['Cancel', 'Remove'],
      defaultId: 0,
      cancelId: 0,
      title: 'Confirm Account Removal',
      message: `Are you sure you want to remove "${account.name}"?`,
      detail: 'This will clear all session storage, account settings, and delete all imported extensions for this account.',
    });

    if (choice.response !== 1) {
      return false;
    }
  }

  if (account.extensions && account.extensions.length > 0) {
    for (const ext of account.extensions) {
      try {
        safeDeleteExtensionDir(ext.path);
      } catch (err) {
        console.error(`Failed to delete extension directory ${ext.path}:`, err);
      }
    }
  }

  const accountSession = session.fromPartition(account.partition);
  try {
    await accountSession.clearStorageData();
  } catch (err) {
    console.error(`Failed to clear session storage:`, err);
  }

  state.accounts = state.accounts.filter((a) => a.id !== id);
  await saveAccounts();

  const view = state.accountViews.get(id);
  if (view) {
    if (!view.webContents.isDestroyed()) {
      try {
        view.webContents.closeDevTools();
      } catch (e) { }
    }
    if (state.activeAccountId === id && state.mainWindow) {
      state.mainWindow.contentView.removeChildView(view);
    }
    state.accountViews.delete(id);
  }

  if (state.activeAccountId === id) {
    await switchActiveAccount(state.accounts[0].id);
  } else {
    notifyAccountListChanged();
  }
  return true;
}

export function notifyAccountListChanged() {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('account:list-changed', getAccountsWithLoadedStatus(), state.activeAccountId);
  }
}

export async function unloadAccountLogic(id: string): Promise<boolean> {
  const account = getAccountById(id);
  if (!account) return false;

  const view = state.accountViews.get(id);
  if (view) {
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      try {
        state.mainWindow.contentView.removeChildView(view);
      } catch (e) { }
    }
    if (!view.webContents.isDestroyed()) {
      try {
        view.webContents.closeDevTools();
      } catch (e) { }
      try {
        (view.webContents as any).destroy();
      } catch (e) { }
    }
    state.accountViews.delete(id);
  }

  notifyAccountListChanged();
  return true;
}

export async function loadAccountLogic(id: string): Promise<boolean> {
  const account = getAccountById(id);
  if (!account) return false;

  if (state.accountViews.has(id) && !state.accountViews.get(id)?.webContents.isDestroyed()) {
    return true;
  }

  if (state.activeAccountId === id) {
    await switchActiveAccount(id);
  } else {
    try {
      const view = await createAccountView(account);
      state.accountViews.set(id, view);
      if (state.mainWindow && !state.mainWindow.isDestroyed()) {
        state.mainWindow.contentView.addChildView(view);
        view.setVisible(false);
      }
      notifyAccountListChanged();
    } catch (err) {
      console.error(`Failed to load account ${account.name}:`, err);
      return false;
    }
  }
  return true;
}
