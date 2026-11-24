export interface ExtensionInfo {
  id: string;
  name: string;
  version: string;
  path: string;
  enabled: boolean;
  source?: 'webstore' | 'developer' | 'builtin';
  isBuiltIn?: boolean;
  hasPopup?: boolean;
  popupPath?: string;
  iconDataUrl?: string;
  pinnedInTitlebar?: boolean;
  description?: string;
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
  isMono?: boolean;
}

export interface DesktopFontMeta {
  name: string;
  isVariable: boolean;
}

export interface SystemFontsMetaResponse {
  fonts: SystemFontInfo[];
  desktopFont: DesktopFontMeta;
  desktopMonoFont?: DesktopFontMeta;
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

export interface WebErrorDetails {
  accountId: string;
  accountName?: string;
  errorCode: number;
  errorDescription: string;
  validatedURL: string;
  timestamp: number;
}

export interface Account {
  id: string;
  name: string;
  partition: string;
  unreadCount: number;
  loggedIn: boolean;
  extensions: ExtensionInfo[];
  showExtensionsButton?: boolean;
  emoji?: string;
  settings?: AccountSettings;
  isLoaded?: boolean;
}

export type AccountInfo = Account;

export interface AddAccountOptions {
  name?: string;
  emoji?: string;
  preload?: boolean;
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

export const DEFAULT_MIN_WINDOW_WIDTH = 480;
export const DEFAULT_MIN_WINDOW_HEIGHT = 540;

export type MultiAccountOpenChatBehavior = 'all' | 'focused' | 'disabled';
export type MultiAccountInlineReplyBehavior = 'disabled' | 'focused';

export interface GlobalSettings {
  closeToTray: boolean;
  hardwareAcceleration: boolean;
  appScale?: number;
  ctrlScrollZoomEnabled?: boolean;
  themeMode?: 'system' | 'light' | 'dark';
  preloadAccountIds?: string[];
  showDevToolsToggle?: boolean;
  showRefreshButton?: boolean;
  showNotificationHistoryButton?: boolean;
  notificationLoggingEnabled?: boolean;
  notificationLoggingWarningAcknowledged?: boolean;
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
  notificationRetentionDays?: number;
  coalesceMultiAccountNotifications?: boolean;
  multiAccountOpenChatBehavior?: MultiAccountOpenChatBehavior;
  multiAccountInlineReplyBehavior?: MultiAccountInlineReplyBehavior;
  defaultProtocolAccountId?: string;
  responsiveLayoutMode?: 'disabled' | 'auto' | 'portrait';
  unblockMinWindowSize?: boolean;
}

export interface NativePromptOptions {
  title: string;
  message: string;
  detail?: string;
  type?: 'none' | 'info' | 'error' | 'question' | 'warning';
  buttons?: string[];
  defaultId?: number;
  cancelId?: number;
  checkboxLabel?: string;
  checkboxChecked?: boolean;
}

export interface NativePromptResult {
  response: number;
  checkboxChecked?: boolean;
}

export interface NativeConfirmOptions {
  title: string;
  message: string;
  detail?: string;
  type?: 'none' | 'info' | 'error' | 'question' | 'warning';
  confirmLabel?: string;
  cancelLabel?: string;
  defaultConfirm?: boolean;
}

// Native notification history interfaces
export interface HistoricalNotificationSender {
  displayName?: string;
  avatarUrl?: string;
}

export interface HistoricalNotificationContent {
  type: string;
  body: string;
}

export interface HistoricalNotificationFlags {
  isEdited?: boolean;
  isDeleted?: boolean;
}

export interface HistoricalNotificationMessage {
  type: 'message';
  id: string;
  timestamp: string;
  displayTime?: string;
  direction?: 'incoming' | 'outgoing';
  sender?: HistoricalNotificationSender;
  accountId?: string;
  accountName?: string;
  content?: HistoricalNotificationContent;
  flags?: HistoricalNotificationFlags;
}

export interface HistoricalNotificationSystemEvent {
  type: 'system_event';
  id: string;
  timestamp: string;
  subtype?: string;
  text?: string;
  accountId?: string;
  accountName?: string;
}

export interface HistoricalNotificationDateDivider {
  type: 'date_divider';
  id: string;
  date: string;
  displayText: string;
}

export type HistoricalNotification =
  | HistoricalNotificationMessage
  | HistoricalNotificationSystemEvent
  | HistoricalNotificationDateDivider;

export interface NotificationHistoryExport {
  schemaVersion: string;
  exportedAt: string;
  app: string;
  version: string;
  accountFilter: string;
  totalNotifications: number;
  oldestTimestamp: string;
  newestTimestamp: string;
  notifications: HistoricalNotification[];
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
  const __ENABLE_DEV_BRIDGE__: boolean | undefined;
}

