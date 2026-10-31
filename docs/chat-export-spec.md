# WhatsApp Web Chat Export — JSON Specification Sheet (v1.0)

This specification defines the JSON schema designed to faithfully capture, persist, and reconstruct WhatsApp Web chats as rendered in the active web client. Every design decision and field is justified from first principles based on the WhatsApp Web DOM, user presentation requirements, and export portability, completely independent of any existing codebase implementation.

---

## 1. Core Architecture & Design Principles

1. **Pixel-Perfect Visual Fidelity**: WhatsApp Web does not merely display raw text; it organizes messages into grouped bubbles, tails, status ticks, quoted context previews, media badges, reactions, date pills, and system banners. The schema must retain all structural and styling hints necessary for a viewer to replicate the exact UI.
2. **Deterministic Sequence & Appendability**: The export format must allow streaming writes (appending items during extraction) so that if the user aborts an ongoing export, the resulting file remains valid JSON or JSONL.
3. **Decoupled Media Strategy & Browser Bundle Convention**: While small thumbnails can be inlined (as Data URIs), binary media (videos, full-res images, audio notes, documents) are stored in an accompanying assets directory following the Chrome "Save Webpage, Complete" convention (`<chat_name>.json` alongside `<chat_name>_files/`), ensuring the JSON document does not balloon beyond memory limits.
4. **Resilient & Schema-Versioned**: Strict semantic versioning (`schemaVersion: "1.0.0"`) allows future extensions (such as community channel threads or new message types) without breaking viewers.
5. **Fault-Tolerant & Graceful Visual Degradation**: No matter how many fields are missing or omitted (e.g. from lightweight notification captures, aborted exports, or DOM scrape limitations), the UI viewer must render the best possible visual representation. No rich metadata field is strictly mandatory; the renderer gracefully infers, computes defaults, or omits missing attributes without crashing.

---

## 2. Complete TypeScript Type Definitions

```typescript
/**
 * Root export envelope containing chat-level metadata and an ordered sequence of entries.
 */
export interface WhatsAppChatExport {
  schemaVersion: "1.0.0";
  exportedAt: string; // ISO 8601 string
  exporter: {
    app: "WAllie";
    version: string;
    accountJid: string; // Active account JID (e.g., "1234567890@s.whatsapp.net")
    accountName: string; // Profile name of active account
  };
  chat: ChatMetadata;
  exportRange: {
    requestedLimitTimestamp: string | null; // ISO 8601 or null (for all history)
    oldestMessageTimestamp: string;
    newestMessageTimestamp: string;
    totalMessagesCount: number;
    completed: boolean; // false if aborted mid-export
  };
  // Chronological timeline containing date dividers, system alerts, and message bubbles
  timeline: TimelineEntry[];
}

export interface ChatMetadata {
  jid: string; // e.g., "1234567890@s.whatsapp.net" or "xxxx-yyyy@g.us"
  name: string; // Contact or group name as displayed
  type: "direct" | "group" | "broadcast" | "channel";
  phone?: string; // Formatted phone number if known
  isArchived?: boolean;
  isPinned?: boolean;
  isMuted?: boolean;
  groupMetadata?: {
    description?: string;
    ownerJid?: string;
    createdAt?: string;
    participantsCount?: number;
  };
  avatarUrl?: string; // Data URI or relative local image path
}

export type TimelineEntry = 
  | DateDividerEntry 
  | SystemNotificationEntry 
  | MessageEntry;

/**
 * Centered date divider badge (e.g. "Today", "Yesterday", "Wednesday, 28 October 2026")
 */
export interface DateDividerEntry {
  type: "date_divider";
  id: string; // Unique ID (e.g., "divider-2026-10-28")
  date: string; // YYYY-MM-DD
  displayText: string; // "Today", "Yesterday", or full formatted date string
}

/**
 * Centered system notices (encryption notice, safety number changed, member joined, timer updated)
 */
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
}

/**
 * Standard message entry (incoming or outgoing bubble)
 */
export interface MessageEntry {
  type: "message";
  id: string; // Unique ID (WhatsApp stanza ID if available, or synthetic hash/timestamp)
  timestamp?: string; // ISO 8601 string (optional; UI can format from displayTime or vice-versa)
  displayTime?: string; // Formatted time string as rendered (e.g. "8:10 pm")
  
  direction?: "incoming" | "outgoing"; // Inferred from sender if omitted
  sender?: MessageSender; // Optional; defaults to chat contact or "Unknown"
  
  // Layout and visual clustering properties (purely optional)
  layout?: {
    hasTail?: boolean; // If omitted, viewer dynamically computes based on sender continuity
    isContinuation?: boolean;
  };
  
  status?: "pending" | "sent" | "delivered" | "read"; // Ticks indicator (outgoing only; omitted = no ticks)
  
  // Status flags (all optional)
  flags?: {
    isForwarded?: boolean;
    isForwardedManyTimes?: boolean;
    isStarred?: boolean;
    isEdited?: boolean;
    isPinned?: boolean;
    isDeleted?: boolean;
  };
  
  // Quoted reply context (if replying to another message)
  replyContext?: QuotedReplyContext;
  
  // Content payload
  content: MessageContent;
  
  // Interactive additions
  reactions?: MessageReaction[];
}

export interface MessageSender {
  jid?: string; // WhatsApp JID (optional; notifications rarely have JIDs)
  displayName?: string; // "You", contact name, or phone number (defaults to "Unknown")
  colorIndex?: number; // 1-20 color index (if omitted, viewer hashes displayName)
  avatarUrl?: string; // Optional local path or data URI
}

export interface QuotedReplyContext {
  id?: string; // Referenced message ID (for interactive jump if available in timeline)
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

/**
 * Discriminated union of content variants
 */
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
  body: string; // Raw text including newlines and unicode emojis
  richEntities?: {
    type: "mention" | "link" | "bold" | "italic" | "strikethrough" | "monospace";
    offset: number;
    length: number;
    value?: string; // e.g., URL target or mentioned JID
  }[];
  linkPreview?: {
    url: string;
    title?: string;
    description?: string;
    domain?: string;
    thumbnailUrl?: string;
  };
  wasTruncatedByReadMore?: boolean; // Indicates if DOM truncated with "... Read more"
}

export interface ImageContent {
  type: "image";
  caption?: string;
  mediaRef: string; // Relative file path (e.g., "media/3EB0CC0D.jpg") or Data URI
  mimeType: string;
  dimensions?: { width: number; height: number };
  thumbnailDataUri?: string; // Lightweight base64 placeholder for progressive rendering
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
  isVoiceNote: boolean; // PTT (Push-to-Talk) voice message vs general audio file
  mediaRef: string;
  mimeType: string;
  durationSeconds: number;
  waveform?: number[]; // Normalized 0-100 amplitude samples for voice note waveform playback
}

export interface DocumentContent {
  type: "document";
  fileName: string;
  fileSize: number; // Bytes
  fileSizeBytesText: string; // Formatted string, e.g. "2.4 MB"
  mimeType: string;
  pageCount?: number; // For PDF files
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
    voters?: string[]; // Names/JIDs of voters
    isVotedByMe?: boolean;
  }[];
}

export interface UnsupportedContent {
  type: "unsupported";
  rawDomSummary?: string;
  fallbackText: string;
}
```

---

## 3. Justifications for Every Architectural & Schema Decision

### 3.1. Envelope & File Metadata (`exportRange`, `completed`)
- **Justification**: A user must be allowed to interrupt extraction at any time. Placing an `exportRange` with `completed: boolean`, `oldestMessageTimestamp`, and `requestedLimitTimestamp` ensures that any interrupted export is explicit about where it started and where it halted, preventing corruption or invalid assumptions when reloaded into a viewer.

### 3.2. Single Timeline Array of Polymorphic Entries (`TimelineEntry[]`)
- **Justification**: In WhatsApp Web, visual elements appear sequentially in a single scrollable container (`conversation-panel-messages`):
  1. A date pill (`"Today"`, `"Yesterday"`, or `"Wednesday"`).
  2. A cluster of messages.
  3. A system alert (`"Messages and calls are end-to-end encrypted"` or `"Security code changed"`).
  4. Another cluster of messages.
  Storing messages and dividers in a flattened, chronological timeline guarantees that the viewer renders date pills and system banners at their exact interleaved positions rather than calculating or synthesizing them after the fact.

### 3.3. Distinguishing `timestamp` (ISO 8601) vs `displayTime` ("8:10 pm")
- **Justification**: 
  - `timestamp` is essential for programmatic operations: chronological sorting, export range boundaries, and timezone conversions.
  - `displayTime` preserves the verbatim rendering from the active session (e.g. localized 12-hour/24-hour preference and AM/PM casing) ensuring that the viewer presents the exact visual string seen in the original chat.

### 3.4. Layout Closeness & Bubble Tails (`hasTail`, `isContinuation`)
- **Justification**: WhatsApp Web does not render every message bubble with a tail. Only the first (or last) message in a consecutive group from the same sender has the pointer SVG (`tail-out` / `tail-in`). Consecutive messages from the same sender are rendered with tighter vertical padding (`gap: 2px`) and rounded corners on all four sides. Capturing `hasTail` and `isContinuation` allows the UI renderer to replicate this clustering without complex CSS heuristics.

### 3.5. Sender Group Coloring (`colorIndex`)
- **Justification**: In group chats, WhatsApp Web assigns each participant a specific brand color (e.g., emerald green, teal, purple, amber) for their display name. By capturing `colorIndex` (or deriving it deterministically from `sender.jid`), the viewer can color-code group participants identical to WhatsApp Web.

### 3.6. Content Variant Discriminated Union
- **Justification**: WhatsApp Web treats each media type with a custom layout:
  - **Images & Videos**: Full-bleed rectangular cards with overlay timestamps or inline captions (`image-caption`).
  - **Voice Notes**: Horizontal playback bar with a scrubbable waveform, duration pill, and microphone icon.
  - **Documents**: White/tinted icon box showing file extension, file name, byte size, and download arrow.
  - **Polls**: Interactive checkbox list with vote percentages and voter tally badges.
  - **Quoted Context**: Embedded banner showing the original author's name, thumbnail preview, and color-matched left accent border.
  By separating content into strongly typed variants (`TextContent`, `ImageContent`, `AudioContent`, `PollContent`), the viewer component can dispatch directly to specialized sub-components (`<ImageBubble />`, `<VoiceNoteBubble />`, `<PollBubble />`).

### 3.7. `reactions` as an Array
- **Justification**: Reactions render as pill overlays anchored to the bottom-right or bottom-left of the message bubble (`addon-bubble-container`). They can feature multiple emojis from different participants. Storing them as a list of `{ emoji, senderJid, senderName }` permits rendering both the consolidated emoji icons and the tooltip listing who reacted.

### 3.8. Handling DOM Quirks (`wasTruncatedByReadMore`, `unsupported`)
- **Justification**: 
  - WhatsApp Web collapses long texts behind a `... Read more` button. If an export occurs while a message is collapsed, marking `wasTruncatedByReadMore: true` alerts the viewer or exporter that the text body represents a collapsed snippet unless expanded.
  - A fallback `unsupported` type ensures future or unanticipated WhatsApp widgets (e.g. Meta AI prompts, custom business interactive buttons) do not crash the parser or omit data.

### 3.9. Graceful Visual Degradation & Fallback Resolution Rules
- **Justification**:
  When data is captured from sources with varying fidelity (e.g., standard desktop OS notifications, background intercepts, or interrupted DOM exports), large portions of metadata will naturally be absent. The viewer must **never crash or display blank bubbles** when fields are missing.
  - **Missing `direction`**: If `direction` is omitted, the renderer checks if `sender.displayName === "You"`; if true, it renders outgoing, otherwise incoming.
  - **Missing `layout` (`hasTail`, `isContinuation`)**: The viewer calculates bubble grouping on the fly: if two consecutive messages share the same sender and are within 60 seconds of each other, the second is rendered as a continuation without a tail.
  - **Missing `colorIndex`**: The viewer computes a deterministic hash of the sender's name (e.g., `crc32(name) % 20`) to assign a persistent participant color.
  - **Missing `status` (ticks)**: Outgoing messages without a status simply render the timestamp without tick SVGs.
  - **Missing `timestamp` or `displayTime`**: If `timestamp` is missing, `displayTime` is used verbatim; if `displayTime` is missing, it is formatted dynamically from `timestamp`. If both are missing, time display is omitted cleanly.
  - **Missing `mediaRef` or Failed Media Load**: Renders a standard WhatsApp media placeholder with a subtle *"Media unavailable"* notice.

### 3.10. Reply Context & Virtualized DOM Jumping Behavior
- **Justification & Mechanics**:
  - **Observed WA Web Behavior**: WhatsApp Web uses a heavily virtualized DOM (`data-virtualized="false"` / dynamic mounting) for conversation panels. When a user clicks a quoted reply preview, WA Web looks for the target message element in the active DOM tree. If the target message is far up and unmounted (not currently rendered in memory or waiting to be fetched from IndexedDB/phone), the click does **not** jump immediately. Instead, WA Web triggers background scroll pagination; only once the target DOM node is finally rendered does the viewport suddenly jump and flash the yellow highlight on the target message.
  - **Export & Viewer Architecture**:
    1. **Self-Contained Fallback**: Every `replyContext` captures an inline text snippet and author display name so the quoted preview bubble renders 100% faithfully, even if the referenced original message is outside the exported time boundary.
    2. **Deterministic Jumping**: Because all exported messages are loaded into the viewer's memory timeline, the viewer can immediately scroll and apply the pulse highlight to the referenced `id` without any virtual DOM load stalls.
    3. **Out-of-Range Graceful Notice**: If a user clicks a quoted message whose `id` falls outside the exported time range, the viewer provides non-intrusive feedback (e.g., a toast: *"Referenced message is outside the exported date range"*).

---

## 4. Concrete JSON Examples

### 4.1. Text Message with Reply Context & Reaction

```json
{
  "type": "message",
  "id": "3EB0000000000000000002",
  "timestamp": "2026-10-29T16:32:10.000Z",
  "displayTime": "10:02 pm",
  "direction": "incoming",
  "sender": {
    "jid": "1234567890@s.whatsapp.net",
    "displayName": "Alex",
    "colorIndex": 3
  },
  "layout": {
    "hasTail": true,
    "isContinuation": false
  },
  "flags": {
    "isStarred": false,
    "isEdited": false
  },
  "replyContext": {
    "id": "3EB0000000000000000003",
    "sender": {
      "displayName": "You"
    },
    "textSnippet": "Discussing project architecture and implementation details..."
  },
  "content": {
    "type": "text",
    "body": "Checking the latest release build.",
    "richEntities": [
      { "type": "bold", "offset": 0, "length": 5 }
    ]
  },
  "reactions": [
    {
      "emoji": "🔥",
      "senderJid": "9876543210@s.whatsapp.net",
      "senderName": "You"
    }
  ]
}
```

### 4.2. Image Message with Caption & Outgoing Read Ticks

```json
{
  "type": "message",
  "id": "3EB0000000000000000004",
  "timestamp": "2026-10-28T14:40:00.000Z",
  "displayTime": "8:10 pm",
  "direction": "outgoing",
  "sender": {
    "jid": "9876543210@s.whatsapp.net",
    "displayName": "You"
  },
  "status": "read",
  "layout": {
    "hasTail": true,
    "isContinuation": false
  },
  "flags": {},
  "content": {
    "type": "image",
    "caption": "Sharing screenshot from web client",
    "mediaRef": "media/3EB0000000000000000004.jpeg",
    "mimeType": "image/jpeg",
    "dimensions": { "width": 1280, "height": 720 },
    "thumbnailDataUri": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
  }
}
```

### 4.3. Voice Note with Waveform Data

```json
{
  "type": "message",
  "id": "3EB0112233445566778899",
  "timestamp": "2026-10-28T14:45:00.000Z",
  "displayTime": "8:15 pm",
  "direction": "incoming",
  "sender": {
    "jid": "1234567890@s.whatsapp.net",
    "displayName": "Alex"
  },
  "layout": {
    "hasTail": false,
    "isContinuation": true
  },
  "flags": {},
  "content": {
    "type": "audio",
    "isVoiceNote": true,
    "mediaRef": "media/3EB0112233445566778899.ogg",
    "mimeType": "audio/ogg; codecs=opus",
    "durationSeconds": 14,
    "waveform": [12, 24, 45, 80, 100, 65, 30, 20, 50, 90, 75, 40, 15, 5]
  }
}
```

### 4.4. Date Divider & System Event

```json
[
  {
    "type": "date_divider",
    "id": "divider-2026-10-28",
    "date": "2026-10-28",
    "displayText": "Wednesday"
  },
  {
    "type": "system_event",
    "id": "sys-e2ee-init",
    "timestamp": "2026-10-28T00:00:00.000Z",
    "subtype": "e2e_encryption",
    "text": "Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them."
  }
]
```

---

## 5. Storage & Packaging Model

When an export is generated, it follows the standard **Browser Complete Webpage** pattern (e.g. saving a webpage in Chrome creates `document.html` and `document_files/`).

### 5.1. Standard Export Structure
Inside the user's selected export folder, WAllie generates the primary data file (and optionally an offline viewer HTML) paired directly with a matching `_files` folder:

```
/path/to/selected-export-directory/
├── WhatsApp-Chat-Alex.json                <-- Complete JSON export conforming to this spec
├── WhatsApp-Chat-Alex.html                <-- Self-contained offline viewer page
└── WhatsApp-Chat-Alex_files/              <-- Companion media folder (named <filename>_files)
    ├── 3EB0000000000000000004.jpeg        <-- Full-resolution media attachments
    ├── 3EB0112233445566778899.ogg        <-- Audio / voice note files
    ├── quarterly_report.pdf               <-- Document attachments
    └── avatars/                           <-- Cached sender profile pictures
        └── 1234567890@s.whatsapp.net.jpg
```

### 5.2. Media Paths and Relatability
- Inside `WhatsApp-Chat-Alex.json`, all `mediaRef` and `avatarUrl` fields reference assets using relative paths pointing into the companion `_files` folder:
  `"mediaRef": "WhatsApp-Chat-Alex_files/3EB0000000000000000004.jpeg"`
- This makes the entire directory portable: moving, copying, or archiving the parent directory preserves all relative links for both the JSON consumer and the HTML viewer.

### 5.3. Inlined Self-Contained Fallback (Portable Single File)
- If the user selects **"Single-file JSON only"** (or for quick text-and-thumbnail backups), binary assets under a configurable size threshold (e.g., < 2 MB) are inlined directly into `mediaRef` as `data:<mime>;base64,...` URIs, eliminating the need for an external `_files` folder.

