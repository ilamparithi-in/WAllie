const { contextBridge, ipcRenderer, webFrame } = require('electron');
import type { ExtensionInfo, Account as AccountInfo, GlobalSettings, HistoricalNotification, DownloadRecord, FileSecondClickAction, AppVersionInfo } from '../shared/types';

export type { ExtensionInfo, AccountInfo, GlobalSettings, HistoricalNotification, DownloadRecord, FileSecondClickAction, AppVersionInfo };

export interface ElectronAPI {
  // Window controls
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  isMaximized: () => Promise<boolean>;
  toggleAlwaysOnTop: () => void;
  getAlwaysOnTop: () => Promise<boolean>;
  onAlwaysOnTopChanged: (callback: (isAlwaysOnTop: boolean) => void) => () => void;

  // Account controls
  getAccounts: () => Promise<AccountInfo[]>;
  getActiveAccountId: () => Promise<string>;
  switchAccount: (id: string) => void;
  addAccount: (name?: string) => Promise<AccountInfo>;
  removeAccount: (id: string) => Promise<boolean>;
  renameAccount: (id: string, name: string) => Promise<boolean>;
  updateAccountEmoji: (id: string, emoji: string) => Promise<boolean>;
  reloadActiveAccount: () => void;
  reloadAccount: (accountId: string) => void;
  unloadAccount: (accountId: string) => Promise<boolean>;
  loadAccount: (accountId: string) => Promise<boolean>;
  showAccountContextMenu: (accountId: string) => void;

  // Extension controls
  importExtension: (accountId: string, importType: 'folder' | 'archive') => Promise<ExtensionInfo | null>;
  toggleExtension: (accountId: string, extensionId: string, enabled: boolean) => Promise<boolean>;
  removeExtension: (accountId: string, extensionId: string) => Promise<boolean>;
  openWebStore: (accountId: string) => void;
  installWebStoreExtension: (accountId: string, urlOrId: string) => Promise<ExtensionInfo | null>;
  checkExtensionUpdates: (accountId?: string) => Promise<{ updatedCount: number; updatedList: string[] }>;

  // Settings & View toggle
  toggleSettings: (isOpen: boolean) => void;
  toggleDisclaimer: (isOpen: boolean) => void;
  resetZoom: () => void;
  resetAppScale: () => void;
  toggleDevTools: () => void;

  // Storage & Cache controls
  getStorageSizes: (accountId: string) => Promise<{ cache: number; localStorage: number; indexedDb: number; cookies: number }>;
  clearStorage: (accountId: string, type: 'cache' | 'media') => Promise<boolean>;

  // Global & Account Settings Controls
  getGlobalSettings: () => Promise<GlobalSettings>;
  saveGlobalSettings: (settings: GlobalSettings) => Promise<boolean>;
  updateAccountSettings: (accountId: string, settings: { cameraEnabled: boolean; micEnabled: boolean; notificationsEnabled: boolean }) => Promise<boolean>;

  // Download controls
  chooseDownloadsFolder: () => Promise<string | null>;
  openDownloadedFile: (filePath: string) => Promise<boolean>;
  showItemInFolder: (filePath: string) => void;
  getDownloadHistory: () => Promise<DownloadRecord[]>;
  clearDownloadHistory: () => Promise<boolean>;

  // Notification history & CSS controls
  getNotificationHistory: () => Promise<HistoricalNotification[]>;
  clearNotificationHistory: (options?: string | { mode: string; startDate?: string; endDate?: string }) => Promise<boolean>;
  saveCss: (accountId: string, customCss: string, selectedTheme: string) => Promise<boolean>;

  // Custom protocol controls
  onProtocolReceived: (callback: (url: string) => void) => () => void;
  handleProtocolUrl: (accountId: string, url: string) => void;
  signalProtocolReady: () => void;
  toggleProtocolPrompt: (isOpen: boolean) => void;
  onToastShow: (callback: (data: { message: string; url?: string }) => void) => () => void;
  toggleWallieDevTools: () => void;

  // Event listeners
  onAccountListChanged: (callback: (accounts: AccountInfo[], activeId: string) => void) => () => void;
  onUnreadCountChanged: (callback: (accountId: string, count: number) => void) => () => void;
  onMaximizedStateChanged: (callback: (isMaximized: boolean) => void) => () => void;
  onZoomChanged: (callback: (zoomPercent: number) => void) => () => void;
  onTriggerRename: (callback: (accountId: string) => void) => () => void;
  onNotificationHistoryChanged: (callback: (history: HistoricalNotification[]) => void) => () => void;
  onSettingsCloseRequest: (callback: () => void) => () => void;
  onGlobalSettingsChanged: (callback: (settings: GlobalSettings) => void) => () => void;
  onDownloadProgress: (
    callback: (data: {
      id: number;
      filename: string;
      savePath?: string;
      percent: number;
      state: 'progressing' | 'completed' | 'failed';
      receivedBytes?: number;
      totalBytes?: number;
    }) => void
  ) => () => void;
  relaunchApp: () => void;
  onOpenManageAccounts: (callback: (accountId: string) => void) => () => void;
  focusActiveAccount: () => void;
  getAppVersion: () => Promise<AppVersionInfo>;
}

const api: ElectronAPI = {
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  toggleAlwaysOnTop: () => ipcRenderer.send('window:toggle-always-on-top'),
  getAlwaysOnTop: () => ipcRenderer.invoke('window:get-always-on-top'),

  getAccounts: () => ipcRenderer.invoke('account:get-all'),
  getActiveAccountId: () => ipcRenderer.invoke('account:get-active-id'),
  switchAccount: (id: string) => ipcRenderer.send('account:switch', id),
  addAccount: (name?: string) => ipcRenderer.invoke('account:add', name),
  removeAccount: (id: string) => ipcRenderer.invoke('account:remove', id),
  renameAccount: (id: string, name: string) => ipcRenderer.invoke('account:rename', id, name),
  updateAccountEmoji: (id: string, emoji: string) => ipcRenderer.invoke('account:update-emoji', id, emoji),
  reloadActiveAccount: () => ipcRenderer.send('account:reload-active'),
  reloadAccount: (accountId: string) => ipcRenderer.send('account:reload', accountId),
  unloadAccount: (accountId: string) => ipcRenderer.invoke('account:unload', accountId),
  loadAccount: (accountId: string) => ipcRenderer.invoke('account:load', accountId),
  showAccountContextMenu: (accountId: string) => ipcRenderer.send('account:context-menu', accountId),
  focusActiveAccount: () => ipcRenderer.send('account:focus-active'),

  importExtension: (accountId: string, importType: 'folder' | 'archive') =>
    ipcRenderer.invoke('extension:import', accountId, importType),
  toggleExtension: (accountId: string, extensionId: string, enabled: boolean) =>
    ipcRenderer.invoke('extension:toggle', accountId, extensionId, enabled),
  removeExtension: (accountId: string, extensionId: string) =>
    ipcRenderer.invoke('extension:remove', accountId, extensionId),
  openWebStore: (accountId: string) =>
    ipcRenderer.send('webstore:open', accountId),
  installWebStoreExtension: (accountId: string, urlOrId: string) =>
    ipcRenderer.invoke('extension:install-webstore', accountId, urlOrId),
  checkExtensionUpdates: (accountId?: string) =>
    ipcRenderer.invoke('extension:check-updates', accountId),

  toggleSettings: (isOpen: boolean) => ipcRenderer.send('settings:toggle', isOpen),
  toggleDisclaimer: (isOpen: boolean) => ipcRenderer.send('disclaimer:toggle', isOpen),
  resetZoom: () => ipcRenderer.send('zoom:reset'),
  resetAppScale: () => ipcRenderer.send('settings:reset-app-scale'),
  toggleDevTools: () => ipcRenderer.send('devtools:toggle'),

  getStorageSizes: (accountId) => ipcRenderer.invoke('account:get-storage-sizes', accountId),
  clearStorage: (accountId, type) => ipcRenderer.invoke('account:clear-storage', accountId, type),

  getGlobalSettings: () => ipcRenderer.invoke('settings:get-global'),
  saveGlobalSettings: (settings) => ipcRenderer.invoke('settings:save-global', settings),
  updateAccountSettings: (accountId, settings) => ipcRenderer.invoke('account:update-settings', accountId, settings),

  chooseDownloadsFolder: () => ipcRenderer.invoke('downloads:choose-folder'),
  openDownloadedFile: (filePath) => ipcRenderer.invoke('downloads:open-file', filePath),
  showItemInFolder: (filePath) => ipcRenderer.invoke('downloads:show-in-folder', filePath),
  getDownloadHistory: () => ipcRenderer.invoke('downloads:get-history'),
  clearDownloadHistory: () => ipcRenderer.invoke('downloads:clear-history'),

  getNotificationHistory: () => ipcRenderer.invoke('notification:get-history'),
  clearNotificationHistory: (options) => ipcRenderer.invoke('notification:clear-history', options),
  saveCss: (accountId, customCss, selectedTheme) => ipcRenderer.invoke('account:save-css', accountId, customCss, selectedTheme),
  relaunchApp: () => ipcRenderer.send('app:relaunch'),

  onProtocolReceived: (callback) => {
    const subscription = (_event: unknown, url: string) => callback(url);
    ipcRenderer.on('protocol:received-url', subscription);
    return () => ipcRenderer.removeListener('protocol:received-url', subscription);
  },
  handleProtocolUrl: (accountId, url) => ipcRenderer.send('protocol:handle-url', accountId, url),
  signalProtocolReady: () => ipcRenderer.send('protocol:ready'),
  toggleProtocolPrompt: (isOpen) => ipcRenderer.send('protocol:toggle-prompt', isOpen),
  toggleWallieDevTools: () => ipcRenderer.send('devtools:toggle-wallie'),
  onToastShow: (callback) => {
    const subscription = (_event: unknown, data: { message: string; url?: string }) => callback(data);
    ipcRenderer.on('toast:show', subscription);
    return () => ipcRenderer.removeListener('toast:show', subscription);
  },

  onAccountListChanged: (callback) => {
    const subscription = (_event: unknown, accounts: AccountInfo[], activeId: string) => callback(accounts, activeId);
    ipcRenderer.on('account:list-changed', subscription);
    return () => ipcRenderer.removeListener('account:list-changed', subscription);
  },

  onUnreadCountChanged: (callback) => {
    const subscription = (_event: unknown, accountId: string, count: number) => callback(accountId, count);
    ipcRenderer.on('account:unread-changed', subscription);
    return () => ipcRenderer.removeListener('account:unread-changed', subscription);
  },

  onMaximizedStateChanged: (callback) => {
    const subscription = (_event: unknown, isMaximized: boolean) => callback(isMaximized);
    ipcRenderer.on('window:maximized-changed', subscription);
    return () => ipcRenderer.removeListener('window:maximized-changed', subscription);
  },

  onZoomChanged: (callback) => {
    const subscription = (_event: unknown, zoomPercent: number) => callback(zoomPercent);
    ipcRenderer.on('zoom:changed', subscription);
    return () => ipcRenderer.removeListener('zoom:changed', subscription);
  },

  onTriggerRename: (callback) => {
    const subscription = (_event: unknown, accountId: string) => callback(accountId);
    ipcRenderer.on('account:trigger-rename', subscription);
    return () => ipcRenderer.removeListener('account:trigger-rename', subscription);
  },

  onNotificationHistoryChanged: (callback) => {
    const subscription = (_event: unknown, history: any[]) => callback(history);
    ipcRenderer.on('notification:history-changed', subscription);
    return () => ipcRenderer.removeListener('notification:history-changed', subscription);
  },

  onSettingsCloseRequest: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('settings:close-request', subscription);
    return () => ipcRenderer.removeListener('settings:close-request', subscription);
  },

  onOpenManageAccounts: (callback) => {
    const subscription = (_event: unknown, accountId: string) => callback(accountId);
    ipcRenderer.on('settings:open-manage-accounts', subscription);
    return () => ipcRenderer.removeListener('settings:open-manage-accounts', subscription);
  },

  onGlobalSettingsChanged: (callback) => {
    const subscription = (_event: unknown, settings: GlobalSettings) => callback(settings);
    ipcRenderer.on('settings:global-changed', subscription);
    return () => ipcRenderer.removeListener('settings:global-changed', subscription);
  },

  onDownloadProgress: (callback) => {
    const subscription = (
      _event: unknown,
      data: {
        id: number;
        filename: string;
        savePath?: string;
        percent: number;
        state: 'progressing' | 'completed' | 'failed';
        receivedBytes?: number;
        totalBytes?: number;
      }
    ) => callback(data);
    ipcRenderer.on('download:progress', subscription);
    return () => ipcRenderer.removeListener('download:progress', subscription);
  },

  onAlwaysOnTopChanged: (callback) => {
    const subscription = (_event: unknown, isAlwaysOnTop: boolean) => callback(isAlwaysOnTop);
    ipcRenderer.on('window:always-on-top-changed', subscription);
    return () => ipcRenderer.removeListener('window:always-on-top-changed', subscription);
  },

  getAppVersion: () => ipcRenderer.invoke('app:get-version-info'),
};

// Defined inline here because build:preload cleans dist/preload/shared.
// Canonical definition is maintained in src/shared/constants.ts.
const WHATSAPP_DOMAIN_REGEX = /^([^.\s]+\.)*whatsapp\.(com|net)$/i;

async function resolveIconToBase64(url: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  // Only fetch avatars from WhatsApp's own CDN
  try {
    const parsedUrl = new URL(url);
    const isWhatsApp = WHATSAPP_DOMAIN_REGEX.test(parsedUrl.hostname);
    if (!isWhatsApp) {
      console.warn('Blocked non-WhatsApp avatar URL:', parsedUrl.hostname);
      return null;
    }
  } catch {
    return null;
  }
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error('Failed to resolve avatar to base64:', err);
    return null;
  }
}

let onClickCallback: ((tag: string) => void) | null = null;
let onInlineReplyCallback: ((data: { contactName: string; text: string; tag: string }) => void) | null = null;

function setupWhatsAppIntegration() {
  // Light dismiss on webview click
  window.addEventListener('click', () => {
    ipcRenderer.send('webview:clicked');
  });

  // Capture clicks on document to detect Context Menu Download or Second-click on file
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // 1. Context Menu "Download" detection
    const menuItem = target.closest('[role="button"], li, div[class*="menu-item"], div[tabindex="-1"]');
    if (menuItem) {
      const text = (menuItem.textContent || '').trim().toLowerCase();
      const isDownloadText = text === 'download' || text.startsWith('download ') || text.includes('download');
      const hasDownloadIcon = !!menuItem.querySelector('[data-icon*="download"], [data-testid*="download"]');
      const isInsideMenu = !!target.closest('[role="application"], [data-testid="context-menu"], [class*="popup"], [class*="menu"], [class*="dropdown"], [role="menu"]');

      if ((isDownloadText || hasDownloadIcon) && isInsideMenu) {
        console.log('[walinux] Context menu Download clicked -> intent: context-menu-download');
        ipcRenderer.send('download:set-intent', { intent: 'context-menu-download' });
        return;
      }
    }

    // 2. Message / Document card detection
    const msgContainer = target.closest('[data-id], div[class*="message-in"], div[class*="message-out"], [data-testid="msg-container"]');
    if (msgContainer) {
      // Check if download button is present in this message
      const downloadBtn = msgContainer.querySelector(
        '[data-icon="download"], [data-testid="download"], [data-testid="audio-download"], [data-icon="audio-download"], button[aria-label*="download" i]'
      );
      const clickedDownloadBtn = target.closest(
        '[data-icon="download"], [data-testid="download"], [data-testid="audio-download"], [data-icon="audio-download"], button[aria-label*="download" i]'
      );

      if (clickedDownloadBtn || downloadBtn) {
        console.log('[walinux] Download button present -> intent: first-download');
        ipcRenderer.send('download:set-intent', { intent: 'first-download' });
      } else {
        // Download button is not present, check if this is a file card
        const titleEl = msgContainer.querySelector('span[title], div[title]');
        const filename = titleEl ? titleEl.getAttribute('title') || titleEl.textContent || '' : '';
        const hasExtension = /\.[a-z0-9]{2,5}$/i.test(filename.trim());
        const isDocCard = !!msgContainer.querySelector('[data-icon="document"], [data-icon="default-doc"], [data-testid="document-thumb"]');

        if (hasExtension || isDocCard) {
          console.log('[walinux] File card clicked without download button -> intent: second-click for:', filename.trim());
          ipcRenderer.send('download:set-intent', { intent: 'second-click', filename: filename.trim() });
        }
      }
    }
  }, true);

  // Expose safe proxy methods to the Main World
  contextBridge.exposeInMainWorld('__walinux_report_zoom', (scale: number) => {
    ipcRenderer.send('zoom:visual-changed', scale);
  });

  contextBridge.exposeInMainWorld('__walinux_trigger_zoom', (direction: 'in' | 'out') => {
    ipcRenderer.send('zoom:trigger-step', direction);
  });

  contextBridge.exposeInMainWorld('__walinux_ipc', {
    createNotification: (data: { title: string; body: string; icon: string; tag: string; canReply?: boolean }) => {
      resolveIconToBase64(data.icon).then((base64Icon) => {
        ipcRenderer.send('notification:create', {
          title: data.title,
          body: data.body,
          icon: base64Icon || '',
          tag: data.tag,
          canReply: data.canReply,
        });
      });
    },
    closeNotification: (_tag: string) => {
      // Ignored for desktop notifications
    },
    onNotificationClicked: (callback: (data: any) => void) => {
      onClickCallback = callback;
    },
    onSendInlineReply: (callback: (data: { contactName: string; text: string; tag: string }) => void) => {
      onInlineReplyCallback = callback;
    },
    onAnchorDownload: (filename: string) => {
      ipcRenderer.send('download:set-intent', { intent: 'anchor-detected', filename });
    },
  });

  ipcRenderer.on('notification:clicked-reply', (_event: any, data: any) => {
    if (onClickCallback) {
      onClickCallback(data);
    }
  });

  ipcRenderer.on('notification:send-inline-reply', (_event: any, data: { contactName: string; text: string; tag: string }) => {
    if (onInlineReplyCallback) {
      onInlineReplyCallback(data);
    }
  });

  // Inject the custom Notification class into the Main World (worldId 0)
  webFrame.executeJavaScriptInIsolatedWorld(0, [{
    code: `
      (() => {
        const OriginalNotification = window.Notification;
        if (!OriginalNotification) return;

        const activeNotificationCallbacks = new Map();

        function norm(s) {
          return (s || '').replace(/\\s+/g, ' ').trim().toLowerCase();
        }

        function vis(e) {
          if (!e) return false;
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        }

        function triggerEvents(el, types) {
          if (!el) return;
          const r = el.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          types.forEach((type) => {
            const Ev = type.startsWith('pointer') ? PointerEvent : MouseEvent;
            try {
              el.dispatchEvent(new Ev(type, {
                bubbles: true,
                cancelable: true,
                clientX: cx,
                clientY: cy,
                button: 0,
              }));
            } catch (e) {}
          });
        }

        function getSearchBox() {
          return (
            document.querySelector('input[aria-label*="Search" i]') ||
            document.querySelector('input[aria-label*="Buscar" i]') ||
            document.querySelector('input[data-tab="3"]') ||
            document.querySelector('div[contenteditable="true"][data-tab="3"]')
          );
        }

        function setSearchText(el, val) {
          el.focus();
          if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            const proto = el.tagName === 'INPUT' ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
            try {
              Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val);
            } catch (e) {
              el.value = val;
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));
          } else {
            try { document.execCommand('selectAll', false, null); } catch (e) {}
            try { document.execCommand('insertText', false, val); } catch (e) {}
            el.dispatchEvent(new InputEvent('input', { bubbles: true }));
          }
        }

        function findMatchingRow(query) {
          const rows = Array.from(document.querySelectorAll(
            '#pane-side [role="row"], #side [role="row"], #pane-side [role="listitem"], #side [role="listitem"]'
          )).filter(vis);

          for (const row of rows) {
            const t = row.querySelector('span[title]');
            if (t && norm(t.getAttribute('title') || t.textContent) === query) {
              return row;
            }
          }
          return null;
        }

        if (window.__walinux_ipc) {
          window.__walinux_ipc.onNotificationClicked((arg) => {
            const tag = typeof arg === 'string' ? arg : arg?.tag;
            const contactName = typeof arg === 'object' ? arg?.contactName : '';

            const callback = activeNotificationCallbacks.get(tag);
            if (callback) {
              try { callback(); } catch (e) {}
            }

            if (contactName) {
              const targetQuery = norm(contactName);
              setTimeout(() => {
                const activeHeader = document.querySelector('header span[title]');
                if (!activeHeader || norm(activeHeader.textContent) !== targetQuery) {
                  const row = findMatchingRow(targetQuery);
                  if (row) {
                    const clickTarget = row.querySelector('span[title]') || row;
                    triggerEvents(clickTarget, ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);
                  } else {
                    const sbox = getSearchBox();
                    if (sbox) {
                      setSearchText(sbox, contactName);
                      setTimeout(() => {
                        const searchedRow = findMatchingRow(targetQuery);
                        if (searchedRow) {
                          const clickTarget = searchedRow.querySelector('span[title]') || searchedRow;
                          triggerEvents(clickTarget, ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);
                        }
                      }, 150);
                    }
                  }
                }
              }, 100);
            }
          });

          window.__walinux_ipc.onSendInlineReply((data) => {
            const { contactName, text, tag } = data;

            function getComposer() {
              const candidates = Array.from(document.querySelectorAll(
                'footer div[contenteditable="true"][role="textbox"], div[contenteditable="true"][data-tab="10"], div[contenteditable="true"][data-tab="6"]'
              )).filter(vis);
              return candidates.length ? candidates[candidates.length - 1] : null;
            }

            function getSendButton() {
              const icon = (
                document.querySelector('[data-icon="wds-ic-send-filled"]') ||
                document.querySelector('span[data-icon="send"]')
              );
              if (icon) {
                return icon.closest('button, [role="button"]') || icon;
              }
              const candidates = Array.from(document.querySelectorAll(
                'button[aria-label], [role="button"][aria-label]'
              )).filter((x) => /^(send|enviar)/i.test(x.getAttribute('aria-label') || '') && vis(x));
              return candidates.length ? candidates[candidates.length - 1] : null;
            }

            function doSendText(comp) {
              comp.focus();
              try {
                document.execCommand('selectAll', false, null);
                document.execCommand('insertText', false, text);
              } catch (e) {}
              comp.dispatchEvent(new InputEvent('input', { bubbles: true }));

              setTimeout(() => {
                const btn = getSendButton();
                if (btn) {
                  triggerEvents(btn, ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);
                }
              }, 150);
            }

            // Step 1: Trigger notification callback if available to open chat immediately
            const notifCallback = activeNotificationCallbacks.get(tag);
            if (notifCallback) {
              try { notifCallback(); } catch (e) {}
            }

            // Step 2: Poll for composer or search
            let attempts = 0;
            let searched = false;
            const targetQuery = norm(contactName);

            const interval = setInterval(() => {
              attempts++;
              if (attempts > 50) {
                clearInterval(interval);
                return;
              }

              const comp = getComposer();
              if (comp) {
                clearInterval(interval);
                doSendText(comp);
                return;
              }

              if (!searched && attempts > 8) {
                const sbox = getSearchBox();
                if (sbox) {
                  setSearchText(sbox, contactName);
                  searched = true;
                }
              }

              if (searched) {
                const row = findMatchingRow(targetQuery);
                if (row) {
                  const clickTarget = row.querySelector('span[title]') || row;
                  triggerEvents(clickTarget, ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);
                }
              }
            }, 100);
          });
        }

        class CustomNotification extends EventTarget {
          constructor(title, options = {}) {
            super();
            this.title = title;
            this.body = options.body || '';
            this.icon = options.icon || '';
            this.tag = options.tag || 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);

            if (this.tag) {
              activeNotificationCallbacks.set(this.tag, () => {
                if (this.onclick) this.onclick();
                this.dispatchEvent(new Event('click'));
              });
            }

            function isReadOnlyChat(tag, title, opts) {
              if (tag && (tag.endsWith('@newsletter') || tag.endsWith('@broadcast'))) {
                return true;
              }

              if (opts && opts.data) {
                const d = opts.data;
                if (d.readOnly || d.isReadOnly || d.canSend === false) return true;
                if (d.chat && (d.chat.readOnly || d.chat.isReadOnly || d.chat.canSend === false)) return true;
                if (d.chat && d.chat.groupMetadata && d.chat.groupMetadata.announce && !d.chat.groupMetadata.canSend) return true;
              }

              try {
                let chatCollection = null;
                if (typeof window.require === 'function') {
                  try {
                    const mod = window.require('WAWebChatCollection');
                    chatCollection = mod ? (mod.ChatCollection || mod.default) : null;
                  } catch (e) {}
                }
                if (!chatCollection && window.Store && window.Store.Chat) {
                  chatCollection = window.Store.Chat;
                }

                if (chatCollection) {
                  let chat = null;
                  if (tag && typeof chatCollection.get === 'function') {
                    chat = chatCollection.get(tag);
                  }
                  if (!chat && chatCollection.models && Array.isArray(chatCollection.models)) {
                    const normTitle = (title || '').trim().toLowerCase();
                    chat = chatCollection.models.find((c) => {
                      if (tag && c.id && (c.id._serialized === tag || c.id === tag)) return true;
                      const cName = (c.name || c.formattedTitle || '').trim().toLowerCase();
                      return cName && normTitle && cName === normTitle;
                    });
                  }

                  if (chat) {
                    if (chat.readOnly === true || chat.isReadOnly === true || chat.canSend === false) {
                      return true;
                    }
                    if (chat.groupMetadata) {
                      const gm = chat.groupMetadata;
                      if (gm.announce) {
                        if (gm.canSend === false) return true;
                        if (gm.isSenderAnAdmin === false) return true;
                      }
                    }
                  }
                }
              } catch (e) {}

              try {
                const activeHeader = document.querySelector('header span[title]');
                if (activeHeader && title && activeHeader.textContent.trim().toLowerCase() === title.trim().toLowerCase()) {
                  const composer = document.querySelector('footer div[contenteditable="true"][role="textbox"]');
                  const lockBanner = document.querySelector('footer [data-icon="lock"], footer [data-icon="channel"], div[data-testid="conversation-footer-banner"]');
                  if (!composer || lockBanner) {
                    return true;
                  }
                }
              } catch (e) {}

              return false;
            }

            const isReadOnly = isReadOnlyChat(this.tag, this.title, options);
            const canReply = !isReadOnly;

            if (window.__walinux_ipc) {
              window.__walinux_ipc.createNotification({
                title: this.title,
                body: this.body,
                icon: this.icon,
                tag: this.tag,
                canReply: canReply,
              });
            }

            setTimeout(() => {
              if (this.onshow) this.onshow();
              this.dispatchEvent(new Event('show'));
            }, 50);
          }

          close() {
            // Note: In web browsers, WhatsApp Web automatically calls .close() after ~2-3s.
            // For desktop notifications, we do NOT forward this dismissal to D-Bus/KDE Plasma
            // because users need time to read and type inline replies.
            // The desktop notification manager handles its own lifecycle and timeout (25s).
            setTimeout(() => {
              activeNotificationCallbacks.delete(this.tag);
            }, 120000);
            if (this.onclose) this.onclose();
            this.dispatchEvent(new Event('close'));
          }

          static get permission() {
            return OriginalNotification.permission;
          }

          static requestPermission(callback) {
            return OriginalNotification.requestPermission(callback);
          }
        }

        window.Notification = CustomNotification;

        if (window.ServiceWorkerRegistration && window.ServiceWorkerRegistration.prototype) {
          window.ServiceWorkerRegistration.prototype.showNotification = function(title, options = {}) {
            new CustomNotification(title, options);
            return Promise.resolve();
          };
        }

        if (window.HTMLAnchorElement && window.HTMLAnchorElement.prototype) {
          const originalAnchorClick = window.HTMLAnchorElement.prototype.click;
          window.HTMLAnchorElement.prototype.click = function() {
            if (this.download && window.__walinux_ipc && window.__walinux_ipc.onAnchorDownload) {
              window.__walinux_ipc.onAnchorDownload(this.download);
            }
            return originalAnchorClick.apply(this, arguments);
          };
        }
      })();
    `
  }]);
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function injectUnifiedTitlebar(options: {
  title: string;
  badge?: string;
  iconType: 'call' | 'devtools';
  controls: ('pin' | 'min' | 'max' | 'close')[];
}) {
  // Wait for documentElement and body to be available
  if (!document.documentElement || !document.body) {
    setTimeout(() => injectUnifiedTitlebar(options), 50);
    return;
  }

  // Check if already injected
  if (document.getElementById('custom-titlebar')) return;

  // Create style element to shift body content and style html/body
  const style = document.createElement('style');
  style.id = 'custom-titlebar-styles';
  style.innerHTML = `
    html, body {
      background-color: #111b21 !important;
      margin: 0 !important;
      padding: 0 !important;
      height: 100% !important;
      overflow: hidden !important;
    }
    body > :not(#custom-titlebar) {
      transform: translateY(28px) !important;
      height: calc(100% - 28px) !important;
    }
    #custom-titlebar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 28px;
      background-color: #111b21;
      border-bottom: 1px solid #222d34;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #aebac1;
      font-size: 11px;
      font-weight: 500;
      z-index: 999999;
      user-select: none;
    }
    .titlebar-left {
      display: flex;
      align-items: center;
      gap: 6px;
      padding-left: 10px;
      -webkit-app-region: no-drag;
    }
    .titlebar-left-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      color: #00a884;
    }
    .titlebar-left-icon svg {
      width: 14px;
      height: 14px;
    }
    .titlebar-left-title {
      color: #e9edef;
      font-weight: 600;
      letter-spacing: 0.3px;
    }
    .titlebar-left-badge {
      padding: 1px 6px;
      background: rgba(0, 168, 132, 0.1);
      border: 1px solid rgba(0, 168, 132, 0.2);
      color: #00a884;
      border-radius: 4px;
      font-size: 9px;
      font-weight: bold;
    }
    .titlebar-drag-region {
      flex: 1;
      height: 100%;
      -webkit-app-region: drag;
      cursor: move;
    }
    .titlebar-right {
      display: flex;
      align-items: center;
      height: 100%;
      gap: 2px;
      padding-right: 4px;
      -webkit-app-region: no-drag;
    }
    .titlebar-btn {
      width: 28px;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: transparent;
      color: #8696a0;
      cursor: pointer;
      transition: background-color 0.2s, color 0.2s;
    }
    .titlebar-btn-close {
      width: 32px;
    }
    .titlebar-btn:hover {
      background-color: #202c33;
      color: #e9edef;
    }
    .titlebar-btn-close:hover {
      background-color: #ea4335 !important;
      color: #ffffff !important;
    }
    .titlebar-btn svg {
      width: 13px;
      height: 13px;
    }
    .titlebar-divider {
      height: 12px;
      width: 1px;
      background-color: #222d34;
      margin: 0 4px;
    }
  `;
  document.documentElement.appendChild(style);

  // SVGs definition matching Lucide icons exactly
  const phoneIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>`;
  const codeIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`;
  const pinIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-.44-1.24l-2.78-3.5A2 2 0 0 1 15 9.24V5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v4.24a2 2 0 0 1-.78 1.28l-2.78 3.5a2 2 0 0 0-.44 1.24z"></path></svg>`;
  const minIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
  const maxIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" id="max-icon-svg"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>`;
  const closeIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

  const container = document.createElement('div');
  container.id = 'custom-titlebar';

  const leftIcon = options.iconType === 'call' ? phoneIcon : codeIcon;
  const safeTitle = escapeHtml(options.title || '');
  const safeBadge = options.badge ? escapeHtml(options.badge) : '';
  const badgeHtml = safeBadge ? `<span class="titlebar-left-badge">${safeBadge}</span>` : '';

  let controlsHtml = '';
  options.controls.forEach((control) => {
    if (control === 'pin') {
      controlsHtml += `<button class="titlebar-btn" id="pin-btn" title="Pin (Stay on Top)">${pinIcon}</button>`;
      controlsHtml += `<div class="titlebar-divider"></div>`;
    } else if (control === 'min') {
      controlsHtml += `<button class="titlebar-btn" id="min-btn" title="Minimize">${minIcon}</button>`;
    } else if (control === 'max') {
      controlsHtml += `<button class="titlebar-btn" id="max-btn" title="Maximize">${maxIcon}</button>`;
    } else if (control === 'close') {
      controlsHtml += `<button class="titlebar-btn titlebar-btn-close" id="close-btn" title="Close">${closeIcon}</button>`;
    }
  });

  container.innerHTML = `
    <div class="titlebar-left">
      <span class="titlebar-left-icon">${leftIcon}</span>
      <span class="titlebar-left-title">${safeTitle}</span>
      ${badgeHtml}
    </div>
    <div class="titlebar-drag-region"></div>
    <div class="titlebar-right">
      ${controlsHtml}
    </div>
  `;

  document.body.appendChild(container);

  const pinBtn = document.getElementById('pin-btn');
  const minBtn = document.getElementById('min-btn');
  const maxBtn = document.getElementById('max-btn');
  const closeBtn = document.getElementById('close-btn');

  if (pinBtn) {
    ipcRenderer.invoke('window:get-always-on-top').then((isPinned: boolean) => {
      pinBtn.style.color = isPinned ? '#00a884' : '#8696a0';
    });

    pinBtn.addEventListener('click', () => {
      ipcRenderer.send('window:toggle-always-on-top');
    });

    ipcRenderer.on('window:always-on-top-changed', (_event: any, isPinned: boolean) => {
      pinBtn.style.color = isPinned ? '#00a884' : '#8696a0';
    });
  }

  if (minBtn) {
    minBtn.addEventListener('click', () => {
      ipcRenderer.send('window:minimize');
    });
  }

  if (maxBtn) {
    maxBtn.addEventListener('click', () => {
      ipcRenderer.send('window:maximize');
    });

    ipcRenderer.on('window:maximized-changed', (_event: any, isMaximized: boolean) => {
      const maxSvg = document.getElementById('max-icon-svg');
      if (maxSvg) {
        if (isMaximized) {
          maxSvg.setAttribute('style', 'transform: rotate(180deg); width: 12px; height: 12px;');
          maxSvg.innerHTML = '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>';
        } else {
          maxSvg.removeAttribute('style');
          maxSvg.setAttribute('style', 'width: 12px; height: 12px;');
          maxSvg.innerHTML = '<rect width="18" height="18" x="3" y="3" rx="2"/>';
        }
      }
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      ipcRenderer.send('window:close');
    });
  }
}

function monitorCallBlankScreen() {
  let callWasActive = false;
  let blankCounter = 0;
  let initialBlankTicks = 0;

  const interval = setInterval(() => {
    if (!document.body) return;

    // Detect active call components
    const hasVideo = document.querySelector('video') !== null;
    const hasAudio = document.querySelector('audio') !== null;
    const hasCanvas = document.querySelector('canvas') !== null;

    // Check for common call controls (buttons or SVGs with aria-labels or titles)
    const callControls = document.querySelectorAll(
      '[data-testid*="call"], [data-testid*="hangup"], [data-testid*="micro"], [data-testid*="video"], [data-testid*="screen"]'
    );
    const hasCallControls = callControls.length > 0;

    const isCallActive = hasVideo || hasAudio || hasCanvas || hasCallControls;

    if (isCallActive) {
      callWasActive = true;
      blankCounter = 0;
      return;
    }

    if (callWasActive) {
      // Check if a survey is shown by searching for keywords
      const bodyText = (document.body.innerText || '').toLowerCase();
      const hasSurveyKeywords = ['how was', 'rate', 'feedback', 'quality', 'survey', 'stars', 'opinion'].some(
        (keyword) => bodyText.includes(keyword)
      );

      if (!hasSurveyKeywords) {
        blankCounter++;
        if (blankCounter >= 3) { // 3 consecutive checks (~600ms) of blank screen
          console.log('[walinux] Call ended and screen is blank, closing window immediately.');
          clearInterval(interval);
          window.close();
        }
      } else {
        blankCounter = 0; // Reset if user is prompted with the survey
      }
    } else {
      // Safe guard for calls that never load or get stuck on initialization
      initialBlankTicks++;
      if (initialBlankTicks >= 50) { // 50 * 200ms = 10 seconds
        const bodyText = (document.body.innerText || '').trim();
        if (bodyText.length < 10 && document.querySelectorAll('button').length === 0) {
          console.log('[walinux] Call failed to load (remained blank for 10s), closing window.');
          clearInterval(interval);
          window.close();
        }
      }
    }
  }, 1000);
}

function injectCallTitlebar() {
  ipcRenderer.invoke('account:get-name-for-session').then((accountName: string) => {
    injectUnifiedTitlebar({
      title: 'WhatsApp Call',
      badge: accountName,
      iconType: 'call',
      controls: ['pin', 'min', 'close']
    });
    monitorCallBlankScreen();
  });
}

const isWhatsApp = WHATSAPP_DOMAIN_REGEX.test(window.location.hostname);

async function setupWebStoreInjection() {
  try {
    const targetAccountId = await ipcRenderer.invoke('webstore:get-target-account-id');
    if (!targetAccountId) return;

    let isInstalling = false;
    let lastUrl = '';

    async function checkAndUpdateButton() {
      const url = window.location.href;
      const match = url.match(/\/detail\/(?:[^/]+\/)?([a-p]{32})/i);
      if (!match) {
        const existing = document.getElementById('wallie-cws-btn');
        if (existing) existing.remove();
        return;
      }

      const extensionId = match[1].toLowerCase();
      const isInstalled = await ipcRenderer.invoke('webstore:check-installed', targetAccountId, extensionId);

      createOrUpdateWebStoreButton(targetAccountId, extensionId, isInstalled);
    }

    function createOrUpdateWebStoreButton(accountId: string, extensionId: string, isInstalled: boolean) {
      if (!document.body) return;

      let btn = document.getElementById('wallie-cws-btn');
      if (!btn) {
        btn = document.createElement('div');
        btn.id = 'wallie-cws-btn';
        document.body.appendChild(btn);
      }

      btn.className = '';

      Object.assign(btn.style, {
        position: 'fixed',
        top: '76px',
        right: '24px',
        zIndex: '999999',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        fontSize: '13px',
        fontWeight: '700',
        padding: '10px 18px',
        borderRadius: '20px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        transition: 'all 0.2s ease-in-out',
        border: '1px solid rgba(255,255,255,0.1)',
        userSelect: 'none'
      });

      if (isInstalled) {
        btn.innerText = 'Installed ✓';
        btn.classList.add('disabled');
        Object.assign(btn.style, {
          backgroundColor: '#202c33',
          color: '#8696a0',
          cursor: 'not-allowed',
          transform: 'none'
        });
        btn.onclick = null;
      } else {
        btn.innerText = 'Install in WAllie';
        Object.assign(btn.style, {
          backgroundColor: '#00a884',
          color: '#111b21',
          cursor: 'pointer'
        });

        btn.onmouseenter = () => {
          if (!isInstalling) {
            btn!.style.backgroundColor = '#00c298';
            btn!.style.transform = 'translateY(-2px)';
          }
        };
        btn.onmouseleave = () => {
          if (!isInstalling) {
            btn!.style.backgroundColor = '#00a884';
            btn!.style.transform = 'none';
          }
        };

        btn.onclick = async () => {
          if (isInstalling) return;
          isInstalling = true;

          btn!.innerText = 'Installing...';
          Object.assign(btn!.style, {
            backgroundColor: '#202c33',
            color: '#e9edef',
            cursor: 'wait',
            transform: 'none'
          });

          try {
            const result = await ipcRenderer.invoke('extension:install-webstore', accountId, extensionId);
            isInstalling = false;
            if (result) {
              createOrUpdateWebStoreButton(accountId, extensionId, true);
            } else {
              showErrorState();
            }
          } catch (err) {
            isInstalling = false;
            showErrorState();
          }
        };
      }

      function showErrorState() {
        btn!.innerText = 'Failed. Try Again';
        Object.assign(btn!.style, {
          backgroundColor: '#ea4335',
          color: '#ffffff',
          cursor: 'pointer'
        });
      }
    }

    function init() {
      lastUrl = window.location.href;
      checkAndUpdateButton();

      // Listen for popstate SPA events
      window.addEventListener('popstate', checkAndUpdateButton);

      // Interval fallback for URL changes
      setInterval(() => {
        if (window.location.href !== lastUrl) {
          lastUrl = window.location.href;
          checkAndUpdateButton();
        }
      }, 1000);
    }

    if (document.body) {
      init();
    } else {
      window.addEventListener('DOMContentLoaded', init, { once: true });
    }
  } catch (err) {
    console.error('[walinux] Failed to setup webstore injection:', err);
  }
}

if (!isWhatsApp) {
  contextBridge.exposeInMainWorld('electronAPI', api);

  window.addEventListener('DOMContentLoaded', () => {
    const isDevTools = !!document.querySelector('meta[name="is-devtools"]');
    if (isDevTools) {
      const accountNameMeta = document.querySelector('meta[name="account-name"]');
      const accountName = accountNameMeta ? decodeURIComponent(accountNameMeta.getAttribute('content') || '') : 'Account';
      injectUnifiedTitlebar({
        title: 'DevTools',
        badge: accountName,
        iconType: 'devtools',
        controls: ['min', 'max', 'close']
      });
    }
  });

  if (window.location.hostname === 'chromewebstore.google.com') {
    setupWebStoreInjection();
  }
} else {
  setupWhatsAppIntegration();
  if (window.location.pathname.includes('/call')) {
    injectCallTitlebar();
  }
}

export { };

