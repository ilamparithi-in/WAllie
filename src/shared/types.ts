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
  defaultProtocolAccountId?: string;
  standaloneLinkPreviewEnabled?: boolean;
}

export interface LinkPreviewData {
  url: string;
  title: string;
  description: string;
  thumbnailBase64?: string;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
  previewType?: 'video' | 'image' | 'none';
}

export interface WhatsAppChatExport {
  schemaVersion: "1.0.0";
  exportedAt: string; // ISO 8601 string
  exporter: {
    app: "WAllie";
    version: string;
    accountJid?: string;
    accountName?: string;
  };
  chat: ChatMetadata;
  exportRange: {
    requestedLimitTimestamp: string | null;
    oldestMessageTimestamp: string;
    newestMessageTimestamp: string;
    totalMessagesCount: number;
    completed: boolean;
  };
  timeline: TimelineEntry[];
}

export interface ChatMetadata {
  jid: string;
  name: string;
  type: "direct" | "group" | "broadcast" | "channel";
  phone?: string;
  isArchived?: boolean;
  isPinned?: boolean;
  isMuted?: boolean;
  groupMetadata?: {
    description?: string;
    ownerJid?: string;
    createdAt?: string;
    participantsCount?: number;
  };
  avatarUrl?: string;
}

export type TimelineEntry = 
  | DateDividerEntry 
  | SystemNotificationEntry 
  | MessageEntry;

export interface DateDividerEntry {
  type: "date_divider";
  id: string;
  date: string; // YYYY-MM-DD
  displayText: string;
}

export interface SystemNotificationEntry {
  type: "system_event";
  id: string;
  timestamp: string; // ISO 8601
  subtype: 
    | "e2e_encryption"
    | "group_creation"
    | "participant_joined"
    | "participant_left"
    | "disappearing_timer_change"
    | "call_log"
    | "generic";
  text: string;
  accountId?: string;
  accountName?: string;
}

export interface MessageEntry {
  type: "message";
  id: string;
  timestamp?: string; // ISO 8601 string
  displayTime?: string;
  direction?: "incoming" | "outgoing";
  sender?: MessageSender;
  layout?: {
    hasTail?: boolean;
    isContinuation?: boolean;
  };
  status?: "pending" | "sent" | "delivered" | "read";
  flags?: {
    isForwarded?: boolean;
    isForwardedManyTimes?: boolean;
    isStarred?: boolean;
    isEdited?: boolean;
    isPinned?: boolean;
    isDeleted?: boolean;
    originalContent?: string;
  };
  replyContext?: QuotedReplyContext;
  content: MessageContent;
  reactions?: MessageReaction[];
  accountId?: string;
  accountName?: string;
}

export interface MessageSender {
  jid?: string;
  displayName?: string;
  colorIndex?: number;
  avatarUrl?: string;
}

export interface QuotedReplyContext {
  id?: string;
  sender?: {
    jid?: string;
    displayName?: string;
  };
  textSnippet?: string;
  mediaType?: "image" | "video" | "audio" | "document" | "sticker" | "location";
  thumbnailUrl?: string;
}

export interface MessageReaction {
  emoji: string;
  senderJid?: string;
  senderName?: string;
  timestamp?: string;
}

export type MessageContent = 
  | TextContent
  | ImageContent
  | VideoContent
  | AudioContent
  | DocumentContent
  | StickerContent
  | ContactContent
  | LocationContent
  | PollContent
  | UnsupportedContent;

export interface TextContent {
  type: "text";
  body: string;
  richEntities?: {
    type: "mention" | "link" | "bold" | "italic" | "strikethrough" | "monospace";
    offset: number;
    length: number;
    value?: string;
  }[];
  linkPreview?: {
    url: string;
    title?: string;
    description?: string;
    domain?: string;
    thumbnailUrl?: string;
  };
  wasTruncatedByReadMore?: boolean;
}

export interface ImageContent {
  type: "image";
  caption?: string;
  mediaRef: string;
  mimeType: string;
  dimensions?: { width: number; height: number };
  thumbnailDataUri?: string;
  isViewOnce?: boolean;
}

export interface VideoContent {
  type: "video";
  caption?: string;
  mediaRef: string;
  mimeType: string;
  durationSeconds?: number;
  thumbnailDataUri?: string;
  dimensions?: { width: number; height: number };
  isGif?: boolean;
}

export interface AudioContent {
  type: "audio";
  isVoiceNote: boolean;
  mediaRef: string;
  mimeType: string;
  durationSeconds: number;
  waveform?: number[];
}

export interface DocumentContent {
  type: "document";
  fileName: string;
  fileSize: number;
  fileSizeBytesText: string;
  mimeType: string;
  pageCount?: number;
  mediaRef: string;
  thumbnailDataUri?: string;
}

export interface StickerContent {
  type: "sticker";
  mediaRef: string;
  isAnimated: boolean;
  mimeType: string;
}

export interface ContactContent {
  type: "contact";
  displayName: string;
  vcardData?: string;
  phones: { number: string; label?: string }[];
}

export interface LocationContent {
  type: "location";
  isLive: boolean;
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  thumbnailDataUri?: string;
  liveLocationExpiresAt?: string;
}

export interface PollContent {
  type: "poll";
  question: string;
  allowMultipleAnswers: boolean;
  options: {
    id: string;
    title: string;
    votesCount: number;
    voters?: string[];
    isVotedByMe?: boolean;
  }[];
}

export interface UnsupportedContent {
  type: "unsupported";
  rawDomSummary?: string;
  fallbackText: string;
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

// Canonical alias for notification history entries conforming to the chat export spec
export type HistoricalNotification = TimelineEntry;

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

