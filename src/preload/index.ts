const { contextBridge, ipcRenderer, webFrame } = require('electron');

export interface ExtensionInfo {
  id: string;
  name: string;
  version: string;
  path: string;
  enabled: boolean;
  source?: 'webstore' | 'developer';
}

export interface AccountInfo {
  id: string;
  name: string;
  unreadCount: number;
  partition: string;
  loggedIn?: boolean;
  extensions?: ExtensionInfo[];
  emoji?: string;
  settings?: {
    cameraEnabled: boolean;
    micEnabled: boolean;
    notificationsEnabled: boolean;
    geolocationEnabled?: boolean;
    clipboardReadEnabled?: boolean;
    customCss?: string;
    selectedTheme?: string;
  };
}

export interface GlobalSettings {
  closeToTray: boolean;
  hardwareAcceleration: boolean;
  preloadAccountIds?: string[];
  showDevToolsToggle?: boolean;
  notificationLoggingEnabled?: boolean;
  extensionDevMode?: boolean;
  startMinimized?: boolean;
  disclaimerAccepted?: boolean;
}

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
  showAccountContextMenu: (accountId: string) => void;

  // Extension controls
  importExtension: (accountId: string, importType: 'folder' | 'archive') => Promise<ExtensionInfo | null>;
  toggleExtension: (accountId: string, extensionId: string, enabled: boolean) => Promise<boolean>;
  removeExtension: (accountId: string, extensionId: string) => Promise<boolean>;
  openWebStore: (accountId: string) => void;
  installWebStoreExtension: (accountId: string, urlOrId: string) => Promise<ExtensionInfo | null>;

  // Settings & View toggle
  toggleSettings: (isOpen: boolean) => void;
  resetZoom: () => void;
  toggleDevTools: () => void;

  // Storage & Cache controls
  getStorageSizes: (accountId: string) => Promise<{ cache: number; localStorage: number; indexedDb: number; cookies: number }>;
  clearStorage: (accountId: string, type: 'cache' | 'media') => Promise<boolean>;

  // Global & Account Settings Controls
  getGlobalSettings: () => Promise<GlobalSettings>;
  saveGlobalSettings: (settings: GlobalSettings) => Promise<boolean>;
  updateAccountSettings: (accountId: string, settings: { cameraEnabled: boolean; micEnabled: boolean; notificationsEnabled: boolean }) => Promise<boolean>;

  // Notification history & CSS controls
  getNotificationHistory: () => Promise<any[]>;
  clearNotificationHistory: () => Promise<boolean>;
  saveCss: (accountId: string, customCss: string, selectedTheme: string) => Promise<boolean>;
// ... rest matches original


  // Custom protocol controls
  onProtocolReceived: (callback: (url: string) => void) => () => void;
  handleProtocolUrl: (accountId: string, url: string) => void;
  signalProtocolReady: () => void;

  // Event listeners
  onAccountListChanged: (callback: (accounts: AccountInfo[], activeId: string) => void) => () => void;
  onUnreadCountChanged: (callback: (accountId: string, count: number) => void) => () => void;
  onMaximizedStateChanged: (callback: (isMaximized: boolean) => void) => () => void;
  onZoomChanged: (callback: (zoomPercent: number) => void) => () => void;
  onTriggerRename: (callback: (accountId: string) => void) => () => void;
  onNotificationHistoryChanged: (callback: (history: any[]) => void) => () => void;
  onSettingsCloseRequest: (callback: () => void) => () => void;
  onGlobalSettingsChanged: (callback: (settings: GlobalSettings) => void) => () => void;
  onDownloadProgress: (
    callback: (data: {
      id: number;
      filename: string;
      percent: number;
      state: 'progressing' | 'completed' | 'failed';
      receivedBytes?: number;
      totalBytes?: number;
    }) => void
  ) => () => void;
  relaunchApp: () => void;
  onOpenManageAccounts: (callback: (accountId: string) => void) => () => void;
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
  showAccountContextMenu: (accountId: string) => ipcRenderer.send('account:context-menu', accountId),

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

  toggleSettings: (isOpen: boolean) => ipcRenderer.send('settings:toggle', isOpen),
  resetZoom: () => ipcRenderer.send('zoom:reset'),
  toggleDevTools: () => ipcRenderer.send('devtools:toggle'),

  getStorageSizes: (accountId) => ipcRenderer.invoke('account:get-storage-sizes', accountId),
  clearStorage: (accountId, type) => ipcRenderer.invoke('account:clear-storage', accountId, type),

  getGlobalSettings: () => ipcRenderer.invoke('settings:get-global'),
  saveGlobalSettings: (settings) => ipcRenderer.invoke('settings:save-global', settings),
  updateAccountSettings: (accountId, settings) => ipcRenderer.invoke('account:update-settings', accountId, settings),

  getNotificationHistory: () => ipcRenderer.invoke('notification:get-history'),
  clearNotificationHistory: () => ipcRenderer.invoke('notification:clear-history'),
  saveCss: (accountId, customCss, selectedTheme) => ipcRenderer.invoke('account:save-css', accountId, customCss, selectedTheme),
  relaunchApp: () => ipcRenderer.send('app:relaunch'),

  onProtocolReceived: (callback) => {
    const subscription = (_event: unknown, url: string) => callback(url);
    ipcRenderer.on('protocol:received-url', subscription);
    return () => ipcRenderer.removeListener('protocol:received-url', subscription);
  },
  handleProtocolUrl: (accountId, url) => ipcRenderer.send('protocol:handle-url', accountId, url),
  signalProtocolReady: () => ipcRenderer.send('protocol:ready'),

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
};

async function resolveIconToBase64(url: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
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

function setupWhatsAppIntegration() {
  // Light dismiss on webview click
  window.addEventListener('click', () => {
    ipcRenderer.send('webview:clicked');
  });

  // Expose safe proxy methods to the Main World
  contextBridge.exposeInMainWorld('__walinux_ipc', {
    createNotification: (data: { title: string; body: string; icon: string; tag: string }) => {
      resolveIconToBase64(data.icon).then((base64Icon) => {
        ipcRenderer.send('notification:create', {
          title: data.title,
          body: data.body,
          icon: base64Icon || '',
          tag: data.tag,
        });
      });
    },
    closeNotification: (tag: string) => {
      ipcRenderer.send('notification:close-request', tag);
    },
    onNotificationClicked: (callback: (tag: string) => void) => {
      onClickCallback = callback;
    },
    createLogEntry: (data: { title: string; body: string }) => {
      ipcRenderer.send('notification:create-log-entry', data);
    }
  });

  ipcRenderer.on('notification:clicked-reply', (_event: any, tag: string) => {
    if (onClickCallback) {
      onClickCallback(tag);
    }
  });

  // Inject the custom Notification class and the MutationObserver message tracker into the Main World (worldId 0)
  webFrame.executeJavaScriptInIsolatedWorld(0, [{
    code: `
      (() => {
        const OriginalNotification = window.Notification;
        if (!OriginalNotification) return;

        const activeNotificationCallbacks = new Map();

        if (window.__walinux_ipc) {
          window.__walinux_ipc.onNotificationClicked((tag) => {
            const callback = activeNotificationCallbacks.get(tag);
            if (callback) {
              callback();
            }
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

            if (window.__walinux_ipc) {
              window.__walinux_ipc.createNotification({
                title: this.title,
                body: this.body,
                icon: this.icon,
                tag: this.tag,
              });
            }

            setTimeout(() => {
              if (this.onshow) this.onshow();
              this.dispatchEvent(new Event('show'));
            }, 50);
          }

          close() {
            if (window.__walinux_ipc) {
              window.__walinux_ipc.closeNotification(this.tag);
            }
            activeNotificationCallbacks.delete(this.tag);
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

        // MutationObserver based message deletion and edit tracker
        const messageStore = new Map();
        const deletionPhrases = [
          'message was deleted',
          'message deleted',
          'mensaje fue eliminado',
          'mensaje eliminado',
          'mensagem foi apagada',
          'mensagem apagada',
          'message a été supprimé',
          'nachricht wurde gelöscht',
          'messaggio è stato eliminato',
          'bericht is verwijderd',
          'इस संदेश को हटा दिया गया था',
          'इस संदेश को हटा दिया गया',
          'تم حذف هذه الرسالة'
        ];

        function isDeletionText(t) {
          const clean = t.toLowerCase();
          return deletionPhrases.some(phrase => clean.includes(phrase));
        }

        function scanMessages() {
          const msgElements = document.querySelectorAll('[data-id]');
          
          // Prevent memory leaks
          if (messageStore.size > 2000) {
            const keys = Array.from(messageStore.keys());
            for (let i = 0; i < 500; i++) {
              messageStore.delete(keys[i]);
            }
          }

          for (const msgEl of msgElements) {
            const id = msgEl.getAttribute('data-id');
            if (!id) continue;

            const textEl = msgEl.querySelector('.copyable-text');
            let text = '';
            let sender = '';

            if (textEl) {
              text = textEl.textContent || '';
              const preText = textEl.getAttribute('data-pre-plain-text');
              if (preText) {
                const match = preText.match(/]\\s*([^:]+):/);
                if (match) {
                  sender = match[1].trim();
                }
              }
            } else {
              const selectable = msgEl.querySelector('.selectable-text');
              if (selectable) {
                text = selectable.textContent || '';
              } else {
                text = msgEl.textContent || '';
              }
            }

            text = text.trim();
            if (!text) continue;

            // Extract sender name from DOM layout if data-pre-plain-text wasn't available
            if (!sender) {
              const container = msgEl.closest('.message-in, .message-out');
              if (container) {
                if (container.classList.contains('message-out')) {
                  sender = 'You';
                } else {
                  const nameEl = container.querySelector('span[dir="auto"]');
                  if (nameEl && nameEl.textContent) {
                    sender = nameEl.textContent.trim();
                  }
                }
              }
            }

            if (!sender) {
              sender = 'Contact';
            }

            if (messageStore.has(id)) {
              const prev = messageStore.get(id);
              if (prev.text !== text) {
                const wasDeletion = isDeletionText(text);
                const prevWasDeletion = isDeletionText(prev.text);

                if (wasDeletion && !prevWasDeletion) {
                  // Message was deleted
                  if (window.__walinux_ipc) {
                    window.__walinux_ipc.createLogEntry({
                      title: '⚠️ [Deleted] ' + (prev.sender || sender),
                      body: 'Original: "' + prev.text + '"'
                    });
                  }
                } else if (!wasDeletion && !prevWasDeletion) {
                  // Message was edited
                  if (window.__walinux_ipc) {
                    window.__walinux_ipc.createLogEntry({
                      title: '✏️ [Edited] ' + (prev.sender || sender),
                      body: 'Original: "' + prev.text + '"\\nEdited: "' + text + '"'
                    });
                  }
                }
              }
            }

            messageStore.set(id, { text, sender, timestamp: Date.now() });
          }
        }

        // Start observing DOM changes for messages
        const observer = new MutationObserver(() => {
          scanMessages();
        });
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true
        });

        // Initial scan
        scanMessages();
      })();
    `
  }]);
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
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
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
  const badgeHtml = options.badge ? `<span class="titlebar-left-badge">${options.badge}</span>` : '';

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
      <span class="titlebar-left-title">${options.title}</span>
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
  }, 200);
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

const isWhatsApp = window.location.hostname.includes('whatsapp.com');

async function setupWebStoreInjection() {
  try {
    const targetAccountId = await ipcRenderer.invoke('webstore:get-target-account-id');
    if (!targetAccountId) return;

    let lastUrl = '';
    let isInstalling = false;

    setInterval(async () => {
      const url = window.location.href;
      if (url === lastUrl && document.getElementById('wallie-cws-btn')) {
        return;
      }
      lastUrl = url;

      const match = url.match(/\/detail\/[^/]+\/([a-p]{32})/);
      if (!match) {
        const existing = document.getElementById('wallie-cws-btn');
        if (existing) existing.remove();
        return;
      }

      const extensionId = match[1];
      const isInstalled = await ipcRenderer.invoke('webstore:check-installed', targetAccountId, extensionId);
      
      createOrUpdateWebStoreButton(targetAccountId, extensionId, isInstalled);
    }, 1000);

    function createOrUpdateWebStoreButton(accountId: string, extensionId: string, isInstalled: boolean) {
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
        fontFamily: 'system-ui, -apple-system, sans-serif',
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

export {};

