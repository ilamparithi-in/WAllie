export interface ExtensionInfo {
  id: string;
  name: string;
  version: string;
  path: string;
  enabled: boolean;
  source?: 'webstore' | 'developer';
}

export interface AccountSettings {
  cameraEnabled: boolean;
  micEnabled: boolean;
  notificationsEnabled: boolean;
  geolocationEnabled?: boolean;
  clipboardReadEnabled?: boolean;
  customCss?: string;
  selectedTheme?: string;
}

export const DEFAULT_ACCOUNT_SETTINGS: AccountSettings = {
  cameraEnabled: true,
  micEnabled: true,
  notificationsEnabled: true,
  geolocationEnabled: false,
  clipboardReadEnabled: false,
  customCss: '',
  selectedTheme: 'none',
};

export interface Account {
  id: string;
  name: string;
  partition: string;
  unreadCount: number;
  loggedIn: boolean;
  extensions: ExtensionInfo[];
  emoji?: string;
  settings?: AccountSettings;
  isLoaded?: boolean;
}

export type FileSecondClickAction = 'open' | 'showInFolder' | 'saveAs' | 'download';

export interface DownloadRecord {
  id: number | string;
  filename: string;
  savePath: string;
  fileSize?: number;
  mimeType?: string;
  timestamp: number;
  accountId?: string;
  state: 'progressing' | 'completed' | 'failed' | 'cancelled';
}

export interface GlobalSettings {
  closeToTray: boolean;
  hardwareAcceleration: boolean;
  appScale?: number;
  preloadAccountIds?: string[];
  showDevToolsToggle?: boolean;
  showRefreshButton?: boolean;
  showNotificationHistoryButton?: boolean;
  notificationLoggingEnabled?: boolean;
  extensionDevMode?: boolean;
  autoUpdateExtensions?: boolean;
  startMinimized?: boolean;
  disclaimerAccepted?: boolean;
  externalLinkWarningEnabled?: boolean;
  trustedDomains?: string[];
  defaultDownloadsPath?: string;
  askWhereToSaveEveryTime?: boolean;
  fileSecondClickAction?: FileSecondClickAction;
  downloadNotificationsEnabled?: boolean;
}

export interface HistoricalNotification {
  id: string;
  accountId: string;
  accountName: string;
  title: string;
  body: string;
  icon: string;
  timestamp: number;
}

export interface AppVersionInfo {
  version: string;
  displayVersion: string;
  commitHash: string;
  commitCount: number;
  baseVersion: string;
  targetVersion: string;
  isRelease: boolean;
  isDirty: boolean;
  buildDate: string;
}

declare global {
  const __APP_VERSION_INFO__: AppVersionInfo | undefined;
}

