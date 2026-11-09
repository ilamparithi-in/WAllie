import { ipcMain, BrowserWindow, app } from 'electron';
import { state } from '../state';
import {
  getInitialWindowSize,
  enforceWindowMinimumSize,
  updateActiveViewBounds,
} from '../window';
import { saveWindowStateImmediate } from '../windowState';
import { getActiveWebContents, resetZoom, changeZoom } from '../views';
import { validate, zoomDirectionSchema } from './schemas';

export function registerWindowHandlers(): void {
  ipcMain.on('window:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      win.minimize();
    } else {
      state.mainWindow?.minimize();
    }
  });

  ipcMain.on('window:maximize', (event) => {
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
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      win.close();
    } else if (state.mainWindow) {
      state.mainWindow.close();
    }
  });

  ipcMain.handle('window:isMaximized', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win?.isMaximized() ?? false;
  });

  ipcMain.handle('window:reset-size', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || state.mainWindow;
    if (!win || win.isDestroyed()) return false;
    if (win.isMaximized()) {
      win.unmaximize();
    }
    const { width, height } = getInitialWindowSize(1100, 750, win);
    win.setSize(width, height);
    win.center();
    enforceWindowMinimumSize(win);
    saveWindowStateImmediate(win);
    return true;
  });

  ipcMain.on('window:toggle-always-on-top', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      const isAlwaysOnTop = !win.isAlwaysOnTop();
      win.setAlwaysOnTop(isAlwaysOnTop, 'screen-saver');
      event.sender.send('window:always-on-top-changed', isAlwaysOnTop);
    }
  });

  ipcMain.handle('window:get-always-on-top', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win?.isAlwaysOnTop() ?? false;
  });

  ipcMain.on('zoom:reset', () => {
    const activeContents = getActiveWebContents();
    if (activeContents) {
      resetZoom(activeContents);
    }
  });

  ipcMain.on('zoom:trigger-step', (_event, rawDirection: unknown) => {
    if (state.globalSettings?.ctrlScrollZoomEnabled === false) return;
    const direction = validate(zoomDirectionSchema, rawDirection);
    const activeContents = getActiveWebContents();
    if (activeContents) {
      changeZoom(activeContents, direction);
    }
  });

  ipcMain.on('devtools:toggle-wallie', () => {
    if (!state.mainWindow) return;
    const webContents = state.mainWindow.webContents;
    if (webContents.isDevToolsOpened()) {
      webContents.closeDevTools();
    } else {
      webContents.openDevTools({ mode: 'detach' });
    }
  });

  ipcMain.on('devtools:toggle', () => {
    const activeView = state.accountViews.get(state.activeAccountId);
    if (!activeView) {
      console.warn('No active view found to toggle DevTools.');
      return;
    }
    const webContents = activeView.webContents;
    if (webContents.isDevToolsOpened()) {
      webContents.closeDevTools();
    } else {
      webContents.openDevTools({ mode: 'detach' });
    }
  });

  ipcMain.on('app:relaunch', () => {
    app.relaunch();
    app.exit(0);
  });

  ipcMain.handle('app:get-version-info', () => {
    if (typeof __APP_VERSION_INFO__ !== 'undefined') {
      return __APP_VERSION_INFO__;
    }
    return {
      version: app.getVersion(),
      gitCommit: 'unknown',
      gitBranch: 'unknown',
      buildDate: new Date().toISOString(),
      isDirty: false,
    };
  });
}

