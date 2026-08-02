import { app, BrowserWindow, WebContentsView, Tray, Menu, nativeImage, Notification, session, dialog, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { state } from './state';
import { getAppIcon, isWhatsAppUrl } from './utils';
import { createAccountView, pauseAllMedia, injectCustomCssForView, registerZoomShortcuts, registerContextMenu } from './views';
import { safeDeleteExtensionDir } from './extensions';
import { saveSettings, saveAccounts, ACCOUNTS_FILE } from './config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TITLEBAR_HEIGHT = 28;
const DRAWER_WIDTH = 450;

let animationInterval: NodeJS.Timeout | null = null;
let resizeTimeout: NodeJS.Timeout | null = null;

function solveCubicBezier(p1x: number, p1y: number, p2x: number, p2y: number) {
  const cx = 3.0 * p1x;
  const bx = 3.0 * (p2x - p1x) - cx;
  const ax = 1.0 - cx - bx;

  const cy = 3.0 * p1y;
  const by = 3.0 * (p2y - p1y) - cy;
  const ay = 1.0 - cy - by;

  function sampleCurveX(t: number) {
    return ((ax * t + bx) * t + cx) * t;
  }

  function sampleCurveY(t: number) {
    return ((ay * t + by) * t + cy) * t;
  }

  function sampleCurveDerivativeX(t: number) {
    return (3.0 * ax * t + 2.0 * bx) * t + cx;
  }

  function solveCurveX(x: number, epsilon = 1e-5) {
    let t2 = x;
    for (let i = 0; i < 8; i++) {
      const x2 = sampleCurveX(t2) - x;
      if (Math.abs(x2) < epsilon) return t2;
      const d2 = sampleCurveDerivativeX(t2);
      if (Math.abs(d2) < 1e-6) break;
      t2 = t2 - x2 / d2;
    }
    let t0 = 0.0;
    let t1 = 1.0;
    t2 = x;
    if (t2 < t0) return t0;
    if (t2 > t1) return t1;
    while (t0 < t1) {
      const x2 = sampleCurveX(t2);
      if (Math.abs(x2 - x) < epsilon) return t2;
      if (x > x2) t0 = t2;
      else t1 = t2;
      t2 = (t1 - t0) * 0.5 + t0;
    }
    return t2;
  }

  return function (x: number) {
    return sampleCurveY(solveCurveX(x));
  };
}

const win10Easing = solveCubicBezier(0.1, 0.9, 0.2, 1);

/**
 * Calculates initial window dimensions, ensuring the window fits within
 * the available display work area (avoiding taskbar/dock clipping and multi-monitor overflow).
 */
export function getInitialWindowSize(
  targetWidth: number,
  targetHeight: number,
  referenceWindow?: BrowserWindow | null,
  maxRatio = 0.9
): { width: number; height: number } {
  try {
    const electronScreen = screen as unknown as Electron.Screen;
    let display = electronScreen.getPrimaryDisplay();
    if (referenceWindow && !referenceWindow.isDestroyed()) {
      display = electronScreen.getDisplayMatching(referenceWindow.getBounds());
    }

    const { width: workWidth, height: workHeight } = display.workAreaSize;
    const maxWidth = Math.floor(workWidth * maxRatio);
    const maxHeight = Math.floor(workHeight * maxRatio);

    return {
      width: Math.max(360, Math.min(targetWidth, maxWidth)),
      height: Math.max(360, Math.min(targetHeight, maxHeight)),
    };
  } catch (err) {
    console.error('Failed to calculate initial window size:', err);
    return { width: targetWidth, height: targetHeight };
  }
}

export function updateActiveViewBounds(isFromAnimation = false) {
  if (!state.mainWindow || state.mainWindow.isDestroyed()) return;

  if (animationInterval && !isFromAnimation) {
    clearInterval(animationInterval);
    animationInterval = null;
  }

  const [width, height] = state.mainWindow.getContentSize();
  const activeView = state.accountViews.get(state.activeAccountId);

  if (activeView) {
    if (state.disclaimerOpen || state.protocolPromptOpen) {
      activeView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    } else {
      const viewWidth = width - state.settingsDrawerWidth;
      activeView.setBounds({
        x: 0,
        y: TITLEBAR_HEIGHT,
        width: Math.max(0, viewWidth),
        height: Math.max(0, height - TITLEBAR_HEIGHT),
      });
    }
  }

  if (resizeTimeout) {
    clearTimeout(resizeTimeout);
  }

  resizeTimeout = setTimeout(() => {
    if (!state.mainWindow || state.mainWindow.isDestroyed()) return;

    const [w, h] = state.mainWindow.getContentSize();
    const aView = state.accountViews.get(state.activeAccountId);

    if (aView) {
      if (state.disclaimerOpen || state.protocolPromptOpen) {
        aView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      } else {
        const vWidth = w - state.settingsDrawerWidth;
        aView.setBounds({
          x: 0,
          y: TITLEBAR_HEIGHT,
          width: Math.max(0, vWidth),
          height: Math.max(0, h - TITLEBAR_HEIGHT),
        });
      }
    }
    resizeTimeout = null;
  }, 50);
}

export async function switchActiveAccount(newAccountId: string) {
  if (!state.mainWindow || state.mainWindow.isDestroyed()) return;

  const currentView = state.accountViews.get(state.activeAccountId);
  if (currentView) {
    state.mainWindow.contentView.removeChildView(currentView);
    if (!currentView.webContents.isDestroyed()) {
      currentView.webContents.setFrameRate(5);
    }
  }

  state.activeAccountId = newAccountId;
  let targetView = state.accountViews.get(newAccountId);

  if (!targetView) {
    const acc = state.accounts.find((a) => a.id === newAccountId);
    if (acc) {
      targetView = await createAccountView(acc);
      state.accountViews.set(newAccountId, targetView);
    }
  }

  if (targetView) {
    state.mainWindow.contentView.addChildView(targetView);
    if (!targetView.webContents.isDestroyed()) {
      targetView.webContents.setFrameRate(60);
    }
    updateActiveViewBounds();

    if (!targetView.webContents.isDestroyed()) {
      targetView.webContents.focus();
    }

    injectCustomCssForView(newAccountId, targetView.webContents);

    const zoomPercent = Math.round(targetView.webContents.getZoomFactor() * 100);
    state.mainWindow.webContents.send('zoom:changed', zoomPercent);
  }

  state.mainWindow.webContents.send('account:list-changed', state.accounts, state.activeAccountId);
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
          if (!view.webContents.isDestroyed()) {
            view.webContents.setFrameRate(5);
          }
          console.log(`Preloaded account: ${account.name} (${account.id})`);
        }).catch((err) => {
          console.error(`Failed to preload account ${account.name}:`, err);
        });
      }
    }
  }
}

export function animateSettingsTransition(targetOpen: boolean) {
  if (!state.mainWindow || state.mainWindow.isDestroyed()) return;

  if (animationInterval) {
    clearInterval(animationInterval);
    animationInterval = null;
  }

  state.settingsOpen = targetOpen;

  const startWidth = state.settingsDrawerWidth;
  const endWidth = targetOpen ? DRAWER_WIDTH : 0;
  const duration = 300;
  const startTime = Date.now();

  animationInterval = setInterval(() => {
    if (!state.mainWindow || state.mainWindow.isDestroyed()) {
      if (animationInterval) clearInterval(animationInterval);
      animationInterval = null;
      return;
    }

    const elapsed = Date.now() - startTime;
    const progress = Math.min(1, elapsed / duration);
    const easedProgress = win10Easing(progress);

    state.settingsDrawerWidth = startWidth + (endWidth - startWidth) * easedProgress;
    updateActiveViewBounds(true);

    if (progress >= 1) {
      if (animationInterval) clearInterval(animationInterval);
      animationInterval = null;
    }
  }, 8);
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
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    state.mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    state.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  registerContextMenu(state.mainWindow.webContents);

  state.mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer Console] [Level ${level}] ${message} (at ${sourceId}:${line})`);
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
    if (!state.disclaimerOpen && !state.protocolPromptOpen && !state.settingsOpen) {
      const activeView = state.accountViews.get(state.activeAccountId);
      if (activeView && !activeView.webContents.isDestroyed()) {
        activeView.webContents.focus();
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
        shell.openExternal(url).catch((err: any) => console.error('Failed to open external link:', err));
      }
    } catch (err: any) {
      event.preventDefault();
      shell.openExternal(url).catch((err: any) => console.error('Failed to open external link:', err));
    }
  });

  state.mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url).catch((err: any) => console.error('Failed to open external link:', err));
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
  const account = state.accounts.find((a) => a.id === id);
  if (!account) return false;

  if (account.loggedIn && state.mainWindow) {
    const choice = await dialog.showMessageBox(state.mainWindow, {
      type: 'warning',
      buttons: ['Cancel', 'Remove'],
      defaultId: 0,
      cancelId: 0,
      title: 'Confirm Account Removal',
      message: `Are you sure you want to remove "${account.name}"?`,
      detail: 'This will log you out, clear all session cache and storage, and delete all imported extensions for this account.',
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
      } catch (e) {}
    }
    if (state.activeAccountId === id && state.mainWindow) {
      state.mainWindow.contentView.removeChildView(view);
    }
    state.accountViews.delete(id);
  }

  if (state.activeAccountId === id) {
    await switchActiveAccount(state.accounts[0].id);
  } else {
    state.mainWindow?.webContents.send('account:list-changed', state.accounts, state.activeAccountId);
  }
  return true;
}
