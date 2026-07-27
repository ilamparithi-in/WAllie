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

export interface HistoricalNotification {
  id: string;
  accountId: string;
  accountName: string;
  title: string;
  body: string;
  icon: string;
  timestamp: number;
}
