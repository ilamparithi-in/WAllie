const { contextBridge, ipcRenderer } = require('electron');

export interface ExtensionInfo {
  id: string;
  name: string;
  version: string;
  path: string;
  enabled: boolean;
}

export interface AccountInfo {
  id: string;
  name: string;
  unreadCount: number;
  partition: string;
  loggedIn?: boolean;
  extensions?: ExtensionInfo[];
  settings?: {
    cameraEnabled: boolean;
    micEnabled: boolean;
    notificationsEnabled: boolean;
    customCss?: string;
    selectedTheme?: string;
  };
}

export interface GlobalSettings {
  closeToTray: boolean;
  hardwareAcceleration: boolean;
  loadAllOnLaunch: boolean;
  showDevToolsToggle?: boolean;
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
  reloadActiveAccount: () => void;
  showAccountContextMenu: (accountId: string) => void;

  // Extension controls
  importExtension: (accountId: string, importType: 'folder' | 'archive') => Promise<ExtensionInfo | null>;
  toggleExtension: (accountId: string, extensionId: string, enabled: boolean) => Promise<boolean>;
  removeExtension: (accountId: string, extensionId: string) => Promise<boolean>;

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
  reloadActiveAccount: () => ipcRenderer.send('account:reload-active'),
  showAccountContextMenu: (accountId: string) => ipcRenderer.send('account:context-menu', accountId),

  importExtension: (accountId: string, importType: 'folder' | 'archive') =>
    ipcRenderer.invoke('extension:import', accountId, importType),
  toggleExtension: (accountId: string, extensionId: string, enabled: boolean) =>
    ipcRenderer.invoke('extension:toggle', accountId, extensionId, enabled),
  removeExtension: (accountId: string, extensionId: string) =>
    ipcRenderer.invoke('extension:remove', accountId, extensionId),

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

function setupWhatsAppIntegration() {
  // Light dismiss on webview click
  window.addEventListener('click', () => {
    ipcRenderer.send('webview:clicked');
  });

  // Notification Interception
  const OriginalNotification = (window as any).Notification;
  if (!OriginalNotification) return;

  const activeNotificationCallbacks = new Map<string, () => void>();

  ipcRenderer.on('notification:clicked-reply', (_event: any, tag: string) => {
    const callback = activeNotificationCallbacks.get(tag);
    if (callback) {
      callback();
    }
  });

  class CustomNotification extends EventTarget {
    public title: string;
    public body: string;
    public icon: string;
    public tag: string;

    public onclick: (() => void) | null = null;
    public onclose: (() => void) | null = null;
    public onerror: (() => void) | null = null;
    public onshow: (() => void) | null = null;

    constructor(title: string, options: any = {}) {
      super();
      this.title = title;
      this.body = options.body || '';
      this.icon = options.icon || '';
      this.tag = options.tag || `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      if (this.tag) {
        activeNotificationCallbacks.set(this.tag, () => {
          if (this.onclick) this.onclick();
          this.dispatchEvent(new Event('click'));
        });
      }

      resolveIconToBase64(options.icon).then((base64Icon) => {
        ipcRenderer.send('notification:create', {
          title: this.title,
          body: this.body,
          icon: base64Icon || '',
          tag: this.tag,
        });
      });

      setTimeout(() => {
        if (this.onshow) this.onshow();
        this.dispatchEvent(new Event('show'));
      }, 50);
    }

    close() {
      ipcRenderer.send('notification:close-request', this.tag);
      if (this.tag) {
        activeNotificationCallbacks.delete(this.tag);
      }
      if (this.onclose) this.onclose();
      this.dispatchEvent(new Event('close'));
    }

    static get permission() {
      return OriginalNotification.permission;
    }

    static requestPermission(callback?: (permission: string) => void) {
      return OriginalNotification.requestPermission(callback);
    }
  }

  (window as any).Notification = CustomNotification;
}

function injectCallTitlebar() {
  // Wait for documentElement and body to be available
  if (!document.documentElement || !document.body) {
    setTimeout(injectCallTitlebar, 50);
    return;
  }

  // Check if already injected
  if (document.getElementById('custom-call-titlebar')) return;

  // Create style element to shift body content and style html/body
  const style = document.createElement('style');
  style.id = 'custom-call-titlebar-styles';
  style.innerHTML = `
    html {
      background-color: #111b21 !important;
    }
    body {
      transform: translateY(28px) !important;
      height: calc(100vh - 28px) !important;
      position: relative !important;
      margin: 0 !important;
      overflow: hidden !important;
    }
  `;
  document.documentElement.appendChild(style);

  // Create the titlebar container
  const container = document.createElement('div');
  container.id = 'custom-call-titlebar';
  
  // Style container
  Object.assign(container.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    height: '28px',
    background: '#111b21',
    borderBottom: '1px solid #222d34',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontFamily: 'Segoe UI, Helvetica Neue, Helvetica, Lucide Sans, Arial, sans-serif',
    color: '#aebac1',
    fontSize: '12px',
    zIndex: '999999',
    userSelect: 'none'
  });

  // Request the account name from main process
  ipcRenderer.invoke('account:get-name-for-session').then((accountName: string) => {
    // Fill in HTML
    container.innerHTML = `
      <div style="-webkit-app-region: no-drag; display: flex; align-items: center; padding-left: 12px; gap: 8px; font-family: sans-serif;">
        <span style="color: #00a884; display: flex; align-items: center; justify-content: center; font-size: 13px;">📞</span>
        <span style="color: #e9edef; font-size: 11px; font-weight: 600; tracking-wide: 0.05em;">WhatsApp Call</span>
        <span style="padding: 1px 6px; background: rgba(0, 168, 132, 0.1); border: 1px solid rgba(0, 168, 132, 0.2); color: #00a884; border-radius: 4px; font-size: 10px; font-weight: bold;">${accountName}</span>
      </div>
      <div style="-webkit-app-region: drag; flex: 1; height: 100%; cursor: move;"></div>
      <div style="-webkit-app-region: no-drag; display: flex; align-items: center; gap: 2px; padding-right: 4px;">
        <button id="pin-btn" title="Pin (Stay on Top)" style="background: none; border: none; color: #8696a0; cursor: pointer; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; transition: color 0.2s;">📌</button>
        <div style="height: 12px; width: 1px; background-color: #222d34; margin: 0 4px; display: inline-block;"></div>
        <button id="min-btn" title="Minimize" style="background: none; border: none; color: #8696a0; cursor: pointer; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold;">−</button>
        <button id="close-btn" title="End Call & Close" style="background: none; border: none; color: #8696a0; cursor: pointer; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 14px; transition: background-color 0.2s, color 0.2s; border-radius: 4px;">✕</button>
      </div>
    `;

    document.documentElement.appendChild(container);

    // Hook up button events
    const pinBtn = document.getElementById('pin-btn');
    const minBtn = document.getElementById('min-btn');
    const closeBtn = document.getElementById('close-btn');

    // Fetch initial pin status
    ipcRenderer.invoke('window:get-always-on-top').then((isPinned: boolean) => {
      if (pinBtn) {
        pinBtn.style.color = isPinned ? '#00a884' : '#8696a0';
      }
    });

    pinBtn?.addEventListener('click', () => {
      ipcRenderer.send('window:toggle-always-on-top');
    });

    ipcRenderer.on('window:always-on-top-changed', (_event: any, isPinned: boolean) => {
      if (pinBtn) {
        pinBtn.style.color = isPinned ? '#00a884' : '#8696a0';
      }
    });

    minBtn?.addEventListener('click', () => {
      ipcRenderer.send('window:minimize');
    });

    closeBtn?.addEventListener('click', () => {
      ipcRenderer.send('window:close');
    });

    // Style close button hover
    closeBtn?.addEventListener('mouseenter', () => {
      closeBtn.style.backgroundColor = '#ea4335';
      closeBtn.style.color = '#ffffff';
    });
    closeBtn?.addEventListener('mouseleave', () => {
      closeBtn.style.backgroundColor = 'transparent';
      closeBtn.style.color = '#8696a0';
    });

    // Style pin button hover
    pinBtn?.addEventListener('mouseenter', () => {
      pinBtn.style.color = '#e9edef';
    });
    pinBtn?.addEventListener('mouseleave', () => {
      ipcRenderer.invoke('window:get-always-on-top').then((isPinned: boolean) => {
        pinBtn.style.color = isPinned ? '#00a884' : '#8696a0';
      });
    });

    // Style min button hover
    minBtn?.addEventListener('mouseenter', () => {
      minBtn.style.color = '#e9edef';
    });
    minBtn?.addEventListener('mouseleave', () => {
      minBtn.style.color = '#8696a0';
    });
  });
}

const isWhatsApp = window.location.hostname.includes('whatsapp.com');

if (!isWhatsApp) {
  contextBridge.exposeInMainWorld('electronAPI', api);
} else {
  setupWhatsAppIntegration();
  if (window.location.pathname.includes('/call')) {
    injectCallTitlebar();
  }
}

export {};
