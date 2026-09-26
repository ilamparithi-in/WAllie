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
  fontFamily?: string;
  fontUrl?: string;
  preferGoogleFont?: boolean;
  monoFontFamily?: string;
  monoFontUrl?: string;
  preferGoogleMonoFont?: boolean;
  followSystemFont?: boolean;
  customWallpaper?: string;
}

export interface SystemFontInfo {
  name: string;
  isVariable: boolean;
}

export interface GroupInviteDetails {
  code: string;
  name?: string;
  iconUrl?: string;
  description?: string;
}

export const DEFAULT_ACCOUNT_SETTINGS: AccountSettings = {
  cameraEnabled: true,
  micEnabled: true,
  notificationsEnabled: true,
  geolocationEnabled: false,
  clipboardReadEnabled: false,
  customCss: '',
  selectedTheme: 'none',
  fontFamily: '',
  fontUrl: '',
  preferGoogleFont: false,
  monoFontFamily: '',
  monoFontUrl: '',
  preferGoogleMonoFont: false,
  followSystemFont: false,
  customWallpaper: '',
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
  fileHash?: string;
  mimeType?: string;
  timestamp: number;
  accountId?: string;
  state: 'progressing' | 'completed' | 'failed' | 'cancelled';
}

export interface GlobalSettings {
  closeToTray: boolean;
  hardwareAcceleration: boolean;
  appScale?: number;
  ctrlScrollZoomEnabled?: boolean;
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
  lastManualDownloadPath?: string;
  askWhereToSaveEveryTime?: boolean;
  fileSecondClickAction?: FileSecondClickAction;
  downloadNotificationsEnabled?: boolean;
  inlineReplyEnabled?: boolean;
  notificationDismissalTime?: number;
  defaultProtocolAccountId?: string;
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

