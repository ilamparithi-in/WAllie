/**
 * Strongly-typed definitions for WhatsApp Chat Export and Viewer conforming to docs/chat-export-spec.md
 * and live reverse-engineering findings in docs/chat-export-investigation.md.
 */

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
    requestedLimitTimestamp: string | null; // ISO 8601 or null (all history)
    oldestMessageTimestamp: string;
    newestMessageTimestamp: string;
    totalMessagesCount: number;
    completed: boolean; // false if aborted mid-export
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
  parentCommunityJid?: string;
  parentCommunityTitle?: string;
  groupMetadata?: {
    description?: string;
    ownerJid?: string;
    createdAt?: string;
    participantsCount?: number;
    participants?: Array<{
      jid: string;
      displayName: string;
      isAdmin?: boolean;
      isSuperAdmin?: boolean;
      avatarUrl?: string;
    }>;
    memberLabels?: Record<string, string>; // member LID/JID -> custom tag string
  };
  avatarUrl?: string; // Relative path in companion _files/ or data URI
}

export type TimelineEntry = 
  | DateDividerEntry 
  | SystemNotificationEntry 
  | MessageEntry;

export interface DateDividerEntry {
  type: "date_divider";
  id: string;
  date: string; // YYYY-MM-DD
  displayText: string; // "Today", "Yesterday", or formatted date string
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
    | "group_description_change"
    | "generic";
  text: string;
  accountId?: string;
  accountName?: string;
}

export interface MessageEntry {
  type: "message";
  id: string;
  serializedId?: string; // Full WhatsApp compound key for model retrieval
  timestamp?: string; // ISO 8601 string
  displayTime?: string; // e.g. "8:10 pm"
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
  memberLabel?: string; // Text displayed underneath author name in groups
  isCommunityAdmin?: boolean;
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
  count?: number;
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
  | EventContent
  | CallLogContent
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
  isExpired?: boolean;
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
  isExpired?: boolean;
}

export interface AudioContent {
  type: "audio";
  isVoiceNote: boolean;
  mediaRef: string;
  mimeType: string;
  durationSeconds: number;
  waveform?: number[];
  isExpired?: boolean;
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
  isExpired?: boolean;
}

export interface StickerContent {
  type: "sticker";
  mediaRef: string;
  isAnimated: boolean;
  mimeType: string;
  isExpired?: boolean;
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

export interface EventContent {
  type: "event";
  name: string;
  description?: string;
  startTime?: string;
  location?: string;
  isCanceled?: boolean;
}

export interface CallLogContent {
  type: "call_log";
  isVideoCall: boolean;
  callDurationSeconds: number | null; // null or 0 = missed/unanswered
  callCreatorJid?: string;
  callCreatorName?: string;
  participantsCount?: number;
}

export interface UnsupportedContent {
  type: "unsupported";
  rawDomSummary?: string;
  fallbackText: string;
}

/**
 * Options and parameters for running chat export jobs.
 */
export interface ChatExportOptions {
  accountId: string;
  chatJid: string;
  chatTitle?: string;
  outputDirectory: string;
  includeViewer: boolean;
  timeframeBoundary: string | null; // ISO 8601 or null (all history)
}

export interface MultiChatExportRequest {
  accountId: string;
  chats: {
    jid: string;
    title: string;
    isGroup: boolean;
    avatarUrl?: string;
  }[];
  outputDirectory: string;
  includeViewer: boolean;
  timeframeBoundary: string | null;
}

export interface ChatExportProgress {
  exportId: string;
  accountId: string;
  chatJid: string;
  chatTitle: string;
  currentChatIndex: number;
  totalChatsCount: number;
  messagesExported: number;
  mediaFilesSaved: number;
  oldestMessageDate: string | null;
  status:
    | 'starting'
    | 'scrolling'
    | 'hydrating'
    | 'downloading_media'
    | 'saving'
    | 'completed'
    | 'aborted'
    | 'failed';
  outputDirectory?: string;
  jsonPath?: string;
  htmlPath?: string;
  error?: string;
}

export interface ChatExportResult {
  success: boolean;
  aborted?: boolean;
  jsonPath?: string;
  htmlPath?: string;
  filesDirPath?: string;
  messagesCount: number;
  mediaCount: number;
  error?: string;
}

