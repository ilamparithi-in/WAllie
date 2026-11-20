const { contextBridge, ipcRenderer } = require('electron');
import type {
  ExtensionInfo,
  Account as AccountInfo,
  AddAccountOptions,
  GlobalSettings,
  HistoricalNotification,
  DownloadRecord,
  FileSecondClickAction,
  AppVersionInfo,
  AccountSettings,
  SystemFontInfo,
  GroupInviteDetails,
  WhatsAppChatExport,
  ChatMetadata,
  TimelineEntry,
  MessageEntry,
  SystemNotificationEntry,
  DateDividerEntry,
  NativePromptOptions,
  NativePromptResult,
  NativeConfirmOptions,
} from '../shared/types';
import type {
  ChatExportProgress,
  ChatExportOptions,
  ChatExportResult,
  MultiChatExportRequest,
} from '../shared/chatExportTypes';
import type { GoogleFontResolution } from '../shared/fonts';

export type {
  ExtensionInfo,
  AccountInfo,
  AddAccountOptions,
  GlobalSettings,
  HistoricalNotification,
  DownloadRecord,
  FileSecondClickAction,
  AppVersionInfo,
  AccountSettings,
  SystemFontInfo,
  GoogleFontResolution,
  GroupInviteDetails,
  WhatsAppChatExport,
  ChatMetadata,
  TimelineEntry,
  MessageEntry,
  SystemNotificationEntry,
  DateDividerEntry,
  NativePromptOptions,
  NativePromptResult,
  NativeConfirmOptions,
  ChatExportProgress,
  ChatExportOptions,
  ChatExportResult,
  MultiChatExportRequest,
};

export interface ElectronAPI {
  // Window controls
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  isMaximized: () => Promise<boolean>;
  isFullScreen: () => Promise<boolean>;
  resetWindowSize: () => Promise<boolean>;
  toggleAlwaysOnTop: () => void;
  getAlwaysOnTop: () => Promise<boolean>;
  onAlwaysOnTopChanged: (callback: (isAlwaysOnTop: boolean) => void) => () => void;
  platform: string;

  // Account controls
  getAccounts: () => Promise<AccountInfo[]>;
  getActiveAccountId: () => Promise<string>;
  switchAccount: (id: string) => void;
  addAccount: (optionsOrName?: string | AddAccountOptions) => Promise<AccountInfo>;
  openAddAccountWindow?: () => void;
  toggleAddAccountPrompt?: (isOpen: boolean) => void;
  onTriggerAddAccount?: (callback: () => void) => () => void;
  removeAccount: (id: string) => Promise<boolean>;
  renameAccount: (id: string, name: string) => Promise<boolean>;
  updateAccountEmoji: (id: string, emoji: string) => Promise<boolean>;
  reloadActiveAccount: () => void;
  reloadAccount: (accountId: string) => void;
  unloadAccount: (accountId: string) => Promise<boolean>;
  loadAccount: (accountId: string) => Promise<boolean>;
  showAccountContextMenu: (accountId: string) => void;
  showAccountDropdownMenu: (rect?: { x: number; y: number; width: number; height: number }) => void;
  onAccountDropdownStatus: (callback: (isOpen: boolean) => void) => () => void;
  openAccountSwitcherDropdown: () => Promise<string>;
  closeAccountSwitcherDropdown: () => void;

  // Extension controls
  importExtension: (accountId: string, importType: 'folder' | 'archive') => Promise<ExtensionInfo | null>;
  toggleExtension: (accountId: string, extensionId: string, enabled: boolean) => Promise<boolean>;
  toggleExtensionPin: (accountId: string, extensionId: string, pinned: boolean) => Promise<boolean>;
  removeExtension: (accountId: string, extensionId: string) => Promise<boolean>;
  openExtensionPopup: (accountId: string, extensionId: string, anchorBounds?: { x: number; y: number; width: number; height: number }) => Promise<boolean>;
  showExtensionDropdownMenu: (accountId?: string, rect?: { x: number; y: number; width: number; height: number }) => void;
  openWebStore: (accountId: string) => void;
  installWebStoreExtension: (accountId: string, urlOrId: string) => Promise<ExtensionInfo | null>;
  checkExtensionUpdates: (accountId?: string) => Promise<{ updatedCount: number; updatedList: string[] }>;

  // Settings & View toggle
  toggleSettings: (isOpen: boolean) => void;
  openDetachedSettings: (page?: string, accountId?: string) => void;
  closeDetachedSettings: () => void;
  isSettingsDetachedOpen: () => Promise<boolean>;
  toggleDisclaimer: (isOpen: boolean) => void;
  openDisclaimerWindow?: (firstLaunch?: boolean) => void;
  openProtocolPromptWindow?: (url: string) => void;
  openAvatarZoomWindow?: (url: string, title?: string) => void;
  toggleModal?: (isOpen: boolean, modalId?: string) => void;
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
  getSystemFontsMeta: () => Promise<{
    fonts: SystemFontInfo[];
    desktopFont: { name: string; isVariable: boolean };
    desktopMonoFont?: { name: string; isVariable: boolean };
  }>;
  resolveGoogleFont: (family: string, cachedUrl?: string) => Promise<GoogleFontResolution | null>;

  // Custom protocol controls
  onProtocolReceived: (callback: (url: string) => void) => () => void;
  handleProtocolUrl: (accountId: string, url: string) => Promise<{ success: boolean; cancelled?: boolean; error?: string }>;
  getGroupInviteDetails: (code: string) => Promise<GroupInviteDetails | null>;
  reopenProtocolPrompt: (url: string) => void;
  onProtocolReopenPrompt: (callback: (url: string) => void) => () => void;
  signalProtocolReady: () => void;
  toggleProtocolPrompt: (isOpen: boolean) => void;
  showToast: (message: string, url?: string) => void;
  onToastShow: (callback: (data: { message: string; url?: string }) => void) => () => void;
  toggleWallieDevTools: () => void;
  onNavConfirmationActive: (callback: (isActive: boolean) => void) => () => void;

  // Native Dialog Controls
  showPrompt: (options: NativePromptOptions) => Promise<NativePromptResult>;
  confirm: (options: NativeConfirmOptions) => Promise<boolean>;

  // Event listeners
  onAccountListChanged: (callback: (accounts: AccountInfo[], activeId: string) => void) => () => void;
  onUnreadCountChanged: (callback: (accountId: string, count: number) => void) => () => void;
  onMaximizedStateChanged: (callback: (isMaximized: boolean) => void) => () => void;
  onFullScreenChanged: (callback: (isFullScreen: boolean) => void) => () => void;
  onZoomChanged: (callback: (zoomPercent: number) => void) => () => void;
  onTriggerRename: (callback: (accountId: string) => void) => () => void;
  onNotificationHistoryChanged: (callback: (history: HistoricalNotification[]) => void) => () => void;
  onSettingsCloseRequest: (callback: () => void) => () => void;
  onDetachedSettingsClosed: (callback: () => void) => () => void;
  onSettingsNavigate: (callback: (data: { page?: string; accountId?: string }) => void) => () => void;
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
  clearLinkPreviewCache: () => Promise<{ clearedCount: number }>;
  getLinkPreviewCacheSize: () => Promise<number>;

  getThemeInfo: () => Promise<{ themeMode: 'system' | 'light' | 'dark'; shouldUseDarkColors: boolean }>;
  onThemeChanged: (callback: (info: { themeMode: 'system' | 'light' | 'dark'; shouldUseDarkColors: boolean }) => void) => () => void;

  // Chat Exporter Controls
  promptExportDirectory: (defaultName?: string) => Promise<string | null>;
  promptOpenExportFile: () => Promise<string | null>;
  openExportViewer: (filePath: string) => Promise<void>;
  stopChatExport: (exportId?: string) => Promise<boolean>;
  getExportableChats: () => Promise<Array<{ jid: string; title: string; isGroup: boolean; isCommunity: boolean; isBroadcast: boolean; unreadCount: number; timestamp: number; avatarUrl?: string }>>;
  getActiveExportChat: () => Promise<{ jid: string; title: string; isGroup: boolean } | null>;
  startChatExport: (options: ChatExportOptions) => Promise<{ success: boolean; exportId?: string; error?: string }>;
  startMultiChatExport: (request: MultiChatExportRequest) => Promise<{ success: boolean; exportId?: string; error?: string }>;
  onChatExportProgress: (callback: (progress: ChatExportProgress) => void) => () => void;
  onChatExportEnded: (callback: (exportId: string) => void) => () => void;
}

export const api: ElectronAPI = {
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  isFullScreen: () => ipcRenderer.invoke('window:isFullScreen'),
  resetWindowSize: () => ipcRenderer.invoke('window:reset-size'),
  toggleAlwaysOnTop: () => ipcRenderer.send('window:toggle-always-on-top'),
  getAlwaysOnTop: () => ipcRenderer.invoke('window:get-always-on-top'),
  platform: process.platform,

  getAccounts: () => ipcRenderer.invoke('account:get-all'),
  getActiveAccountId: () => ipcRenderer.invoke('account:get-active-id'),
  switchAccount: (id) => ipcRenderer.send('account:switch', id),
  addAccount: (optionsOrName) => ipcRenderer.invoke('account:add', optionsOrName),
  openAddAccountWindow: () => ipcRenderer.send('account:open-add-window'),
  toggleAddAccountPrompt: (isOpen) => ipcRenderer.send('account:toggle-add-prompt', isOpen),
  removeAccount: (id) => ipcRenderer.invoke('account:remove', id),
  renameAccount: (id, name) => ipcRenderer.invoke('account:rename', id, name),
  updateAccountEmoji: (id, emoji) => ipcRenderer.invoke('account:update-emoji', id, emoji),
  reloadActiveAccount: () => ipcRenderer.send('account:reload-active'),
  reloadAccount: (accountId) => ipcRenderer.send('account:reload', accountId),
  unloadAccount: (accountId) => ipcRenderer.invoke('account:unload', accountId),
  loadAccount: (accountId) => ipcRenderer.invoke('account:load', accountId),
  showAccountContextMenu: (accountId) => ipcRenderer.send('account:context-menu', accountId),
  showAccountDropdownMenu: (rect) => ipcRenderer.send('account:show-dropdown-menu', rect),
  onAccountDropdownStatus: (callback) => {
    const subscription = (_event: unknown, isOpen: boolean) => callback(isOpen);
    ipcRenderer.on('account:dropdown-status', subscription);
    return () => ipcRenderer.removeListener('account:dropdown-status', subscription);
  },
  openAccountSwitcherDropdown: () => Promise.resolve(''),
  closeAccountSwitcherDropdown: () => {},

  importExtension: (accountId, importType) => ipcRenderer.invoke('extension:import', accountId, importType),
  toggleExtension: (accountId, extensionId, enabled) => ipcRenderer.invoke('extension:toggle', accountId, extensionId, enabled),
  toggleExtensionPin: (accountId, extensionId, pinned) => ipcRenderer.invoke('extension:toggle-pin', accountId, extensionId, pinned),
  removeExtension: (accountId, extensionId) => ipcRenderer.invoke('extension:remove', accountId, extensionId),
  openExtensionPopup: (accountId, extensionId, anchorBounds) => ipcRenderer.invoke('extension:open-popup', accountId, extensionId, anchorBounds),
  showExtensionDropdownMenu: (accountId, rect) => ipcRenderer.send('extension:show-dropdown-menu', accountId, rect),
  openWebStore: (accountId) => ipcRenderer.send('webstore:open', accountId),
  installWebStoreExtension: (accountId, urlOrId) => ipcRenderer.invoke('extension:install-webstore', accountId, urlOrId),
  checkExtensionUpdates: (accountId) => ipcRenderer.invoke('extension:check-updates', accountId),

  toggleSettings: (isOpen) => ipcRenderer.send('settings:toggle', isOpen),
  openDetachedSettings: (page, accountId) => ipcRenderer.send('settings:open-detached', page, accountId),
  closeDetachedSettings: () => ipcRenderer.send('settings:close-detached'),
  isSettingsDetachedOpen: () => ipcRenderer.invoke('settings:is-detached-open'),
  toggleDisclaimer: (isOpen) => ipcRenderer.send('disclaimer:toggle', isOpen),
  openDisclaimerWindow: (firstLaunch) => ipcRenderer.send('disclaimer:open-window', firstLaunch),
  openProtocolPromptWindow: (url) => ipcRenderer.send('protocol:open-window', url),
  openAvatarZoomWindow: (url, title) => ipcRenderer.send('avatar:open-window', url, title),
  toggleModal: (isOpen, modalId) => ipcRenderer.send('modal:toggle', { isOpen, id: modalId }),
  resetZoom: () => ipcRenderer.send('zoom:reset'),
  resetAppScale: () => ipcRenderer.send('settings:reset-app-scale'),
  triggerZoomStep: (direction) => ipcRenderer.send('zoom:trigger-step', direction),
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
  getSystemFontsMeta: () => ipcRenderer.invoke('system:get-fonts-meta'),
  resolveGoogleFont: (family, cachedUrl) => ipcRenderer.invoke('system:resolve-google-font', family, cachedUrl),
  relaunchApp: () => ipcRenderer.send('app:relaunch'),
  focusActiveAccount: () => ipcRenderer.send('account:focus-active'),
  getThemeInfo: () => ipcRenderer.invoke('theme:get-current'),
  onThemeChanged: (callback) => {
    const subscription = (_event: unknown, info: { themeMode: 'system' | 'light' | 'dark'; shouldUseDarkColors: boolean }) => callback(info);
    ipcRenderer.on('theme:changed', subscription);
    return () => ipcRenderer.removeListener('theme:changed', subscription);
  },

  onProtocolReceived: (callback) => {
    const subscription = (_event: unknown, url: string) => callback(url);
    ipcRenderer.on('protocol:received-url', subscription);
    return () => ipcRenderer.removeListener('protocol:received-url', subscription);
  },
  handleProtocolUrl: (accountId, url) => ipcRenderer.invoke('protocol:handle-url', accountId, url),
  getGroupInviteDetails: (code) => ipcRenderer.invoke('protocol:get-group-invite-info', code),
  reopenProtocolPrompt: (url) => ipcRenderer.send('protocol:reopen-prompt', url),
  onProtocolReopenPrompt: (callback) => {
    const subscription = (_event: unknown, url: string) => callback(url);
    ipcRenderer.on('protocol:reopen-prompt', subscription);
    return () => ipcRenderer.removeListener('protocol:reopen-prompt', subscription);
  },
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
  showPrompt: (options) => ipcRenderer.invoke('dialog:show-prompt', options),
  confirm: (options) => ipcRenderer.invoke('dialog:show-confirm', options),

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

  onFullScreenChanged: (callback) => {
    const subscription = (_event: unknown, isFullScreen: boolean) => callback(isFullScreen);
    ipcRenderer.on('window:fullscreen-changed', subscription);
    return () => ipcRenderer.removeListener('window:fullscreen-changed', subscription);
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

  onTriggerAddAccount: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('account:trigger-add', subscription);
    return () => ipcRenderer.removeListener('account:trigger-add', subscription);
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

  onDetachedSettingsClosed: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('settings:detached-closed', subscription);
    return () => ipcRenderer.removeListener('settings:detached-closed', subscription);
  },

  onSettingsNavigate: (callback) => {
    const subscription = (_event: unknown, data: { page?: string; accountId?: string }) => callback(data);
    ipcRenderer.on('settings:navigate', subscription);
    return () => ipcRenderer.removeListener('settings:navigate', subscription);
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
  clearLinkPreviewCache: () => ipcRenderer.invoke('link-preview:clear-cache'),
  getLinkPreviewCacheSize: () => ipcRenderer.invoke('link-preview:get-cache-size'),

  promptExportDirectory: (defaultName) => ipcRenderer.invoke('chat-export:prompt-directory', defaultName),
  promptOpenExportFile: () => ipcRenderer.invoke('chat-export:prompt-open-file'),
  openExportViewer: (filePath) => ipcRenderer.invoke('chat-export:open-viewer', filePath),
  stopChatExport: (exportId) => ipcRenderer.invoke('chat-export:stop', exportId),
  getExportableChats: () => ipcRenderer.invoke('chat-export:get-chats'),
  getActiveExportChat: () => ipcRenderer.invoke('chat-export:get-active-chat'),
  startChatExport: (options) => ipcRenderer.invoke('chat-export:start', options),
  startMultiChatExport: (request) => ipcRenderer.invoke('chat-export:start-multi', request),
  onChatExportProgress: (callback) => {
    const subscription = (_event: unknown, progress: ChatExportProgress) => callback(progress);
    ipcRenderer.on('chat-export:progress', subscription);
    return () => ipcRenderer.removeListener('chat-export:progress', subscription);
  },
  onChatExportEnded: (callback) => {
    const subscription = (_event: unknown, exportId: string) => callback(exportId);
    ipcRenderer.on('chat-export:ended', subscription);
    return () => ipcRenderer.removeListener('chat-export:ended', subscription);
  },
};

export const sandboxAPI = {
  sendAction: (action: string, data?: any) => ipcRenderer.send('sandbox:action', action, data),
  onUpdate: (callback: (data: any) => void) => {
    const subscription = (_event: unknown, data: any) => callback(data);
    ipcRenderer.on('sandbox:update', subscription);
    return () => ipcRenderer.removeListener('sandbox:update', subscription);
  },
};

export function exposeRendererAPIs(): void {
  contextBridge.exposeInMainWorld('electronAPI', api);
  contextBridge.exposeInMainWorld('sandboxAPI', sandboxAPI);
}
