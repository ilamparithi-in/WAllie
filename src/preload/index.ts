const { contextBridge, ipcRenderer, webFrame } = require('electron');
import type { ExtensionInfo, Account as AccountInfo, GlobalSettings, HistoricalNotification, DownloadRecord, FileSecondClickAction, AppVersionInfo, AccountSettings } from '../shared/types';

export type { ExtensionInfo, AccountInfo, GlobalSettings, HistoricalNotification, DownloadRecord, FileSecondClickAction, AppVersionInfo, AccountSettings };

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
  triggerZoomStep: (direction: 'in' | 'out') => void;
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

  // Notification history & CSS / Appearance controls
  getNotificationHistory: () => Promise<HistoricalNotification[]>;
  clearNotificationHistory: (options?: string | { mode: string; startDate?: string; endDate?: string }) => Promise<boolean>;
  saveCss: (accountId: string, customCss: string, selectedTheme: string) => Promise<boolean>;
  saveAppearance: (accountId: string, settings: Partial<AccountSettings>) => Promise<boolean>;
  selectWallpaperFile: () => Promise<string | null>;
  selectCustomCssFile: () => Promise<string | null>;
  getSystemFonts: () => Promise<string[]>;

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
      state: 'progressing' | 'completed' | 'failed' | 'cancelled';
      receivedBytes?: number;
      totalBytes?: number;
    }) => void
  ) => () => void;
  relaunchApp: () => void;
  onOpenManageAccounts: (callback: (accountId: string) => void) => () => void;
  focusActiveAccount: () => void;
  getAppVersion: () => Promise<AppVersionInfo>;
  sendSandboxAction: (action: string, data?: any) => void;
  onSandboxUpdate: (callback: (data: any) => void) => () => void;
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
  triggerZoomStep: (direction: 'in' | 'out') => ipcRenderer.send('zoom:trigger-step', direction),
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
  saveAppearance: (accountId, settings) => ipcRenderer.invoke('account:save-appearance', accountId, settings),
  selectWallpaperFile: () => ipcRenderer.invoke('wallpaper:select-file'),
  selectCustomCssFile: () => ipcRenderer.invoke('customcss:select-file'),
  getSystemFonts: () => ipcRenderer.invoke('system:get-fonts'),
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
        state: 'progressing' | 'completed' | 'failed' | 'cancelled';
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
  sendSandboxAction: (action: string, data?: any) => ipcRenderer.send('sandbox:action', action, data),
  onSandboxUpdate: (callback: (data: any) => void) => {
    const subscription = (_event: unknown, data: any) => callback(data);
    ipcRenderer.on('sandbox:update', subscription);
    return () => ipcRenderer.removeListener('sandbox:update', subscription);
  },
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

function setupCallDetection() {
  function checkCallElement(target: HTMLElement | null): 'answered' | 'declined' | null {
    if (!target) return null;
    const btn = target.closest('button, [role="button"], [data-testid], div[tabindex]');
    if (!btn) return null;

    const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
    const testId = (btn.getAttribute('data-testid') || '').toLowerCase();
    const title = (btn.getAttribute('title') || '').toLowerCase();
    const text = (btn.textContent || '').trim().toLowerCase();
    const iconEl = btn.querySelector('[data-icon]');
    const icon = (iconEl?.getAttribute('data-icon') || '').toLowerCase();

    // Accept / Answer keywords (covering English and common international variations)
    const acceptKeywords = [
      'accept', 'answer', 'pick up', 'take call', 'join call', 'annehmen', 'accepter',
      'aceptar', 'rispondi', 'atender', 'beantwoorden', 'svara', 'besvar'
    ];
    const isAccept = acceptKeywords.some(kw => ariaLabel.includes(kw) || testId.includes(kw) || title.includes(kw) || text === kw || icon.includes(kw)) ||
      testId.includes('call-accept') || testId.includes('call-answer') || icon.includes('call-accept') || icon.includes('call-answer') || icon.includes('phone-call');

    if (isAccept) return 'answered';

    // Decline / Reject keywords
    const declineKeywords = [
      'decline', 'reject', 'dismiss', 'ignore', 'ablehnen', 'refuser',
      'rechazar', 'rifiuta', 'recusar', 'weigeren', 'avvisa', 'afvis'
    ];
    const isDecline = declineKeywords.some(kw => ariaLabel.includes(kw) || testId.includes(kw) || title.includes(kw) || text === kw || icon.includes(kw)) ||
      testId.includes('call-decline') || testId.includes('call-reject') || icon.includes('call-decline') || icon.includes('call-reject') || icon.includes('call-end');

    if (isDecline) return 'declined';

    // Check round colored buttons (WhatsApp standard green for accept, red for decline)
    try {
      const style = window.getComputedStyle(btn);
      const bg = style.backgroundColor;
      const isRound = style.borderRadius.includes('%') || parseInt(style.borderRadius, 10) > 15;
      if (isRound && bg) {
        const match = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
          const r = parseInt(match[1], 10);
          const g = parseInt(match[2], 10);
          const b = parseInt(match[3], 10);
          if (g > 150 && r < 100) {
            return 'answered';
          } else if (r > 180 && g < 100 && b < 120) {
            return 'declined';
          }
        }
      }
    } catch (e) {}

    return null;
  }

  // Intercept button clicks in capture phase before WhatsApp processes them or closes window
  document.addEventListener('click', (e) => {
    const status = checkCallElement(e.target as HTMLElement | null);
    if (status) {
      console.log(`[walinux] Call action detected: ${status}`);
      try {
        ipcRenderer.sendSync('call:status-sync', { status });
      } catch (err) {
        ipcRenderer.send('call:status-changed', { status });
      }
    }
  }, true);

  // Monitor DOM for active ongoing call controls (hangup, microphone, screenshare, camera toggle)
  const checkActiveCall = () => {
    const hasActiveControls = !!document.querySelector(
      '[data-testid*="hangup"], [data-testid*="end-call"], [data-icon*="end-call"], button[aria-label*="end call" i], button[aria-label*="hang up" i], [data-testid*="micro"], [data-icon*="mic"], [data-testid*="screen"], [data-icon*="screen"]'
    );
    if (hasActiveControls) {
      ipcRenderer.send('call:status-changed', { status: 'answered' });
    }
  };

  const callObserver = new MutationObserver(() => {
    checkActiveCall();
  });

  if (document.body) {
    callObserver.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      if (document.body) {
        callObserver.observe(document.body, { childList: true, subtree: true });
      }
    });
  }

  // Monitor WebRTC PeerConnection connection state
  if (typeof window.RTCPeerConnection !== 'undefined') {
    const OrigRTCPC = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends OrigRTCPC {
      constructor(...args: any[]) {
        super(...args);
        this.addEventListener('connectionstatechange', () => {
          if (this.connectionState === 'connected') {
            console.log('[walinux] WebRTC connectionState connected -> Call answered');
            ipcRenderer.send('call:status-changed', { status: 'answered' });
          }
        });
      }
    };
  }

  // Monitor getUserMedia calls (triggered when answering or placing a call)
  if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
    const origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = function (constraints) {
      try {
        if (constraints && (constraints.audio || constraints.video)) {
          ipcRenderer.send('call:status-changed', { status: 'answered' });
        }
      } catch (e) {}
      return origGUM(constraints);
    };
  }
}

function setupWhatsAppIntegration() {
  setupCallDetection();

  // Light dismiss on webview click
  window.addEventListener('click', () => {
    ipcRenderer.send('webview:clicked');
  });

  // Capture clicks on document to detect Context Menu Download or Second-click on file
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // 1. Context Menu "Download" detection (trigger Save As prompt for custom directory)
    const menuItem = target.closest('[role="button"], li, div[class*="menu-item"], div[tabindex="-1"]');
    if (menuItem) {
      const text = (menuItem.textContent || '').trim().toLowerCase();
      const ariaLabel = (menuItem.getAttribute('aria-label') || '').trim().toLowerCase();
      const isDownloadText = text === 'download' || text.startsWith('download') || text.includes('download') || ariaLabel.includes('download');
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

  // Ctrl + Mouse Wheel to Page Zoom (Physical Ctrl only, leaving native touchpad pinch-to-zoom untouched)
  let isPhysicalCtrlDown = false;

  ipcRenderer.on('zoom:ctrl-state-changed', (_event: any, isDown: boolean) => {
    isPhysicalCtrlDown = isDown;
  });

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Control' || e.key === 'Meta' || e.ctrlKey || e.metaKey) {
      isPhysicalCtrlDown = true;
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    if (!e.ctrlKey && !e.metaKey) {
      isPhysicalCtrlDown = false;
    }
  };

  window.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('keydown', handleKeyDown, true);
  window.addEventListener('keyup', handleKeyUp, true);
  document.addEventListener('keyup', handleKeyUp, true);

  let wheelZoomTimeout: NodeJS.Timeout | null = null;
  let accumulatedDeltaY = 0;

  window.addEventListener('wheel', (e) => {
    if (isPhysicalCtrlDown && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      accumulatedDeltaY += e.deltaY;
      if (wheelZoomTimeout) clearTimeout(wheelZoomTimeout);
      wheelZoomTimeout = setTimeout(() => {
        if (Math.abs(accumulatedDeltaY) > 5) {
          const direction = accumulatedDeltaY < 0 ? 'in' : 'out';
          ipcRenderer.send('zoom:trigger-step', direction);
        }
        accumulatedDeltaY = 0;
      }, 30);
    }
  }, { passive: false });

  // Enable visual zoom (pinch-to-zoom) limits directly on the webFrame
  const applyVisualZoomSettings = () => {
    try {
      webFrame.setVisualZoomLevelLimits(1, 5);
    } catch (e) {}
  };

  applyVisualZoomSettings();
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', applyVisualZoomSettings);
  }

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
    dismissChat: (data: { tag?: string; contactName?: string }) => {
      ipcRenderer.send('notification:dismiss-chat', data);
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
            document.querySelector('[data-testid="chat-list-search"] div[contenteditable="true"]') ||
            document.querySelector('[data-testid="chat-list-search"] input') ||
            document.querySelector('input[aria-label*="Search" i]') ||
            document.querySelector('input[aria-label*="Buscar" i]') ||
            document.querySelector('div[contenteditable="true"][aria-label*="Search" i]') ||
            document.querySelector('div[contenteditable="true"][aria-label*="Buscar" i]') ||
            document.querySelector('input[data-tab="3"]') ||
            document.querySelector('div[contenteditable="true"][data-tab="3"]')
          );
        }

        function getSearchText(el) {
          if (!el) return '';
          if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            return el.value || '';
          }
          return el.textContent || '';
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
            el.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            try { document.execCommand('selectAll', false, null); } catch (e) {}
            if (val) {
              try { document.execCommand('insertText', false, val); } catch (e) {}
            } else {
              try { document.execCommand('delete', false, null); } catch (e) {}
              el.textContent = '';
            }
            el.dispatchEvent(new InputEvent('input', { bubbles: true }));
          }
        }

        function restoreSearchBox(sbox, originalText) {
          if (!sbox) return;
          if (originalText && originalText.trim()) {
            setSearchText(sbox, originalText);
          } else {
            setSearchText(sbox, '');
            try {
              sbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
              sbox.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
            } catch (e) {}

            const cancelIcon = (
              document.querySelector('span[data-icon="x-alt"]') ||
              document.querySelector('span[data-icon="x"]') ||
              document.querySelector('span[data-icon="back"]') ||
              document.querySelector('span[data-icon="arrow-back"]')
            );
            if (cancelIcon) {
              const clickTarget = cancelIcon.closest('button') || cancelIcon;
              triggerEvents(clickTarget, ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);
            } else {
              const cancelBtn = (
                document.querySelector('button[aria-label*="Cancel" i]') ||
                document.querySelector('button[aria-label*="Clear" i]') ||
                document.querySelector('button[aria-label*="Back" i]')
              );
              if (cancelBtn) {
                triggerEvents(cancelBtn, ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);
              }
            }
            try { sbox.blur(); } catch (e) {}
          }
        }

        function isChatOpen(query) {
          const headerTitles = Array.from(document.querySelectorAll('header span[title]'));
          for (const el of headerTitles) {
            if (norm(el.getAttribute('title') || el.textContent) === query) {
              return true;
            }
          }
          return false;
        }

        function findMatchingRow(query) {
          const rows = Array.from(document.querySelectorAll(
            '#pane-side [role="row"], #side [role="row"], #pane-side [role="listitem"], #side [role="listitem"], [data-testid="chat-list"] [role="listitem"]'
          )).filter(vis);

          for (const row of rows) {
            const t = row.querySelector('span[title]');
            if (t && norm(t.getAttribute('title') || t.textContent) === query) {
              return row;
            }
          }
          return null;
        }

        function getActiveChatTitle() {
          const headerTitles = Array.from(document.querySelectorAll('header span[title]'));
          for (const el of headerTitles) {
            const t = (el.getAttribute('title') || el.textContent || '').trim();
            if (t) return t;
          }
          return '';
        }

        function dismissActiveChat() {
          try {
            const currentTitle = getActiveChatTitle();
            if (currentTitle && window.__walinux_ipc && window.__walinux_ipc.dismissChat) {
              window.__walinux_ipc.dismissChat({ contactName: currentTitle });
            }
          } catch (e) {}
        }

        window.addEventListener('focus', () => {
          dismissActiveChat();
        });

        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) {
            dismissActiveChat();
          }
        });

        document.addEventListener('click', () => {
          setTimeout(dismissActiveChat, 100);
        }, { passive: true });

        document.addEventListener('focusin', (e) => {
          const target = e.target;
          if (target && (target.closest('footer') || target.getAttribute('contenteditable') === 'true')) {
            dismissActiveChat();
          }
        }, { passive: true });

        let lastObservedChatTitle = '';
        let chatHeaderDismissTimer = null;
        try {
          const chatHeaderObserver = new MutationObserver(() => {
            const t = getActiveChatTitle();
            if (t && t !== lastObservedChatTitle) {
              lastObservedChatTitle = t;
              if (chatHeaderDismissTimer) clearTimeout(chatHeaderDismissTimer);
              chatHeaderDismissTimer = setTimeout(dismissActiveChat, 150);
            }
          });
          chatHeaderObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
        } catch (e) {}

        if (window.__walinux_ipc) {
          window.__walinux_ipc.onNotificationClicked((arg) => {
            const tag = typeof arg === 'string' ? arg : arg?.tag;
            const contactName = typeof arg === 'object' ? arg?.contactName : '';

            if (window.__walinux_ipc && window.__walinux_ipc.dismissChat) {
              window.__walinux_ipc.dismissChat({ tag, contactName });
            }

            const callback = activeNotificationCallbacks.get(tag);
            if (callback) {
              try { callback(); } catch (e) {}
            }

            if (!contactName) return;

            const targetQuery = norm(contactName);

            // Step 1: Give WhatsApp native notification callback ~400ms to open the chat
            let attempts = 0;
            const checkNativeInterval = setInterval(() => {
              attempts++;
              if (isChatOpen(targetQuery)) {
                clearInterval(checkNativeInterval);
                return;
              }

              // After timeout, check visible sidebar or fall back to search
              if (attempts >= 5) {
                clearInterval(checkNativeInterval);

                const row = findMatchingRow(targetQuery);
                if (row) {
                  const clickTarget = row.querySelector('span[title]') || row;
                  triggerEvents(clickTarget, ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);
                  return;
                }

                // Chat is not in the visible sidebar list (scrolled away or virtualized) -> fallback to search
                const sbox = getSearchBox();
                if (sbox) {
                  const prevSearchText = getSearchText(sbox);
                  setSearchText(sbox, contactName);

                  let searchAttempts = 0;
                  const searchPoll = setInterval(() => {
                    searchAttempts++;
                    const searchedRow = findMatchingRow(targetQuery);
                    if (searchedRow) {
                      clearInterval(searchPoll);
                      const clickTarget = searchedRow.querySelector('span[title]') || searchedRow;
                      triggerEvents(clickTarget, ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);

                      // Wait for chat to open, then restore search box to previous state
                      let openAttempts = 0;
                      const openPoll = setInterval(() => {
                        openAttempts++;
                        if (isChatOpen(targetQuery) || openAttempts >= 12) {
                          clearInterval(openPoll);
                          setTimeout(() => {
                            restoreSearchBox(sbox, prevSearchText);
                          }, 150);
                        }
                      }, 50);
                      return;
                    }

                    if (searchAttempts > 20) {
                      clearInterval(searchPoll);
                      restoreSearchBox(sbox, prevSearchText);
                    }
                  }, 50);
                }
              }
            }, 80);
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
            let prevSearchText = '';
            let sboxEl = null;
            const targetQuery = norm(contactName);

            const interval = setInterval(() => {
              attempts++;
              if (attempts > 50) {
                clearInterval(interval);
                if (searched && sboxEl) {
                  restoreSearchBox(sboxEl, prevSearchText);
                }
                return;
              }

              const comp = getComposer();
              if (comp) {
                clearInterval(interval);
                doSendText(comp);
                if (searched && sboxEl) {
                  setTimeout(() => {
                    restoreSearchBox(sboxEl, prevSearchText);
                  }, 300);
                }
                return;
              }

              if (!searched && attempts > 8) {
                const sbox = getSearchBox();
                if (sbox) {
                  sboxEl = sbox;
                  prevSearchText = getSearchText(sbox);
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
              // 1. WhatsApp Channels & Broadcast lists are strictly one-way for followers
              if (tag && (tag.endsWith('@newsletter') || tag.endsWith('@broadcast'))) {
                return true;
              }

              // 2. Direct 1:1 chats (@c.us / @s.whatsapp.net) are never announcement groups
              if (tag && (tag.endsWith('@c.us') || tag.endsWith('@s.whatsapp.net'))) {
                return false;
              }

              // 3. Options metadata check for announcement restrictions
              if (opts && opts.data) {
                const d = opts.data;
                if (d.readOnly === true || d.isReadOnly === true) return true;
                if (d.chat && (d.chat.readOnly === true || d.chat.isReadOnly === true)) return true;
                if (d.chat && d.chat.groupMetadata && d.chat.groupMetadata.announce && d.chat.groupMetadata.canSend === false) {
                  return true;
                }
              }

              // 4. WhatsApp Web internal store check
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
                    if (chat.groupMetadata && chat.groupMetadata.announce) {
                      if (chat.groupMetadata.canSend === false || chat.groupMetadata.isSenderAnAdmin === false) {
                        return true;
                      }
                    }
                  }
                }
              } catch (e) {}

              // 5. Active DOM check: only if an explicit admin restriction lock banner is displayed
              try {
                const activeHeader = document.querySelector('header span[title]');
                if (activeHeader && title && activeHeader.textContent.trim().toLowerCase() === title.trim().toLowerCase()) {
                  const lockBanner = document.querySelector('footer [data-icon="lock"], footer [data-icon="channel"], div[data-testid="conversation-footer-banner"]');
                  if (lockBanner) {
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
            if (this.title && window.__walinux_ipc && window.__walinux_ipc.dismissChat) {
              if (isChatOpen(norm(this.title))) {
                window.__walinux_ipc.dismissChat({ tag: this.tag, contactName: this.title });
              }
            }
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

interface SvgNode {
  tag: string;
  attrs: Record<string, string>;
  children?: SvgNode[];
}

function createSvgElement(node: SvgNode): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', node.tag);
  for (const [k, v] of Object.entries(node.attrs)) {
    el.setAttribute(k, v);
  }
  if (node.children) {
    for (const child of node.children) {
      el.appendChild(createSvgElement(child));
    }
  }
  return el;
}

const TITLEBAR_CSS = `
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
  style.textContent = TITLEBAR_CSS;
  document.documentElement.appendChild(style);

  // SVGs definitions matching Lucide icons exactly
  const phoneIcon = createSvgElement({
    tag: 'svg',
    attrs: { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    children: [{ tag: 'path', attrs: { d: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z' } }]
  });

  const codeIcon = createSvgElement({
    tag: 'svg',
    attrs: { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    children: [
      { tag: 'polyline', attrs: { points: '16 18 22 12 16 6' } },
      { tag: 'polyline', attrs: { points: '8 6 2 12 8 18' } }
    ]
  });

  const createPinIcon = () => createSvgElement({
    tag: 'svg',
    attrs: { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    children: [
      { tag: 'line', attrs: { x1: '12', y1: '17', x2: '12', y2: '22' } },
      { tag: 'path', attrs: { d: 'M5 17h14v-1.76a2 2 0 0 0-.44-1.24l-2.78-3.5A2 2 0 0 1 15 9.24V5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v4.24a2 2 0 0 1-.78 1.28l-2.78 3.5a2 2 0 0 0-.44 1.24z' } }
    ]
  });

  const createMinIcon = () => createSvgElement({
    tag: 'svg',
    attrs: { width: '14', height: '14', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    children: [{ tag: 'line', attrs: { x1: '5', y1: '12', x2: '19', y2: '12' } }]
  });

  const createMaxIcon = () => createSvgElement({
    tag: 'svg',
    attrs: { id: 'max-icon-svg', width: '12', height: '12', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    children: [
      {
        tag: 'g',
        attrs: { id: 'max-icon-unmaxed' },
        children: [{ tag: 'rect', attrs: { width: '18', height: '18', x: '3', y: '3', rx: '2' } }]
      },
      {
        tag: 'g',
        attrs: { id: 'max-icon-maxed', style: 'display: none' },
        children: [
          { tag: 'rect', attrs: { width: '14', height: '14', x: '8', y: '8', rx: '2', ry: '2' } },
          { tag: 'path', attrs: { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' } }
        ]
      }
    ]
  });

  const createCloseIcon = () => createSvgElement({
    tag: 'svg',
    attrs: { width: '14', height: '14', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    children: [
      { tag: 'line', attrs: { x1: '18', y1: '6', x2: '6', y2: '18' } },
      { tag: 'line', attrs: { x1: '6', y1: '6', x2: '18', y2: '18' } }
    ]
  });

  const container = document.createElement('div');
  container.id = 'custom-titlebar';

  const leftDiv = document.createElement('div');
  leftDiv.className = 'titlebar-left';

  const leftIconSpan = document.createElement('span');
  leftIconSpan.className = 'titlebar-left-icon';
  leftIconSpan.appendChild(options.iconType === 'call' ? phoneIcon : codeIcon);
  leftDiv.appendChild(leftIconSpan);

  const leftTitleSpan = document.createElement('span');
  leftTitleSpan.className = 'titlebar-left-title';
  leftTitleSpan.textContent = options.title || '';
  leftDiv.appendChild(leftTitleSpan);

  if (options.badge) {
    const badgeSpan = document.createElement('span');
    badgeSpan.className = 'titlebar-left-badge';
    badgeSpan.textContent = options.badge;
    leftDiv.appendChild(badgeSpan);
  }

  const dragRegion = document.createElement('div');
  dragRegion.className = 'titlebar-drag-region';

  const rightDiv = document.createElement('div');
  rightDiv.className = 'titlebar-right';

  let pinBtn: HTMLButtonElement | null = null;
  let minBtn: HTMLButtonElement | null = null;
  let maxBtn: HTMLButtonElement | null = null;
  let closeBtn: HTMLButtonElement | null = null;

  options.controls.forEach((control) => {
    if (control === 'pin') {
      pinBtn = document.createElement('button');
      pinBtn.className = 'titlebar-btn';
      pinBtn.id = 'pin-btn';
      pinBtn.title = 'Pin (Stay on Top)';
      pinBtn.appendChild(createPinIcon());
      rightDiv.appendChild(pinBtn);

      const divider = document.createElement('div');
      divider.className = 'titlebar-divider';
      rightDiv.appendChild(divider);
    } else if (control === 'min') {
      minBtn = document.createElement('button');
      minBtn.className = 'titlebar-btn';
      minBtn.id = 'min-btn';
      minBtn.title = 'Minimize';
      minBtn.appendChild(createMinIcon());
      rightDiv.appendChild(minBtn);
    } else if (control === 'max') {
      maxBtn = document.createElement('button');
      maxBtn.className = 'titlebar-btn';
      maxBtn.id = 'max-btn';
      maxBtn.title = 'Maximize';
      maxBtn.appendChild(createMaxIcon());
      rightDiv.appendChild(maxBtn);
    } else if (control === 'close') {
      closeBtn = document.createElement('button');
      closeBtn.className = 'titlebar-btn titlebar-btn-close';
      closeBtn.id = 'close-btn';
      closeBtn.title = 'Close';
      closeBtn.appendChild(createCloseIcon());
      rightDiv.appendChild(closeBtn);
    }
  });

  container.appendChild(leftDiv);
  container.appendChild(dragRegion);
  container.appendChild(rightDiv);

  document.body.appendChild(container);

  if (pinBtn) {
    ipcRenderer.invoke('window:get-always-on-top').then((isPinned: boolean) => {
      (pinBtn as HTMLButtonElement).style.color = isPinned ? '#00a884' : '#8696a0';
    });

    (pinBtn as HTMLButtonElement).addEventListener('click', () => {
      ipcRenderer.send('window:toggle-always-on-top');
    });

    ipcRenderer.on('window:always-on-top-changed', (_event: any, isPinned: boolean) => {
      if (pinBtn) {
        pinBtn.style.color = isPinned ? '#00a884' : '#8696a0';
      }
    });
  }

  if (minBtn) {
    (minBtn as HTMLButtonElement).addEventListener('click', () => {
      ipcRenderer.send('window:minimize');
    });
  }

  if (maxBtn) {
    (maxBtn as HTMLButtonElement).addEventListener('click', () => {
      ipcRenderer.send('window:maximize');
    });

    ipcRenderer.on('window:maximized-changed', (_event: any, isMaximized: boolean) => {
      const maxSvg = document.getElementById('max-icon-svg');
      const unmaxedG = document.getElementById('max-icon-unmaxed');
      const maxedG = document.getElementById('max-icon-maxed');
      if (maxSvg && unmaxedG && maxedG) {
        if (isMaximized) {
          maxSvg.setAttribute('style', 'transform: rotate(180deg); width: 12px; height: 12px;');
          unmaxedG.setAttribute('style', 'display: none');
          maxedG.removeAttribute('style');
        } else {
          maxSvg.removeAttribute('style');
          maxSvg.setAttribute('style', 'width: 12px; height: 12px;');
          unmaxedG.removeAttribute('style');
          maxedG.setAttribute('style', 'display: none');
        }
      }
    });
  }

  if (closeBtn) {
    (closeBtn as HTMLButtonElement).addEventListener('click', () => {
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
      ipcRenderer.send('call:status-changed', { status: 'answered' });
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
  contextBridge.exposeInMainWorld('sandboxAPI', {
    sendAction: (action: string, data?: any) => ipcRenderer.send('sandbox:action', action, data),
    onUpdate: (callback: (data: any) => void) => {
      const subscription = (_event: unknown, data: any) => callback(data);
      ipcRenderer.on('sandbox:update', subscription);
      return () => ipcRenderer.removeListener('sandbox:update', subscription);
    },
  });

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

