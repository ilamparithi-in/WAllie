import { app, BrowserWindow, WebContentsView, Menu, session, desktopCapturer, shell, Notification } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { state } from './state';
import { DEFAULT_USER_AGENT, saveAccounts } from './config';
import { isWhatsAppUrl, checkPermissionForAccount, getAccountById } from './utils';
import { Account, DEFAULT_ACCOUNT_SETTINGS } from '../shared/types';
import { TITLEBAR_HEIGHT } from '../shared/constants';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const OLED_THEME_CSS = `
/* OLED Dark Theme overrides */
body,
body.web,
.web,
#app,
.app-wrapper,
.two,
.three {
  background-color: #000000 !important;
  background-image: none !important;
}

:root {
  --app-background: #000000 !important;
  --background-default: #000000 !important;
  --background-default-hover: #111111 !important;
  --background-default-active: #1a1a1a !important;
  --conversation-panel-background: #000000 !important;
  --panel-background: #000000 !important;
  --panel-background-deep: #050505 !important;
  --panel-background-hover: #111111 !important;
  --panel-background-colored: #080808 !important;
  --panel-header-background: #0a0a0a !important;
  --panel-header-icon: #aebac1 !important;
  --search-container-background: #050505 !important;
  --search-input-background: #111111 !important;
  --system-message-background: #111111 !important;
  --incoming-message-background: #121212 !important;
  --incoming-message-background-deeper: #1a1a1a !important;
  --outgoing-message-background: #054738 !important;
  --outgoing-message-background-deeper: #095c4a !important;
  
  --border-default: #1a1a1a !important;
  --border-panel: #1a1a1a !important;
  --border-stronger: #262626 !important;
  --border-list: #1a1a1a !important;
  
  --input-placeholder: #667781 !important;
  --primary: #00a884 !important;
  --message-primary: #e9edef !important;
}

#pane-side,
._33L3z,
[data-testid="chat-list"] {
  background-color: #000000 !important;
}

footer,
footer > div {
  background-color: #0a0a0a !important;
  border-top: 1px solid #1a1a1a !important;
}

.message-in,
.message-out,
[data-testid="msg-container"] {
  border: 1px solid #1a1a1a !important;
}
`;

export const COMPACT_THEME_CSS = `
/* Compact UI Theme overrides */
:root {
  --chat-list-width: 250px !important;
}

div[data-testid="cell-frame-container"] {
  padding-top: 4px !important;
  padding-bottom: 4px !important;
  min-height: 48px !important;
}

div[data-testid="cell-frame-container"] img,
div[data-testid="cell-frame-container"] svg,
div[data-testid="cell-frame-container"] .avatar {
  width: 32px !important;
  height: 32px !important;
}

header {
  height: 44px !important;
  padding: 4px 8px !important;
}

div[data-testid="chat-list-search"] {
  padding: 4px 8px !important;
}

span[data-testid="cell-frame-title"] {
  font-size: 13px !important;
}

div[data-testid="msg-container"] {
  padding: 2px 6px !important;
}

div[data-testid="msg-container"] span {
  font-size: 12.5px !important;
}

footer {
  padding: 4px 8px !important;
  min-height: 40px !important;
}
`;

const insertedCssKeys = new Map<string, string>();

export async function injectCustomCssForView(accountId: string, webContents: Electron.WebContents) {
  const account = getAccountById(accountId);
  if (!account || !account.settings) return;

  const previousKey = insertedCssKeys.get(accountId);
  if (previousKey) {
    try {
      await webContents.removeInsertedCSS(previousKey);
      insertedCssKeys.delete(accountId);
    } catch (err) {
      // Ignore if key is already invalid due to page reload
    }
  }

  const { customCss = '', selectedTheme = 'none' } = account.settings;

  let themeCss = '';
  if (selectedTheme === 'oled') {
    themeCss = OLED_THEME_CSS;
  } else if (selectedTheme === 'compact') {
    themeCss = COMPACT_THEME_CSS;
  }

  const combinedCss = themeCss + '\n' + customCss;
  if (!combinedCss.trim()) return;

  try {
    const key = await webContents.insertCSS(combinedCss);
    insertedCssKeys.set(accountId, key);
  } catch (err) {
    console.error('Failed to insert CSS:', err);
  }
}

export function pauseAllMedia() {
  const activeView = state.accountViews.get(state.activeAccountId);
  if (activeView && !activeView.webContents.isDestroyed()) {
    try {
      activeView.webContents.executeJavaScript(`
        (() => {
          try {
            document.querySelectorAll('video, audio').forEach(el => {
              if (!el.paused) {
                el.pause();
              }
            });
          } catch (e) {}
        })()
      `).catch(() => {});
    } catch (e) {
      // Ignore errors
    }
  }
}

export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0];

export function changeZoom(contents: Electron.WebContents, direction: 'in' | 'out') {
  try {
    const currentFactor = contents.getZoomFactor();

    // Find closest zoom step
    let closestIndex = 4; // Default to 1.0 (index 4)
    let minDiff = Math.abs(currentFactor - ZOOM_STEPS[closestIndex]);

    for (let i = 0; i < ZOOM_STEPS.length; i++) {
      const diff = Math.abs(currentFactor - ZOOM_STEPS[i]);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    }

    let nextIndex = closestIndex;
    if (direction === 'in') {
      nextIndex = Math.min(ZOOM_STEPS.length - 1, closestIndex + 1);
    } else {
      nextIndex = Math.max(0, closestIndex - 1);
    }

    const newFactor = ZOOM_STEPS[nextIndex];
    contents.setZoomFactor(newFactor);

    const zoomPercent = Math.round(newFactor * 100);
    console.log(`Setting zoom factor to: ${newFactor} (${zoomPercent}%)`);
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.mainWindow.webContents.send('zoom:changed', zoomPercent);
    }
  } catch (error) {
    console.error('Error changing zoom factor:', error);
  }
}

export function resetZoom(contents: Electron.WebContents) {
  try {
    contents.setZoomFactor(1.0);
    console.log('Resetting zoom factor to: 1.0 (100%)');
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.mainWindow.webContents.send('zoom:changed', 100);
    }
  } catch (error) {
    console.error('Error resetting zoom factor:', error);
  }
}

export function getActiveWebContents(): Electron.WebContents | null {
  const activeView = state.accountViews.get(state.activeAccountId);
  return activeView ? activeView.webContents : null;
}

export function registerContextMenu(webContents: Electron.WebContents) {
  webContents.on('context-menu', (event, params) => {
    const menuItems: Electron.MenuItemConstructorOptions[] = [];

    const isEditable = params.isEditable;
    const hasSelection = !!(params.selectionText && params.selectionText.trim() !== '');
    const hasLink = !!((params.linkURL && params.linkURL.trim() !== '') || 
                    (hasSelection && /^(https?:\/\/|www\.)[^\s]+$/i.test(params.selectionText.trim())));

    // Link option
    if (hasLink) {
      const rawLink = params.linkURL || params.selectionText.trim();
      const link = rawLink.startsWith('www.') ? `https://${rawLink}` : rawLink;
      const maxLength = 40;
      const truncatedLink = link.length <= maxLength ? link : link.substring(0, maxLength) + '...';
      menuItems.push({
        label: `Open ${truncatedLink} in browser`,
        click: () => {
          shell.openExternal(link).catch((err) => console.error('Failed to open external link:', err));
        },
      });
    }

    // Search in Google option
    if (hasSelection) {
      if (menuItems.length > 0) menuItems.push({ type: 'separator' });
      menuItems.push({
        label: 'Search in Google',
        click: () => {
          const query = encodeURIComponent(params.selectionText.trim());
          shell.openExternal(`https://www.google.com/search?q=${query}`).catch((err) => console.error('Failed to open search URL:', err));
        },
      });
    }

    // Standard edit commands
    const editItems: Electron.MenuItemConstructorOptions[] = [];
    if (isEditable) {
      editItems.push({
        label: 'Cut',
        role: 'cut',
        enabled: hasSelection,
      });
      editItems.push({
        label: 'Copy',
        role: 'copy',
        enabled: hasSelection,
      });
      editItems.push({
        label: 'Paste',
        role: 'paste',
      });
    } else if (hasSelection) {
      editItems.push({
        label: 'Copy',
        role: 'copy',
      });
    }

    if (editItems.length > 0) {
      if (menuItems.length > 0) menuItems.push({ type: 'separator' });
      menuItems.push(...editItems);
    }

    // Select All
    if (menuItems.length > 0) menuItems.push({ type: 'separator' });
    menuItems.push({
      label: 'Select All',
      role: 'selectAll',
    });

    const menu = Menu.buildFromTemplate(menuItems);
    menu.popup({
      window: BrowserWindow.fromWebContents(webContents) || undefined,
    });
  });
}

export function registerZoomShortcuts(webContents: Electron.WebContents) {
  webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      const isControl = process.platform === 'darwin' ? input.meta : input.control;
      const isShift = input.shift;
      const isAlt = input.alt;

      // Intercept devtools keyboard shortcut for main window (Wallie)
      const isDevToolsShortcut = 
        (isControl && isShift && (input.key === 'i' || input.key === 'I')) ||
        (process.platform === 'darwin' && input.meta && isAlt && (input.key === 'i' || input.key === 'I'));

      if (isDevToolsShortcut && state.mainWindow && webContents === state.mainWindow.webContents) {
        event.preventDefault();
        if (state.mainWindow.webContents.isDevToolsOpened()) {
          state.mainWindow.webContents.closeDevTools();
        } else {
          state.mainWindow.webContents.openDevTools({ mode: 'detach' });
        }
        return;
      }

      if (isControl) {
        if (input.key === '=' || input.key === '+') {
          const targetContents = getActiveWebContents() || webContents;
          changeZoom(targetContents, 'in');
          event.preventDefault();
        } else if (input.key === '-') {
          const targetContents = getActiveWebContents() || webContents;
          changeZoom(targetContents, 'out');
          event.preventDefault();
        } else if (input.key === '0') {
          const targetContents = getActiveWebContents() || webContents;
          resetZoom(targetContents);
          event.preventDefault();
        }
      }
    }
  });
}

export async function createAccountView(account: Account): Promise<WebContentsView> {
  const accountSession = session.fromPartition(account.partition);

  // Set standard User-Agent on session headers to ensure WhatsApp Web loads smoothly
  accountSession.setUserAgent(DEFAULT_USER_AGENT);

  // Configure session-level handlers once per session partition
  if (!state.configuredSessions.has(account.partition)) {
    state.configuredSessions.add(account.partition);

    // Permission Request Handler
    accountSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
      const url = details.requestingUrl;
      if (isWhatsAppUrl(url)) {
        const targetAccount = state.accounts.find((a) => a.partition === account.partition);
        if (targetAccount) {
          const granted = checkPermissionForAccount(targetAccount, permission, undefined, (details as any).mediaTypes);
          callback(granted);
          return;
        }
      }
      callback(false);
    });

    // Permission Check Handler
    accountSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
      if (isWhatsAppUrl(requestingOrigin)) {
        const targetAccount = state.accounts.find((a) => a.partition === account.partition);
        if (targetAccount) {
          return checkPermissionForAccount(targetAccount, permission, details?.mediaType);
        }
      }
      return false;
    });

    // Screen Sharing / Display Media Request Handler
    accountSession.setDisplayMediaRequestHandler((request, callback) => {
      const isWayland = process.platform === 'linux' && (!!process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === 'wayland');

      if (isWayland) {
        callback({
          video: {
            id: 'screen:0:0',
            name: 'Entire Screen',
          } as any,
          audio: 'loopback',
        });
        return;
      }

      desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
        let selected = false;
        const menu = Menu.buildFromTemplate([
          ...sources.map((source) => ({
            label: source.name || `Source ${source.id}`,
            click: () => {
              selected = true;
              callback({ video: source, audio: 'loopback' });
            },
          })),
          { type: 'separator' },
          {
            label: 'Cancel',
            click: () => {
              // Action handled in menu dismiss callback
            },
          },
        ]);

        menu.popup({
          window: state.mainWindow || undefined,
          callback: () => {
            if (!selected) {
              callback({}); // Cancel the request if menu is dismissed without selection
            }
          },
        });
      }).catch((err) => {
        console.error('Failed to get screen sharing sources:', err);
        callback({}); // Fail gracefully to avoid hanging the renderer
      });
    });

    // Downloads Interception Handler
    accountSession.on('will-download', (event, item) => {
      const fileName = item.getFilename();
      const downloadsPath = app.getPath('downloads');
      const savePath = path.join(downloadsPath, fileName);

      let uniqueSavePath = savePath;
      let counter = 1;
      const ext = path.extname(fileName);
      const base = path.basename(fileName, ext);
      while (fs.existsSync(uniqueSavePath)) {
        uniqueSavePath = path.join(downloadsPath, `${base} (${counter})${ext}`);
        counter++;
      }
      item.setSavePath(uniqueSavePath);

      const startTime = item.getStartTime();
      state.mainWindow?.webContents.send('download:progress', {
        id: startTime,
        filename: fileName,
        percent: 0,
        state: 'progressing',
        receivedBytes: 0,
        totalBytes: item.getTotalBytes(),
      });

      item.on('updated', (event, stateName) => {
        if (stateName === 'interrupted') {
          state.mainWindow?.webContents.send('download:progress', {
            id: startTime,
            filename: fileName,
            percent: 0,
            state: 'failed',
          });
        } else if (stateName === 'progressing') {
          if (!item.isPaused()) {
            const received = item.getReceivedBytes();
            const total = item.getTotalBytes();
            const percent = total > 0 ? Math.round((received / total) * 100) : 0;
            state.mainWindow?.webContents.send('download:progress', {
              id: startTime,
              filename: fileName,
              percent,
              state: 'progressing',
              receivedBytes: received,
              totalBytes: total,
            });
          }
        }
      });

      item.once('done', (event, stateName) => {
        if (stateName === 'completed') {
          state.mainWindow?.webContents.send('download:progress', {
            id: startTime,
            filename: fileName,
            percent: 100,
            state: 'completed',
          });

          const notification = new Notification({
            title: 'Download Complete',
            body: `Successfully downloaded ${path.basename(uniqueSavePath)} to Downloads folder.`,
          });
          notification.show();
        } else {
          state.mainWindow?.webContents.send('download:progress', {
            id: startTime,
            filename: fileName,
            percent: 0,
            state: 'failed',
          });
        }
      });
    });
  }

  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      partition: account.partition,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true,
      sandbox: true,
      webSecurity: true,
      v8CacheOptions: 'bypassHeatCheck',
      spellcheck: false,
    },
  });

  view.webContents.once('dom-ready', async () => {
    if (account.extensions && account.extensions.length > 0) {
      for (const ext of account.extensions) {
        if (ext.enabled) {
          try {
            console.log(`Loading extension for account ${account.id}: ${ext.name} from ${ext.path}`);
            await accountSession.loadExtension(ext.path);
          } catch (err) {
            console.error(`Failed to load extension ${ext.name} from ${ext.path}:`, err);
          }
        }
      }
    }
  });

  view.webContents.setUserAgent(DEFAULT_USER_AGENT);
  view.webContents.loadURL('https://web.whatsapp.com');

  registerZoomShortcuts(view.webContents);
  registerContextMenu(view.webContents);

  // Link Delegation: Intercept external link clicks
  view.webContents.on('will-navigate', (event, url) => {
    if (!isWhatsAppUrl(url)) {
      event.preventDefault();
      shell.openExternal(url).catch((err) => console.error('Failed to open external link:', err));
    }
  });

  // Link Delegation: Intercept target="_blank" window openings
  view.webContents.setWindowOpenHandler((details) => {
    const url = details.url;
    if (!isWhatsAppUrl(url)) {
      shell.openExternal(url).catch((err) => console.error('Failed to open external link:', err));
      return { action: 'deny' };
    }

    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 900,
        height: 650,
        minWidth: 500,
        minHeight: 400,
        frame: false,
        titleBarStyle: 'hidden',
        backgroundColor: '#111b21',
        autoHideMenuBar: true,
        webPreferences: {
          preload: path.join(__dirname, '../preload/index.cjs'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          backgroundThrottling: false,
        }
      }
    };
  });

  view.webContents.on('did-create-window', (childWindow, details) => {
    console.log(`Intercepted child window creation for URL: ${details.url}`);
    pauseAllMedia();

    childWindow.setMenu(null);
    childWindow.setAutoHideMenuBar(true);
    childWindow.menuBarVisible = false;

    state.callWindows.add(childWindow);

    childWindow.on('closed', () => {
      state.callWindows.delete(childWindow);
    });
  });

  view.webContents.on('will-prevent-unload', (event) => {
    event.preventDefault();
  });

  // Handle title & page badge updates for unread notifications count
  view.webContents.on('page-title-updated', (_event, title) => {
    const match = title.match(/\((\d+)\)/);
    const count = match ? parseInt(match[1], 10) : 0;
    account.unreadCount = count;
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.mainWindow.webContents.send('account:unread-changed', account.id, count);
    }
  });

  const checkLoginStatus = async () => {
    if (account.loggedIn) return;

    try {
      const isNowLoggedIn = await view.webContents.executeJavaScript(`
        (() => {
          const hasChatList = !!(
            document.getElementById('pane-side') || 
            document.querySelector('[data-testid="chat-list-search"]') || 
            document.querySelector('[data-testid="menu"]') ||
            document.querySelector('[data-testid="cell-frame-title"]')
          );
          if (hasChatList) return true;

          const hasLanding = !!(
            document.querySelector('[data-testid="qrcode"]') || 
            document.querySelector('canvas') ||
            document.querySelector('.landing-wrapper')
          );
          if (hasLanding) return false;

          const hasWid = !!(
            localStorage.getItem('last-wid') || 
            localStorage.getItem('remember-me')
          );
          return hasWid;
        })()
      `);

      if (isNowLoggedIn) {
        console.log(`Account ${account.id} successfully logged in!`);
        account.loggedIn = true;
        saveAccounts();
        state.mainWindow?.webContents.send('account:list-changed', state.accounts, state.activeAccountId);
      }
    } catch (e) {
      // Ignore
    }
  };

  view.webContents.on('dom-ready', () => {
    checkLoginStatus();
    insertedCssKeys.delete(account.id);
    injectCustomCssForView(account.id, view.webContents);
  });
  view.webContents.on('page-title-updated', checkLoginStatus);

  const intervalId = setInterval(() => {
    if (view.webContents.isDestroyed() || account.loggedIn) {
      clearInterval(intervalId);
      return;
    }
    checkLoginStatus();
  }, 8000);

  return view;
}
