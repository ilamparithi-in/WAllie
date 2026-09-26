import { app, BrowserWindow, WebContentsView, Menu, session, desktopCapturer, shell, Notification, dialog, clipboard } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { state } from './state';
import { DEFAULT_USER_AGENT, saveAccounts, saveSettings } from './config';
import { isWhatsAppUrl, getTargetUrlIfLinkShim, getDomainFromUrl, isDomainTrusted, checkPermissionForAccount, getAccountById, getPreloadPath, getAppIcon, getInitialWindowSize, showAppToast } from './utils';
import { Account, DEFAULT_ACCOUNT_SETTINGS } from '../shared/types';
import { resolveGoogleFontUrl } from '../shared/fonts';
import { TITLEBAR_HEIGHT } from '../shared/constants';
import { downloadManager } from './downloads';
import { prepareExtensionForElectron } from './extensions';
import { createSandboxWindow } from './sandbox';

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

export async function buildAccountStyling(account: Account): Promise<{ fontCss: string; wallpaperCss: string; customCss: string }> {
  const {
    customCss = '',
    selectedTheme = 'none',
    fontFamily = '',
    fontUrl = '',
    monoFontFamily = '',
    monoFontUrl = '',
    followSystemFont = false,
    customWallpaper = '',
  } = account.settings || {};

  // 1. Font CSS
  const importRules: string[] = [];
  const styleRules: string[] = [];

  if (followSystemFont) {
    styleRules.push(
      '#app, #app :not([data-icon]):not(code):not(pre) {\n  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;\n  font-optical-sizing: auto;\n  font-synthesis: weight style;\n}'
    );
  } else if (fontFamily && fontFamily.trim()) {
    const family = fontFamily.trim().replace(/^['"]+|['"]+$/g, '');
    const isGeneric = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|-apple-system|Segoe UI|Arial|Helvetica|Times New Roman|Courier New)$/i.test(family);
    if (!isGeneric && !family.includes(',')) {
      const url = await resolveGoogleFontUrl(family, fontUrl);
      if (url) {
        importRules.push(`@import url('${url}');`);
      }
    }
    styleRules.push(
      `#app, #app :not([data-icon]):not(code):not(pre) {\n  font-family: "${family}", "Segoe UI", Helvetica, Arial, sans-serif !important;\n  font-optical-sizing: auto;\n  font-synthesis: weight style;\n}`
    );
  }

  if (monoFontFamily && monoFontFamily.trim()) {
    const mono = monoFontFamily.trim().replace(/^['"]+|['"]+$/g, '');
    const isGenericMono = /^(monospace|ui-monospace|Courier New|Courier|Consolas|DejaVu Sans Mono|Liberation Mono)$/i.test(mono);
    if (!isGenericMono && !mono.includes(',')) {
      const url = await resolveGoogleFontUrl(mono, monoFontUrl);
      if (url) {
        importRules.push(`@import url('${url}');`);
      }
    }
    styleRules.push(
      `code, pre {\n  font-family: "${mono}", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace !important;\n  font-optical-sizing: auto;\n  font-synthesis: weight style;\n}`
    );
  }
  const fontCss = [...importRules, ...styleRules].join('\n\n');

  // 2. Chat Wallpaper CSS on #main
  let wallpaperCss = '';
  if (customWallpaper && customWallpaper.trim()) {
    wallpaperCss = `#main {\n  background-image: url(${JSON.stringify(customWallpaper.trim())}) !important;\n  background-size: cover !important;\n  background-position: center center !important;\n  background-repeat: no-repeat !important;\n}`;
  }

  // 3. Preset Theme & Custom CSS
  let themeCss = '';
  if (selectedTheme === 'oled') {
    themeCss = OLED_THEME_CSS;
  } else if (selectedTheme === 'compact') {
    themeCss = COMPACT_THEME_CSS;
  }
  const finalCustomCss = [themeCss, customCss].filter(Boolean).join('\n\n');

  return { fontCss, wallpaperCss, customCss: finalCustomCss };
}

export async function injectAccountStyling(accountId: string, webContents: Electron.WebContents) {
  if (!webContents || webContents.isDestroyed()) return;
  const account = getAccountById(accountId);
  if (!account || !account.settings) return;

  const { fontCss, wallpaperCss, customCss } = await buildAccountStyling(account);

  const jsPayload = `
    (() => {
      try {
        const updateStyle = (id, css) => {
          let el = document.getElementById(id);
          if (!css || !css.trim()) {
            if (el) el.remove();
            return;
          }
          if (!el) {
            el = document.createElement('style');
            el.id = id;
            (document.head || document.documentElement).appendChild(el);
          }
          el.textContent = css;
        };

        updateStyle('wallie-web-font', ${JSON.stringify(fontCss)});
        updateStyle('wallie-chat-wallpaper', ${JSON.stringify(wallpaperCss)});
        updateStyle('wallie-custom-css', ${JSON.stringify(customCss)});
      } catch (e) {
        console.error('Error applying account styles:', e);
      }
    })();
  `;

  try {
    await webContents.executeJavaScript(jsPayload);
  } catch (err) {
    // Page may not be ready or navigating; will re-apply on dom-ready
  }
}

export async function injectCustomCssForView(accountId: string, webContents: Electron.WebContents) {
  return injectAccountStyling(accountId, webContents);
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
        `).catch(() => { });
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
        `).catch(() => { });
      } catch (e) {
        // Ignore errors
      }
    }
  }
}

export function clearPausedMediaState() {
  for (const view of state.accountViews.values()) {
    if (view && !view.webContents.isDestroyed()) {
      try {
        view.webContents.executeJavaScript(`
          (() => {
            try {
              document.querySelectorAll('video, audio').forEach(el => {
                if (el.dataset.pausedByCall === 'true') {
                  delete el.dataset.pausedByCall;
                }
              });
            } catch (e) {}
          })()
        `).catch(() => { });
      } catch (e) {
        // Ignore errors
      }
    }
  }
}

export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0];

export function changeZoom(contents: Electron.WebContents, direction: 'in' | 'out') {
  try {
    const baseScale = (state.globalSettings?.appScale || 100) / 100;
    const currentFactor = contents.getZoomFactor();
    const relativeFactor = currentFactor / baseScale;

    // Find closest zoom step
    let closestIndex = 4; // Default to 1.0 (index 4)
    let minDiff = Math.abs(relativeFactor - ZOOM_STEPS[closestIndex]);

    for (let i = 0; i < ZOOM_STEPS.length; i++) {
      const diff = Math.abs(relativeFactor - ZOOM_STEPS[i]);
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

    const relativeNext = ZOOM_STEPS[nextIndex];
    const newFactor = relativeNext * baseScale;
    contents.setZoomFactor(newFactor);

    const zoomPercent = Math.round(relativeNext * 100);
    console.log(`Setting zoom factor to: ${newFactor} (${zoomPercent}% relative)`);
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.mainWindow.webContents.send('zoom:changed', zoomPercent);
    }
  } catch (error) {
    console.error('Error changing zoom factor:', error);
  }
}

export function resetZoom(contents: Electron.WebContents) {
  try {
    const baseScale = (state.globalSettings?.appScale || 100) / 100;
    contents.setZoomFactor(baseScale);
    contents.setVisualZoomLevelLimits(1, 1);
    contents.setVisualZoomLevelLimits(1, 5);
    console.log(`Resetting zoom factor to baseline ${baseScale} (100%) and resetting visual zoom scale`);
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
    const isImage = params.mediaType === 'image' || params.hasImageContents;
    const hasLink = !!((params.linkURL && params.linkURL.trim() !== '') ||
      (hasSelection && /^(https?:\/\/|www\.)[^\s]+$/i.test(params.selectionText.trim())));

    // Image options
    if (isImage) {
      menuItems.push({
        label: 'Save Image As...',
        click: async () => {
          try {
            const win = BrowserWindow.fromWebContents(webContents);
            let ext = 'png';
            if (params.srcURL && params.srcURL.startsWith('data:image/')) {
              const m = params.srcURL.match(/^data:image\/([a-z0-9+]+);base64,/i);
              if (m) ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].split('+')[0].toLowerCase();
            } else if (params.srcURL) {
              const urlPath = params.srcURL.split('?')[0];
              const matchExt = urlPath.match(/\.(png|jpg|jpeg|webp|gif|svg)$/i);
              if (matchExt) ext = matchExt[1].toLowerCase();
            }

            const options: Electron.SaveDialogOptions = {
              title: 'Save Image As...',
              defaultPath: `image_${Date.now()}.${ext}`,
              filters: [
                { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] },
                { name: 'All Files', extensions: ['*'] }
              ]
            };

            const { filePath, canceled } = win
              ? await dialog.showSaveDialog(win, options)
              : await dialog.showSaveDialog(options);

            if (canceled || !filePath) return;

            if (params.srcURL) {
              const base64Data: string = await webContents.executeJavaScript(`
                (async () => {
                  const response = await fetch(${JSON.stringify(params.srcURL)});
                  const blob = await response.blob();
                  return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                  });
                })();
              `);
              const base64Clean = base64Data.replace(/^data:image\/[^;]+;base64,/i, '');
              fs.writeFileSync(filePath, Buffer.from(base64Clean, 'base64'));
            }
          } catch (err) {
            console.error('Failed to save image via context menu:', err);
          }
        }
      });

      menuItems.push({
        label: 'Copy Image',
        click: () => {
          webContents.copyImageAt(params.x, params.y);
        }
      });

      if (params.srcURL && !params.srcURL.startsWith('blob:')) {
        menuItems.push({
          label: 'Copy Image Address',
          click: () => {
            clipboard.writeText(params.srcURL);
          }
        });
      }
    }

    // Link options
    if (hasLink) {
      if (menuItems.length > 0) menuItems.push({ type: 'separator' });
      const rawLink = params.linkURL || params.selectionText.trim();
      const link = rawLink.startsWith('www.') ? `https://${rawLink}` : rawLink;
      const cleanLink = getTargetUrlIfLinkShim(link) || link;
      const maxLength = 40;
      const truncatedLink = cleanLink.length <= maxLength ? cleanLink : cleanLink.substring(0, maxLength) + '...';

      menuItems.push({
        label: `Open ${truncatedLink} in browser`,
        click: () => {
          handleExternalLinkClick(cleanLink);
        },
      });

      menuItems.push({
        label: 'Open in Sandbox',
        click: () => {
          openInSandbox(cleanLink);
        },
      });

      menuItems.push({
        label: 'Copy Link',
        click: () => {
          clipboard.writeText(cleanLink);
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

export function showLinkToast(msg: string, targetUrl: string): void {
  showAppToast(msg, targetUrl);
}

export function openInSandbox(urlStr: string): BrowserWindow {
  const targetUrl = getTargetUrlIfLinkShim(urlStr) || urlStr;
  const domain = getDomainFromUrl(targetUrl);
  const sandboxWin = createSandboxWindow(targetUrl);
  showLinkToast(`Opened link in sandbox: ${domain}`, targetUrl);
  return sandboxWin;
}

export function handleExternalLinkClick(urlStr: string): void {
  const targetUrl = getTargetUrlIfLinkShim(urlStr) || urlStr;
  const domain = getDomainFromUrl(targetUrl);

  const settings = state.globalSettings;
  const warningEnabled = settings?.externalLinkWarningEnabled !== false;
  const trustedDomains = settings?.trustedDomains || ['whatsapp.com', 'whatsapp.net'];

  const isTrusted = isDomainTrusted(domain, trustedDomains);

  if (!warningEnabled || isTrusted) {
    shell.openExternal(targetUrl).catch((err) => console.error('Failed to open external link:', err));
    showLinkToast(`Opened link in external browser: ${domain}`, targetUrl);
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
      showLinkToast(`Opened link in external browser: ${domain}`, targetUrl);
    }
  }).catch((err) => console.error('Error showing link warning prompt:', err));
}

export function registerZoomShortcuts(webContents: Electron.WebContents) {
  webContents.on('before-input-event', (event, input) => {
    const isControl = process.platform === 'darwin' ? input.meta : input.control;
    if (input.key === 'Control' || input.key === 'Meta') {
      const isDown = input.type !== 'keyUp';
      if (!webContents.isDestroyed()) {
        webContents.send('zoom:ctrl-state-changed', isDown);
      }
    }

    if (input.type === 'keyDown') {
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

      if (isControl && (isShift || isAlt) && input.key === '0') {
        event.preventDefault();
        if (state.globalSettings) {
          state.globalSettings.appScale = 100;
          saveSettings(state.globalSettings);
          if (state.mainWindow && !state.mainWindow.isDestroyed()) {
            state.mainWindow.webContents.setZoomFactor(1.0);
            state.mainWindow.webContents.send('settings:global-changed', state.globalSettings);
          }
          const activeContents = getActiveWebContents();
          if (activeContents) resetZoom(activeContents);
        }
        return;
      }

      if (isControl) {
        const activeContents = getActiveWebContents();
        if (input.key === '=' || input.key === '+') {
          event.preventDefault();
          if (activeContents) changeZoom(activeContents, 'in');
        } else if (input.key === '-') {
          event.preventDefault();
          if (activeContents) changeZoom(activeContents, 'out');
        } else if (input.key === '0') {
          event.preventDefault();
          if (activeContents) resetZoom(activeContents);
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
    accountSession.on('will-download', (_event, item, webContents) => {
      downloadManager.handleWillDownload(item, webContents, account.id);
    });
  }

  if (account.extensions && account.extensions.length > 0) {
    for (const ext of account.extensions) {
      if (ext.enabled) {
        if (fs.existsSync(ext.path)) {
          try {
            prepareExtensionForElectron(ext.path);
            console.log(`Loading extension for account ${account.id}: ${ext.name} from ${ext.path}`);
            if (accountSession.extensions) {
              await accountSession.extensions.loadExtension(ext.path);
            } else {
              await accountSession.loadExtension(ext.path);
            }
          } catch (err) {
            console.error(`Failed to load extension ${ext.name} from ${ext.path}:`, err);
          }
        } else {
          console.warn(`Extension path does not exist for ${ext.name}: ${ext.path}`);
        }
      }
    }
  }

  const baseScale = (state.globalSettings?.appScale || 100) / 100;
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
      visualZoom: true,
    } as any,
  });

  view.webContents.setUserAgent(DEFAULT_USER_AGENT);
  view.webContents.setZoomFactor(baseScale);
  view.webContents.setVisualZoomLevelLimits(1, 5);
  view.webContents.loadURL('https://web.whatsapp.com');

  view.webContents.on('did-finish-load', () => {
    if (view.webContents.navigationHistory) {
      view.webContents.navigationHistory.clear();
    } else {
      (view.webContents as any).clearHistory?.();
    }
  });

  view.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[Account ${account.id}] Renderer process gone (${details.reason}):`, details);
    if (details.reason !== 'clean-exit') {
      console.log(`[Account ${account.id}] Reloading view after unexpected renderer exit...`);
      view.webContents.reload();
    }
  });

  view.webContents.on('did-navigate', (_event, url) => {
    if (url === 'about:blank' || (!isWhatsAppUrl(url) && !url.startsWith('chrome-extension://'))) {
      console.warn(`[Account ${account.id}] Navigated away to ${url}, redirecting back to WhatsApp Web`);
      view.webContents.loadURL('https://web.whatsapp.com');
    }
  });

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
    
    // When a call window is created, pause media across views if not already in a call session
    if (state.callWindows.size === 0) {
      state.callWasAnswered = false;
      pauseAllMedia();
    }

    childWindow.setMenu(null);
    childWindow.setAutoHideMenuBar(true);
    childWindow.menuBarVisible = false;

    state.callWindows.add(childWindow);

    childWindow.on('closed', () => {
      state.callWindows.delete(childWindow);
      if (state.callWindows.size === 0) {
        if (!state.callWasAnswered) {
          console.log('[walinux] Call was declined or dismissed; resuming paused media.');
          resumeMediaAfterCall();
        } else {
          console.log('[walinux] Call was answered; keeping media paused.');
          clearPausedMediaState();
          setTimeout(() => {
            if (state.callWindows.size === 0) {
              state.callWasAnswered = false;
            }
          }, 3000);
        }
      }
    });
  });

  view.webContents.on('will-prevent-unload', (event) => {
    state.isNavConfirmActive = true;
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.mainWindow.webContents.send('nav-confirmation:active', true);
    }
    const parentWindow = state.mainWindow && !state.mainWindow.isDestroyed() ? state.mainWindow : undefined;
    const choice = dialog.showMessageBoxSync(parentWindow!, {
      type: 'question',
      buttons: ['Reload Page', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Discard Changes?',
      message: `Do you want to reload "${account.name}"?`,
      detail: 'Changes that you made may not be saved.',
      noLink: true,
    });
    state.isNavConfirmActive = false;
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.mainWindow.webContents.send('nav-confirmation:active', false);
    }
    if (state.deferredToasts.length > 0) {
      const queued = [...state.deferredToasts];
      state.deferredToasts = [];
      for (const item of queued) {
        showAppToast(item.message, item.url);
      }
    }
    if (choice === 0) {
      event.preventDefault();
      (view.webContents as any)._lastUnloadCancelled = false;
    } else {
      (view.webContents as any)._lastUnloadCancelled = true;
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
    view.webContents.setVisualZoomLevelLimits(1, 5).catch(() => {});
    checkLoginStatus();
    injectAccountStyling(account.id, view.webContents);
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
