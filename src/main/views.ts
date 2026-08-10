import { app, BrowserWindow, WebContentsView, Menu, session, desktopCapturer, shell, Notification, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { state } from './state';
import { DEFAULT_USER_AGENT, saveAccounts, saveSettings } from './config';
import { isWhatsAppUrl, getTargetUrlIfLinkShim, getDomainFromUrl, isDomainTrusted, checkPermissionForAccount, getAccountById, getPreloadPath } from './utils';
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
  for (const view of state.accountViews.values()) {
    if (view && !view.webContents.isDestroyed()) {
      try {
        view.webContents.executeJavaScript(`
          (() => {
            try {
              document.querySelectorAll('video, audio').forEach(el => {
                if (!el.paused) {
                  el.dataset.pausedByCall = 'true';
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
}

export function resumeMediaAfterCall() {
  for (const view of state.accountViews.values()) {
    if (view && !view.webContents.isDestroyed()) {
      try {
        view.webContents.executeJavaScript(`
          (() => {
            try {
              document.querySelectorAll('video, audio').forEach(el => {
                if (el.dataset.pausedByCall === 'true') {
                  delete el.dataset.pausedByCall;
                  el.play().catch(() => {});
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
          handleExternalLinkClick(link);
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
          handleExternalLinkClick(`https://www.google.com/search?q=${query}`);
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

export function handleExternalLinkClick(urlStr: string): void {
  const targetUrl = getTargetUrlIfLinkShim(urlStr) || urlStr;
  const domain = getDomainFromUrl(targetUrl);

  const settings = state.globalSettings;
  const warningEnabled = settings?.externalLinkWarningEnabled !== false;
  const trustedDomains = settings?.trustedDomains || ['whatsapp.com', 'whatsapp.net'];

  const isTrusted = isDomainTrusted(domain, trustedDomains);

  const showToast = () => {
    const msg = `Opened link in external browser: ${domain}`;
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.mainWindow.webContents.send('toast:show', {
        message: msg,
        url: targetUrl,
      });
    }

    const activeView = state.accountViews.get(state.activeAccountId);
    if (activeView && !activeView.webContents.isDestroyed()) {
      const safeMsg = JSON.stringify(msg);
      const safeUrl = JSON.stringify(targetUrl);
      const script = `
        (function() {
          try {
            let container = document.getElementById('wallie-toast-container');
            if (!container) {
              container = document.createElement('div');
              container.id = 'wallie-toast-container';
              container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:999999;display:flex;flex-direction:column;gap:8px;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;pointer-events:none;';
              (document.body || document.documentElement).appendChild(container);
            }
            if (!document.getElementById('wallie-toast-style')) {
              const style = document.createElement('style');
              style.id = 'wallie-toast-style';
              style.textContent = '@keyframes wallieToastIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}';
              (document.head || document.documentElement).appendChild(style);
            }
            const toast = document.createElement('div');
            toast.style.cssText = 'background:#1f2c34;color:#e9edef;border:1px solid rgba(0,168,132,0.5);padding:10px 14px;border-radius:10px;box-shadow:0 10px 25px rgba(0,0,0,0.5);font-size:12px;max-width:340px;pointer-events:auto;display:flex;align-items:center;gap:10px;animation:wallieToastIn 0.2s ease-out;';
            toast.innerHTML = '<div style="background:rgba(0,168,132,0.2);color:#00a884;padding:6px;border-radius:6px;display:flex;align-items:center;justify-content:center;shrink:0;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></div><div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:12px;color:#e9edef;line-height:1.3;">' + ${safeMsg} + '</div><div style="font-size:10px;color:#8696a0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;" title="' + ${safeUrl} + '">' + ${safeUrl} + '</div></div>';
            container.appendChild(toast);
            setTimeout(() => {
              toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
              toast.style.opacity = '0';
              toast.style.transform = 'translateY(10px)';
              setTimeout(() => toast.remove(), 300);
            }, 4500);
          } catch(e) {}
        })();
      `;
      activeView.webContents.executeJavaScript(script).catch(() => {});
    }
  };

  if (!warningEnabled || isTrusted) {
    shell.openExternal(targetUrl).catch((err) => console.error('Failed to open external link:', err));
    showToast();
    return;
  }

  // Show native Electron system prompt
  const parentWindow = state.mainWindow && !state.mainWindow.isDestroyed() ? state.mainWindow : undefined;
  dialog.showMessageBox(parentWindow!, {
    type: 'warning',
    buttons: ['Visit Site', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    title: 'Hold on! Leaving WAllie',
    message: 'You are about to visit an external website:',
    detail: targetUrl,
    checkboxLabel: `Trust ${domain} and do not ask again`,
    checkboxChecked: false,
    noLink: true,
  }).then((result) => {
    if (result.response === 0) { // Visit Site
      if (result.checkboxChecked && settings) {
        if (!settings.trustedDomains) {
          settings.trustedDomains = ['whatsapp.com', 'whatsapp.net'];
        }
        if (!settings.trustedDomains.includes(domain)) {
          settings.trustedDomains.push(domain);
          saveSettings(settings);
          state.mainWindow?.webContents.send('global-settings:changed', settings);
        }
      }
      shell.openExternal(targetUrl).catch((err) => console.error('Failed to open external link:', err));
      showToast();
    }
  }).catch((err) => console.error('Error showing link warning prompt:', err));
}

export function registerZoomShortcuts(webContents: Electron.WebContents) {
  webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      const isControl = process.platform === 'darwin' ? input.meta : input.control;
      const isShift = input.shift;
      const isAlt = input.alt;

      // Intercept devtools keyboard shortcut for the active account in focus (not Wallie)
      const key = input.key ? input.key.toLowerCase() : '';
      const isDevToolsShortcut =
        key === 'f12' ||
        (isControl && isShift && (key === 'i' || key === 'j' || key === 'c')) ||
        (process.platform === 'darwin' && input.meta && isAlt && (key === 'i' || key === 'j' || key === 'c'));

      if (isDevToolsShortcut) {
        event.preventDefault();
        const activeView = state.accountViews.get(state.activeAccountId);
        if (activeView && !activeView.webContents.isDestroyed()) {
          if (activeView.webContents.isDevToolsOpened()) {
            activeView.webContents.closeDevTools();
          } else {
            activeView.webContents.openDevTools({ mode: 'detach' });
          }
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

  if (account.extensions && account.extensions.length > 0) {
    for (const ext of account.extensions) {
      if (ext.enabled) {
        if (fs.existsSync(ext.path)) {
          try {
            console.log(`Loading extension for account ${account.id}: ${ext.name} from ${ext.path}`);
            await accountSession.loadExtension(ext.path);
          } catch (err) {
            console.error(`Failed to load extension ${ext.name} from ${ext.path}:`, err);
          }
        } else {
          console.warn(`Extension path does not exist for ${ext.name}: ${ext.path}`);
        }
      }
    }
  }

  const view = new WebContentsView({
    webPreferences: {
      preload: getPreloadPath(),
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

  view.webContents.setUserAgent(DEFAULT_USER_AGENT);
  view.webContents.loadURL('https://web.whatsapp.com');

  registerZoomShortcuts(view.webContents);
  registerContextMenu(view.webContents);

  // Link Delegation: Intercept external link clicks
  view.webContents.on('will-navigate', (event, url) => {
    if (!isWhatsAppUrl(url)) {
      event.preventDefault();
      handleExternalLinkClick(url);
    }
  });

  // Link Delegation: Intercept target="_blank" window openings
  view.webContents.setWindowOpenHandler((details) => {
    const url = details.url;
    if (!isWhatsAppUrl(url)) {
      handleExternalLinkClick(url);
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
          preload: getPreloadPath(),
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
      if (state.callWindows.size === 0) {
        resumeMediaAfterCall();
      }
    });
  });

  view.webContents.on('will-prevent-unload', (event) => {
    const parentWindow = state.mainWindow && !state.mainWindow.isDestroyed() ? state.mainWindow : undefined;
    const choice = dialog.showMessageBoxSync(parentWindow!, {
      type: 'question',
      buttons: ['Reload Page', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Discard Changes?',
      message: 'Do you want to reload this page?',
      detail: 'Changes that you made may not be saved.',
      noLink: true,
    });
    if (choice === 0) {
      event.preventDefault();
    }
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
