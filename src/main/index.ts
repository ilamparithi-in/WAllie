import { app, session, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { state } from './state';
import { loadSettings, loadAccounts } from './config';
import { NOTIFICATION_HISTORY_FILE } from './notifications';
import { registerIpcHandlers } from './ipc';
import { createMainWindow, createTray } from './window';
import { checkForWebStoreUpdates } from './extensions';

// Memory & CPU Optimization flags
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-features', 'TranslateUI');

// Set application name and associate desktop file for Linux notifications & taskbar grouping
const originalUserData = app.getPath('userData');
app.name = 'WAllie';
app.setPath('userData', originalUserData);
if (process.platform === 'linux') {
  (app as any).setDesktopName('wallie');
}

// Load initial configuration settings and accounts
state.globalSettings = loadSettings();

// Disable hardware acceleration if config specifies before app gets ready
if (!state.globalSettings.hardwareAcceleration) {
  app.disableHardwareAcceleration();
}

state.accounts = loadAccounts();
state.activeAccountId = state.accounts[0].id;

// Enforce single-instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    if (state.mainWindow) {
      if (state.mainWindow.isMinimized()) state.mainWindow.restore();
      state.mainWindow.show();
      state.mainWindow.focus();

      const protocolUrl = commandLine.find(arg => arg.startsWith('whatsapp://') || arg.startsWith('wallie://'));
      if (protocolUrl) {
        console.log(`Received protocol URL in second-instance: ${protocolUrl}`);
        state.mainWindow.webContents.send('protocol:received-url', protocolUrl);
      }
    } else {
      const protocolUrl = commandLine.find(arg => arg.startsWith('whatsapp://') || arg.startsWith('wallie://'));
      if (protocolUrl) {
        state.pendingProtocolUrl = protocolUrl;
      }
    }
  });

  const startupUrl = process.argv.find(arg => arg.startsWith('whatsapp://') || arg.startsWith('wallie://'));
  if (startupUrl) {
    state.pendingProtocolUrl = startupUrl;
  }
}

// Register all main IPC listeners
registerIpcHandlers();

if (gotTheLock) {
  app.whenReady().then(() => {
    // Register custom protocol clients
    if (process.defaultApp) {
      if (process.argv.length >= 2) {
        const execArgs = [path.resolve(process.argv[1])];
        app.setAsDefaultProtocolClient('whatsapp', process.execPath, execArgs);
        app.setAsDefaultProtocolClient('wallie', process.execPath, execArgs);
      }
    } else {
      app.setAsDefaultProtocolClient('whatsapp');
      app.setAsDefaultProtocolClient('wallie');
    }

    // Content Security Policy for the main renderer window (React UI)
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ws://localhost:* http://localhost:*"
          ]
        }
      });
    });

    createMainWindow();
    createTray();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      } else {
        state.mainWindow?.show();
      }
    });

    // Background Web Store extension updates
    const triggerUpdateCheck = () => {
      if (state.globalSettings?.autoUpdateExtensions !== false) {
        checkForWebStoreUpdates().catch((err) => {
          console.error('Background Web Store extension update check failed:', err);
        });
      }
    };
    setTimeout(triggerUpdateCheck, 15000);
    setInterval(triggerUpdateCheck, 12 * 60 * 60 * 1000);
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    (app as any).isQuitting = true;
    state.isQuitting = true;
    // Flush notification history immediately before exit
    if (state.notificationHistoryCache && state.historyFlushTimeout) {
      clearTimeout(state.historyFlushTimeout);
      try {
        fs.writeFileSync(NOTIFICATION_HISTORY_FILE, JSON.stringify(state.notificationHistoryCache, null, 2), 'utf8');
      } catch (err) {
        console.error('Failed to flush notification history on quit:', err);
      }
    }
  });
}
