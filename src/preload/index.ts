const { contextBridge, ipcRenderer, webFrame } = require('electron');
import type { ExtensionInfo, Account as AccountInfo, GlobalSettings, HistoricalNotification, DownloadRecord, FileSecondClickAction, AppVersionInfo, AccountSettings } from '../shared/types';

// Inlined at build time by scripts/build-preload.cjs from src/preload/inject/whatsappMainWorld.ts
const MAIN_WORLD_SCRIPT = '__MAIN_WORLD_SCRIPT__';

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
  handleProtocolUrl: (accountId: string, url: string) => Promise<{ success: boolean; cancelled?: boolean; error?: string }>;
  signalProtocolReady: () => void;
  toggleProtocolPrompt: (isOpen: boolean) => void;
  showToast: (message: string, url?: string) => void;
  onToastShow: (callback: (data: { message: string; url?: string }) => void) => () => void;
  toggleWallieDevTools: () => void;
  onNavConfirmationActive: (callback: (isActive: boolean) => void) => () => void;

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
  handleProtocolUrl: (accountId, url) => ipcRenderer.invoke('protocol:handle-url', accountId, url),
  signalProtocolReady: () => ipcRenderer.send('protocol:ready'),
  toggleProtocolPrompt: (isOpen) => ipcRenderer.send('protocol:toggle-prompt', isOpen),
  toggleWallieDevTools: () => ipcRenderer.send('devtools:toggle-wallie'),
  showToast: (message, url) => ipcRenderer.send('toast:show', { message, url }),
  onToastShow: (callback) => {
    const subscription = (_event: unknown, data: { message: string; url?: string }) => callback(data);
    ipcRenderer.on('toast:show', subscription);
    return () => ipcRenderer.removeListener('toast:show', subscription);
  },
  onNavConfirmationActive: (callback) => {
    const subscription = (_event: unknown, isActive: boolean) => callback(isActive);
    ipcRenderer.on('nav-confirmation:active', subscription);
    return () => ipcRenderer.removeListener('nav-confirmation:active', subscription);
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

let callStatusReported: 'answered' | 'declined' | null = null;

function setupCallDetection() {
  function reportCallStatus(status: 'answered' | 'declined', sync = false) {
    if (callStatusReported === status) return;
    callStatusReported = status;
    if (sync) {
      try {
        ipcRenderer.sendSync('call:status-sync', { status });
        return;
      } catch (err) {}
    }
    ipcRenderer.send('call:status-changed', { status });
  }

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
      reportCallStatus(status, true);
    }
  }, true);

  // Monitor DOM for active call termination controls (hangup/end call buttons only present during active calls)
  const checkActiveCall = () => {
    const hasActiveControls = !!document.querySelector(
      '[data-testid*="hangup"], [data-testid*="end-call"], [data-icon*="end-call"], button[aria-label*="end call" i], button[aria-label*="hang up" i]'
    );
    if (hasActiveControls) {
      reportCallStatus('answered');
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
            reportCallStatus('answered');
          } else if (this.connectionState === 'closed') {
            callStatusReported = null;
          }
        });
      }
    };
  }

  // Monitor getUserMedia calls (only in call pages or active call contexts)
  if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
    const origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = function (constraints) {
      try {
        if (window.location.pathname.includes('/call') && constraints && (constraints.audio || constraints.video)) {
          reportCallStatus('answered');
        }
      } catch (e) {}
      return origGUM(constraints);
    };
  }
}

function showGuestToast(msg: string, url?: string) {
  if (!document.body && !document.documentElement) return;

  let container = document.getElementById('wallie-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'wallie-toast-container';
    Object.assign(container.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: '999999',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      pointerEvents: 'none',
    });
    (document.body || document.documentElement).appendChild(container);
  }

  if (!document.getElementById('wallie-toast-style')) {
    const style = document.createElement('style');
    style.id = 'wallie-toast-style';
    style.textContent = '@keyframes wallieToastIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}';
    (document.head || document.documentElement).appendChild(style);
  }

  const isCancelled = msg.toLowerCase().includes('cancel');
  const toast = document.createElement('div');
  Object.assign(toast.style, {
    background: '#1f2c34',
    color: '#e9edef',
    border: isCancelled ? '1px solid rgba(241, 92, 109, 0.5)' : '1px solid rgba(0, 168, 132, 0.5)',
    padding: '10px 14px',
    borderRadius: '10px',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
    fontSize: '12px',
    maxWidth: '340px',
    pointerEvents: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    animation: 'wallieToastIn 0.2s ease-out',
  });

  const iconBox = document.createElement('div');
  Object.assign(iconBox.style, {
    background: isCancelled ? 'rgba(241, 92, 109, 0.2)' : 'rgba(0, 168, 132, 0.2)',
    color: isCancelled ? '#f15c6d' : '#00a884',
    padding: '6px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: '0',
  });

  const iconSvg = isCancelled
    ? createSvgElement({
        tag: 'svg',
        attrs: { width: '14', height: '14', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' },
        children: [
          { tag: 'circle', attrs: { cx: '12', cy: '12', r: '10' } },
          { tag: 'line', attrs: { x1: '15', y1: '9', x2: '9', y2: '15' } },
          { tag: 'line', attrs: { x1: '9', y1: '9', x2: '15', y2: '15' } },
        ],
      })
    : createSvgElement({
        tag: 'svg',
        attrs: { width: '14', height: '14', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' },
        children: [
          { tag: 'path', attrs: { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' } },
          { tag: 'polyline', attrs: { points: '15 3 21 3 21 9' } },
          { tag: 'line', attrs: { x1: '10', y1: '14', x2: '21', y2: '3' } },
        ],
      });
  iconBox.appendChild(iconSvg);
  toast.appendChild(iconBox);

  const textCol = document.createElement('div');
  Object.assign(textCol.style, {
    flex: '1',
    minWidth: '0',
  });

  const msgEl = document.createElement('div');
  Object.assign(msgEl.style, {
    fontWeight: '600',
    fontSize: '12px',
    color: '#e9edef',
    lineHeight: '1.3',
  });
  msgEl.textContent = msg;
  textCol.appendChild(msgEl);

  if (url) {
    const urlEl = document.createElement('div');
    Object.assign(urlEl.style, {
      fontSize: '10px',
      color: '#8696a0',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      marginTop: '2px',
    });
    urlEl.title = url;
    urlEl.textContent = url;
    textCol.appendChild(urlEl);
  }

  toast.appendChild(textCol);
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

function setupWhatsAppIntegration() {
  setupCallDetection();

  // In-app toast notification listener
  ipcRenderer.on('toast:show', (_event: any, data: { message: string; url?: string }) => {
    if (data && data.message) {
      showGuestToast(data.message, data.url);
    }
  });

  // Light dismiss on webview click
  window.addEventListener('click', () => {
    ipcRenderer.send('webview:clicked');
  });

  function extractFilenameFromMessage(container: Element): string {
    // 1. Search all elements with title attribute for a filename pattern
    // In WhatsApp Web, document cards often have title='Download "filename.docx"'
    const titleElements = container.querySelectorAll('[title]');
    for (const el of Array.from(titleElements)) {
      const rawTitle = (el.getAttribute('title') || '').trim();
      // Match either Download "filename.ext" or "filename.ext" or filename.ext
      const match = rawTitle.match(/(?:Download\s+["“']?)?([^"”'\n\r]+\.[a-z0-9]{2,6})["”']?/i);
      if (match && match[1]) {
        const cleaned = match[1].trim();
        // Ignore generic labels like "2 pages", "DOCX", etc.
        if (cleaned && !cleaned.toLowerCase().startsWith('download')) {
          return cleaned;
        }
      }
    }

    // 2. Search leaf text nodes for a filename pattern
    const leafElements = container.querySelectorAll('span, div, p');
    for (const el of Array.from(leafElements)) {
      if (el.children.length === 0) {
        const text = (el.textContent || '').trim();
        if (/\.[a-z0-9]{2,6}$/i.test(text)) {
          return text;
        }
      }
    }

    // 3. Fallback to any span[title] or div[title] if present
    const fallbackEl = container.querySelector('span[title], div[title]');
    const rawFallback = (fallbackEl?.getAttribute('title') || fallbackEl?.textContent || '').trim();
    return rawFallback.replace(/^Download\s+["“']?/i, '').replace(/["”']?$/i, '').trim();
  }

  function parseSizeToBytes(sizeStr: string): number | undefined {
    const match = sizeStr.trim().match(/^([\d.]+)\s*(B|kB|KB|MB|GB|TB)$/i);
    if (!match) return undefined;
    const num = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    if (isNaN(num)) return undefined;
    switch (unit) {
      case 'B': return Math.round(num);
      case 'KB': return Math.round(num * 1024);
      case 'MB': return Math.round(num * 1024 * 1024);
      case 'GB': return Math.round(num * 1024 * 1024 * 1024);
      case 'TB': return Math.round(num * 1024 * 1024 * 1024 * 1024);
      default: return undefined;
    }
  }

  function extractFileSizeFromMessage(container: Element): number | undefined {
    // Check elements with title attributes or text content matching size pattern (e.g., "15 kB", "80 kB", "1.5 MB")
    const elements = container.querySelectorAll('[title], span, div');
    for (const el of Array.from(elements)) {
      const title = (el.getAttribute('title') || '').trim();
      const fromTitle = parseSizeToBytes(title);
      if (fromTitle !== undefined) return fromTitle;

      if (el.children.length === 0) {
        const text = (el.textContent || '').trim();
        const fromText = parseSizeToBytes(text);
        if (fromText !== undefined) return fromText;
      }
    }
    return undefined;
  }

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
      // Ignore clicks on message menu controls (down chevron), forward button, reactions, timestamps, or headers
      const isMenuOrAction = !!target.closest(
        '[data-testid*="down-context"], [data-testid*="context"], [data-icon*="down-context"], [data-icon*="context"], [data-js-context-icon], [data-icon="chevron-down"], [data-icon="down"], [data-testid*="menu"], [aria-label*="context" i], [aria-label*="menu" i], [aria-label*="forward" i], [data-testid="msg-meta"], [data-testid*="reaction"], [data-testid="forwarded-header"], [role="menu"], [role="menuitem"]'
      );
      const svgTitle = target.closest('svg')?.querySelector('title')?.textContent?.trim().toLowerCase();
      const isActionSvg = !!svgTitle && ['down-context', 'chevron-down', 'down', 'ic-fast-forward', 'menu', 'context'].includes(svgTitle);

      if (isMenuOrAction || isActionSvg) {
        return;
      }

      // Ensure the click was actually on or inside the document card itself, never on surrounding message controls
      const docCard = target.closest('[data-testid="document-thumb"], [data-testid="audio-play"], [data-testid="audio-download"]');
      if (!docCard) {
        return;
      }

      const filename = extractFilenameFromMessage(msgContainer);
      const isDocCard = !!msgContainer.querySelector('[data-icon*="document"], [data-icon="default-doc"], [data-testid="document-thumb"]');
      const hasExtension = /\.[a-z0-9]{2,6}$/i.test(filename.trim());

      if (filename && (hasExtension || isDocCard)) {
        const cleanName = filename.trim();
        const extractedSize = extractFileSizeFromMessage(msgContainer);

        console.log(`[walinux] Document card clicked: "${cleanName}", approx size: ${extractedSize}`);

        ipcRenderer.invoke('downloads:file-card-clicked', {
          filename: cleanName,
          size: extractedSize,
        }).then((result: { handled: boolean; isExisting: boolean }) => {
          if (result && result.isExisting) {
            console.log('[walinux] Matched existing downloaded file on disk -> handled:', result.handled);
            ipcRenderer.send('download:set-intent', { intent: 'second-click', filename: cleanName, size: extractedSize });
          } else {
            console.log('[walinux] No existing matching file found -> intent: first-download');
            ipcRenderer.send('download:set-intent', { intent: 'first-download', filename: cleanName, size: extractedSize });
          }
        }).catch((err: any) => {
          console.error('[walinux] Failed to handle file card click:', err);
          ipcRenderer.send('download:set-intent', { intent: 'first-download', filename: cleanName, size: extractedSize });
        });
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
    onAnchorDownload: (filename: string, size?: number, hash?: string) => {
      ipcRenderer.send('download:set-intent', { intent: 'anchor-detected', filename, size, hash });
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
    code: MAIN_WORLD_SCRIPT,
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

