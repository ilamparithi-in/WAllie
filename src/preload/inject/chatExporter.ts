import './types';
import type {
  WhatsAppChatExport,
  ChatMetadata,
  TimelineEntry,
  DateDividerEntry,
  MessageEntry,
  MessageSender,
  MessageContent,
  TextContent,
  ImageContent,
  VideoContent,
  AudioContent,
  DocumentContent,
  StickerContent,
  ContactContent,
  LocationContent,
  PollContent,
  EventContent,
  CallLogContent,
  QuotedReplyContext,
  MessageReaction,
  ChatExportOptions,
} from '../../shared/chatExportTypes';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Normalizes strings for robust matching.
 */
function norm(s: string | null | undefined): string {
  return (s || '')
    .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/['"’‘`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Returns WhatsApp collections safely from WhatsApp Web's webpack require system.
 */
function getCollection(name: string): any {
  try {
    return window.require?.(name);
  } catch {
    return null;
  }
}

/**
 * Retrieves all currently loaded chats in the active account.
 */
export function getAvailableChats(): Array<{
  jid: string;
  title: string;
  isGroup: boolean;
  isCommunity: boolean;
  isBroadcast: boolean;
  unreadCount: number;
  timestamp: number;
  avatarUrl?: string;
}> {
  try {
    const ChatCollection = getCollection('WAWebChatCollection')?.ChatCollection;
    if (!ChatCollection) return [];

    const models = ChatCollection.getModelsArray ? ChatCollection.getModelsArray() : [];
    return models.map((c: any) => ({
      jid: String(c.id?._serialized || c.id || ''),
      title: String(c.formattedTitle || c.name || c.contact?.formattedName || 'Unknown'),
      isGroup: Boolean(c.isGroup || c.id?.server === 'g.us' || c.groupMetadata),
      isCommunity: Boolean(c.isParentGroup || c.isCommunity || c.parentGroup),
      isBroadcast: Boolean(c.isBroadcast || c.id?.server === 'broadcast'),
      unreadCount: Number(c.unreadCount || 0),
      timestamp: Number(c.t || 0),
      avatarUrl: c.contact?.profilePicThumb?.img || undefined,
    }));
  } catch (err) {
    console.error('[walinux-exporter] Failed to get available chats:', err);
    return [];
  }
}

/**
 * Retrieves info about the currently active open chat.
 */
export function getActiveChatInfo(): {
  jid: string;
  title: string;
  isGroup: boolean;
} | null {
  try {
    const ChatCollection = getCollection('WAWebChatCollection')?.ChatCollection;
    const active = ChatCollection?.getActive ? ChatCollection.getActive() : null;
    if (!active) return null;

    return {
      jid: String(active.id?._serialized || active.id || ''),
      title: String(active.formattedTitle || active.name || 'Chat'),
      isGroup: Boolean(active.isGroup || active.id?.server === 'g.us' || active.groupMetadata),
    };
  } catch (err) {
    return null;
  }
}

/**
 * Switches the active conversation to the target chat JID.
 */
export async function openChatByJid(targetJid: string, targetTitle?: string): Promise<boolean> {
  const current = getActiveChatInfo();
  if (current && current.jid === targetJid) {
    return true; // Already active
  }

  const ChatCollection = getCollection('WAWebChatCollection')?.ChatCollection;
  const targetChat = ChatCollection?.get ? ChatCollection.get(targetJid) : null;

  // Attempt 1: Command interface
  const Cmd = getCollection('WAWebCmd')?.Cmd;
  if (Cmd && targetChat) {
    try {
      if (typeof Cmd.openChatAt === 'function') {
        Cmd.openChatAt(targetChat);
        await sleep(300);
      }
    } catch (e) {}
  }

  // Attempt 2: DOM row click
  const safeTitle = targetTitle || (targetChat ? targetChat.formattedTitle || targetChat.name : '');
  if (safeTitle) {
    const titleSpan = Array.from(document.querySelectorAll('span[dir="auto"][title]')).find(
      (el) => norm(el.getAttribute('title')) === norm(safeTitle)
    );
    if (titleSpan) {
      const clickEl = titleSpan.closest('div[role="listitem"]') || titleSpan;
      (clickEl as HTMLElement).click();
      await sleep(300);
    }
  }

  // Verify switch
  for (let i = 0; i < 20; i++) {
    const active = getActiveChatInfo();
    if (active && active.jid === targetJid) {
      return true;
    }
    await sleep(150);
  }

  return false;
}

/**
 * Builds a Member Labels lookup map for the given group.
 */
function getMemberLabelsMap(groupJid: string): Record<string, string> {
  const map: Record<string, string> = {};
  try {
    const MemberLabelCollection = getCollection('WAWebMemberLabelCollection')?.MemberLabelCollection;
    if (!MemberLabelCollection) return map;

    const models = MemberLabelCollection.getModelsArray ? MemberLabelCollection.getModelsArray() : [];
    for (const m of models) {
      const id = String(m.id || '');
      if (id.startsWith(groupJid) && m.__x_label) {
        // ID format: <GROUP_JID>_<MEMBER_LID>
        const parts = id.split('_');
        if (parts.length > 1) {
          map[parts[1]] = String(m.__x_label);
        }
      }
    }
  } catch (err) {}
  return map;
}

/**
 * Extracts a single MessageEntry from a WhatsApp message model.
 */
function extractMessageEntry(
  m: any,
  activeChat: any,
  memberLabelsMap: Record<string, string>
): MessageEntry | null {
  if (!m || !m.id) return null;

  const stanzaId = String(m.id.id || m.id._serialized || m.id);
  const isFromMe = Boolean(m.id.fromMe);
  const epochSec = Number(m.t || Math.floor(Date.now() / 1000));
  const timestampIso = new Date(epochSec * 1000).toISOString();
  const dateObj = new Date(epochSec * 1000);
  const displayTime = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Participant resolution
  const participantJid = m.author ? String(m.author._serialized || m.author) : (m.sender ? String(m.sender._serialized || m.sender) : undefined);
  const participantLid = participantJid ? participantJid.split('@')[0] : '';
  const memberLabel = participantLid ? memberLabelsMap[participantLid] : undefined;

  let displayName = isFromMe ? 'You' : undefined;
  if (!isFromMe) {
    displayName = m.senderObj?.formattedName || m.senderObj?.name || m.author?.toString() || activeChat?.formattedTitle || 'Contact';
  }

  const sender: MessageSender = {
    jid: participantJid,
    displayName,
    memberLabel,
    colorIndex: Math.abs(hashCode(participantJid || displayName || '1')) % 8,
  };

  // Reactions
  let reactions: MessageReaction[] | undefined;
  try {
    const ReactionsCollection = getCollection('WAWebReactionsCollection')?.ReactionsCollection;
    const rModel = ReactionsCollection?.get ? ReactionsCollection.get(stanzaId) : null;
    const rawReactions = rModel?.__x_reactions || m.reactions;
    if (rawReactions && Array.isArray(rawReactions) && rawReactions.length > 0) {
      reactions = rawReactions.map((r: any) => ({
        emoji: String(r.aggregateEmoji || r.emoji || ''),
        senderJid: r.sender ? String(r.sender) : undefined,
        senderName: r.senderName ? String(r.senderName) : undefined,
      }));
    }
  } catch (e) {}

  // Quoted Reply Context
  let replyContext: QuotedReplyContext | undefined;
  if (m.quotedMsg || m.quotedStanzaID) {
    const qSender = m.quotedParticipant ? (m.quotedParticipant.fromMe ? 'You' : String(m.quotedParticipant)) : 'Reply';
    replyContext = {
      id: m.quotedStanzaID ? String(m.quotedStanzaID) : undefined,
      sender: { displayName: qSender },
      textSnippet: typeof m.quotedMsg?.body === 'string' ? m.quotedMsg.body.slice(0, 150) : undefined,
    };
  }

  // Content Variant
  const msgType = String(m.type || 'chat');
  let content: MessageContent;

  if (msgType === 'chat') {
    content = {
      type: 'text',
      body: String(m.body || ''),
    };
  } else if (msgType === 'image') {
    content = {
      type: 'image',
      caption: m.caption ? String(m.caption) : undefined,
      mediaRef: '',
      mimeType: String(m.mimetype || 'image/jpeg'),
      thumbnailDataUri: typeof m.body === 'string' && m.body.startsWith('data:') ? m.body : undefined,
    };
  } else if (msgType === 'video') {
    content = {
      type: 'video',
      caption: m.caption ? String(m.caption) : undefined,
      mediaRef: '',
      mimeType: String(m.mimetype || 'video/mp4'),
      durationSeconds: Number(m.duration || 0),
      thumbnailDataUri: typeof m.body === 'string' && m.body.startsWith('data:') ? m.body : undefined,
      isGif: Boolean(m.isGif),
    };
  } else if (msgType === 'audio' || msgType === 'ptt') {
    content = {
      type: 'audio',
      isVoiceNote: msgType === 'ptt' || Boolean(m.isVoiceNote),
      mediaRef: '',
      mimeType: String(m.mimetype || 'audio/ogg'),
      durationSeconds: Number(m.duration || 0),
      waveform: Array.isArray(m.waveform) ? m.waveform : undefined,
    };
  } else if (msgType === 'document') {
    content = {
      type: 'document',
      fileName: String(m.filename || 'Document'),
      fileSize: Number(m.size || 0),
      fileSizeBytesText: formatBytes(Number(m.size || 0)),
      mimeType: String(m.mimetype || 'application/octet-stream'),
      mediaRef: '',
    };
  } else if (msgType === 'sticker') {
    content = {
      type: 'sticker',
      mediaRef: '',
      isAnimated: Boolean(m.isAnimated),
      mimeType: String(m.mimetype || 'image/webp'),
    };
  } else if (msgType === 'poll_creation') {
    content = {
      type: 'poll',
      question: String(m.pollName || m.body || 'Poll'),
      allowMultipleAnswers: Number(m.pollSelectableOptionsCount || 1) > 1,
      options: Array.isArray(m.pollOptions)
        ? m.pollOptions.map((opt: any) => ({
            id: String(opt.localId || opt.name),
            title: String(opt.name || ''),
            votesCount: Number(opt.voteCount || 0),
          }))
        : [],
    };
  } else if (msgType === 'event_creation') {
    content = {
      type: 'event',
      name: String(m.__x_eventName || m.eventName || 'Event'),
      startTime: m.eventStartTime ? new Date(m.eventStartTime * 1000).toISOString() : undefined,
      location: m.eventLocation ? String(m.eventLocation) : undefined,
      isCanceled: Boolean(m.isCanceled),
    };
  } else if (msgType === 'call_log') {
    content = {
      type: 'call_log',
      isVideoCall: Boolean(m.isVideoCall),
      callDurationSeconds: m.callDuration !== undefined && m.callDuration !== null ? Number(m.callDuration) : null,
      callCreatorJid: m.callCreator ? String(m.callCreator) : undefined,
    };
  } else {
    content = {
      type: 'unsupported',
      fallbackText: typeof m.body === 'string' ? m.body : `[${msgType}]`,
    };
  }

  // Forwarded Flags
  let isForwarded = false;
  let isForwardedManyTimes = false;
  try {
    const FrontendGetters = getCollection('WAWebFrontendMsgGetters');
    const MsgGetters = getCollection('WAWebMsgGetters');
    if (FrontendGetters && typeof FrontendGetters.getShouldShowForwarded === 'function') {
      isForwarded = Boolean(FrontendGetters.getShouldShowForwarded(m));
    }
    if (MsgGetters && typeof MsgGetters.getIsFrequentlyForwarded === 'function') {
      isForwardedManyTimes = Boolean(MsgGetters.getIsFrequentlyForwarded(m));
    }
  } catch (e) {}

  return {
    type: 'message',
    id: stanzaId,
    timestamp: timestampIso,
    displayTime,
    direction: isFromMe ? 'outgoing' : 'incoming',
    sender,
    flags: {
      isForwarded,
      isForwardedManyTimes,
      isStarred: Boolean(m.star),
      isEdited: Boolean(m.isEdited),
      isPinned: Boolean(m.isPinned),
    },
    replyContext,
    content,
    reactions,
  };
}

/**
 * Finds and harvests all loaded and unmounted messages by scrolling the virtualized timeline.
 */
async function scrollAndHarvestMessages(
  activeChat: any,
  timeframeBoundary: string | null,
  exportId: string,
  onProgress: (harvestedCount: number, oldestIso: string) => void
): Promise<MessageEntry[]> {
  const memberLabelsMap = activeChat.isGroup ? getMemberLabelsMap(String(activeChat.id)) : {};
  const entriesMap = new Map<string, MessageEntry>();

  const harvestModels = () => {
    if (!activeChat.msgs) return;
    const models = activeChat.msgs.getModelsArray ? activeChat.msgs.getModelsArray() : [];
    for (const m of models) {
      const entry = extractMessageEntry(m, activeChat, memberLabelsMap);
      if (entry && !entriesMap.has(entry.id)) {
        entriesMap.set(entry.id, entry);
      }
    }
  };

  // Initial harvest from already-loaded models
  harvestModels();

  const scrollContainer = document.querySelector<HTMLElement>(
    'div[data-testid="conversation-panel-messages"], .copyable-area [tabindex="0"]'
  );

  let consecutiveNoNewMessages = 0;
  let previousCount = entriesMap.size;

  while (true) {
    // Check if user requested abort
    const isAborted = await window.__walinux_ipc?.isChatExportAborted?.(exportId);
    if (isAborted) {
      break;
    }

    // Check if oldest message is older than requested timeframe
    let oldestDateIso: string = new Date().toISOString();
    let oldestEpoch = Infinity;
    for (const e of entriesMap.values()) {
      if (e.timestamp) {
        const ep = new Date(e.timestamp).getTime();
        if (ep < oldestEpoch) {
          oldestEpoch = ep;
          oldestDateIso = e.timestamp;
        }
      }
    }

    onProgress(entriesMap.size, oldestDateIso);

    if (timeframeBoundary && oldestEpoch <= new Date(timeframeBoundary).getTime()) {
      // Reached or passed the requested boundary
      break;
    }

    if (!scrollContainer) {
      break;
    }

    // Scroll up
    scrollContainer.scrollTop = 0;
    await sleep(140);

    // Click "get older messages from phone" if present
    const phoneSyncBtn = scrollContainer.querySelector<HTMLButtonElement>(
      'button:not([disabled]) div div'
    );
    if (phoneSyncBtn && phoneSyncBtn.textContent?.includes('get older messages from your phone')) {
      const btn = phoneSyncBtn.closest('button');
      if (btn) {
        btn.click();
        await sleep(1500); // Give peer sync request time to dispatch
      }
    }

    harvestModels();

    if (entriesMap.size === previousCount) {
      consecutiveNoNewMessages++;
      if (consecutiveNoNewMessages >= 12) {
        // Reached the absolute top of available history
        break;
      }
    } else {
      consecutiveNoNewMessages = 0;
      previousCount = entriesMap.size;
    }
  }

  // Filter messages after the timeframe boundary if boundary was specified
  let results = Array.from(entriesMap.values());
  if (timeframeBoundary) {
    const boundaryMs = new Date(timeframeBoundary).getTime();
    results = results.filter((e) => (e.timestamp ? new Date(e.timestamp).getTime() >= boundaryMs : true));
  }

  // Sort chronologically ascending
  results.sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return ta - tb;
  });

  return results;
}

/**
 * Downloads binary media attachments and saves them via main process IPC.
 */
async function downloadAndAttachMedia(
  entries: MessageEntry[],
  outputDirectory: string,
  filesDirName: string,
  exportId: string,
  onMediaSaved: (count: number) => void
): Promise<void> {
  let savedCount = 0;

  for (const entry of entries) {
    const isAborted = await window.__walinux_ipc?.isChatExportAborted?.(exportId);
    if (isAborted) break;

    const content = entry.content;
    if (
      content.type !== 'image' &&
      content.type !== 'video' &&
      content.type !== 'audio' &&
      content.type !== 'document' &&
      content.type !== 'sticker'
    ) {
      continue;
    }

    const stanzaId = entry.id;
    let ext = 'bin';
    if (content.type === 'image') ext = 'jpeg';
    else if (content.type === 'video') ext = 'mp4';
    else if (content.type === 'audio') ext = (content as AudioContent).isVoiceNote ? 'ogg' : 'mp3';
    else if (content.type === 'sticker') ext = 'webp';
    else if (content.type === 'document') {
      const match = (content as DocumentContent).fileName?.match(/\.([a-zA-Z0-9]+)$/);
      ext = match ? match[1].toLowerCase() : 'bin';
    }

    const subPath = `media/${stanzaId}.${ext}`;

    // Look for live blob in DOM
    const el = document.querySelector(`[data-id*="${stanzaId}"]`);
    const mediaEl = el?.querySelector('img, video, audio') as HTMLMediaElement | HTMLImageElement | null;
    const blobUrl = mediaEl?.src?.startsWith('blob:') ? mediaEl.src : undefined;

    if (blobUrl) {
      try {
        const resp = await fetch(blobUrl);
        const arrayBuf = await resp.arrayBuffer();
        if (arrayBuf.byteLength > 0 && window.__walinux_ipc?.saveChatMedia) {
          const relativeSavedRef = await window.__walinux_ipc.saveChatMedia(
            outputDirectory,
            filesDirName,
            subPath,
            arrayBuf
          );
          (content as any).mediaRef = relativeSavedRef;
          savedCount++;
          onMediaSaved(savedCount);
          continue;
        }
      } catch (err) {
        console.warn(`[walinux-exporter] Blob fetch failed for ${stanzaId}:`, err);
      }
    }

    // Fallback: If blob not directly available in DOM, mark as expired or retain thumbnail
    if ((content as any).thumbnailDataUri) {
      (content as any).mediaRef = (content as any).thumbnailDataUri;
    } else {
      (content as any).isExpired = true;
    }
  }
}

/**
 * Interleaves DateDividerEntry objects into the chronological timeline.
 */
function interleaveDateDividers(messages: MessageEntry[]): TimelineEntry[] {
  const timeline: TimelineEntry[] = [];
  let lastDateKey = '';

  for (const msg of messages) {
    if (msg.timestamp) {
      const dateKey = msg.timestamp.slice(0, 10); // YYYY-MM-DD
      if (dateKey !== lastDateKey) {
        lastDateKey = dateKey;
        const dateObj = new Date(msg.timestamp);
        const displayText = dateObj.toLocaleDateString(undefined, {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });

        timeline.push({
          type: 'date_divider',
          id: `date-${dateKey}`,
          date: dateKey,
          displayText,
        });
      }
    }
    timeline.push(msg);
  }

  return timeline;
}

/**
 * Executes an export run for a single chat.
 */
export async function runSingleChatExport(
  options: ChatExportOptions,
  exportId: string,
  chatIndex: number = 0,
  totalChats: number = 1
): Promise<{ success: boolean; messagesCount: number; mediaCount: number; error?: string }> {
  try {
    // 1. Register job
    await window.__walinux_ipc?.registerChatExportJob?.(exportId, options, totalChats, chatIndex);

    // 2. Open chat
    const opened = await openChatByJid(options.chatJid, options.chatTitle);
    if (!opened) {
      throw new Error(`Failed to open chat: ${options.chatTitle || options.chatJid}`);
    }

    const ChatCollection = getCollection('WAWebChatCollection')?.ChatCollection;
    const activeChat = ChatCollection?.getActive ? ChatCollection.getActive() : null;
    if (!activeChat) {
      throw new Error('Active chat could not be retrieved from WhatsApp Web models.');
    }

    // 3. Harvest messages
    await window.__walinux_ipc?.updateChatExportProgress?.(exportId, {
      status: 'scrolling',
    });

    const messages = await scrollAndHarvestMessages(
      activeChat,
      options.timeframeBoundary,
      exportId,
      (count, oldestIso) => {
        window.__walinux_ipc?.updateChatExportProgress?.(exportId, {
          messagesExported: count,
          oldestMessageDate: oldestIso,
        });
      }
    );

    // 4. Download media attachments
    const safeTitle = (activeChat.formattedTitle || activeChat.name || 'Chat').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
    const filesDirName = `${safeTitle}_files`;

    await window.__walinux_ipc?.updateChatExportProgress?.(exportId, {
      status: 'downloading_media',
    });

    let mediaSavedCount = 0;
    await downloadAndAttachMedia(messages, options.outputDirectory, filesDirName, exportId, (count) => {
      mediaSavedCount = count;
      window.__walinux_ipc?.updateChatExportProgress?.(exportId, {
        mediaFilesSaved: count,
      });
    });

    // 5. Interleave date dividers
    const timeline = interleaveDateDividers(messages);

    // 6. Check abort status
    const isAborted = Boolean(await window.__walinux_ipc?.isChatExportAborted?.(exportId));

    // 7. Build envelope
    const envelope: WhatsAppChatExport = {
      schemaVersion: '1.0.0',
      exportedAt: new Date().toISOString(),
      exporter: {
        app: 'WAllie',
        version: '1.1.0',
      },
      chat: {
        jid: String(activeChat.id?._serialized || activeChat.id),
        name: String(activeChat.formattedTitle || activeChat.name || 'WhatsApp Chat'),
        type: activeChat.isGroup ? 'group' : (activeChat.isBroadcast ? 'broadcast' : 'direct'),
        groupMetadata: activeChat.isGroup
          ? {
              description: activeChat.groupMetadata?.desc ? String(activeChat.groupMetadata.desc) : undefined,
              participantsCount: activeChat.groupMetadata?.participants?.length || undefined,
            }
          : undefined,
      },
      exportRange: {
        requestedLimitTimestamp: options.timeframeBoundary,
        oldestMessageTimestamp: messages[0]?.timestamp || new Date().toISOString(),
        newestMessageTimestamp: messages[messages.length - 1]?.timestamp || new Date().toISOString(),
        totalMessagesCount: messages.length,
        completed: !isAborted,
      },
      timeline,
    };

    // 8. Finalize files
    await window.__walinux_ipc?.updateChatExportProgress?.(exportId, {
      status: 'saving',
    });

    await window.__walinux_ipc?.finalizeChatExport?.(
      options.outputDirectory,
      envelope,
      options.includeViewer ?? true
    );

    await window.__walinux_ipc?.completeChatExportJob?.(exportId);

    return {
      success: true,
      messagesCount: messages.length,
      mediaCount: mediaSavedCount,
    };
  } catch (err) {
    console.error('[walinux-exporter] Export failed:', err);
    await window.__walinux_ipc?.updateChatExportProgress?.(exportId, {
      status: 'failed',
      error: (err as Error).message,
    });
    await window.__walinux_ipc?.completeChatExportJob?.(exportId);
    return {
      success: false,
      messagesCount: 0,
      mediaCount: 0,
      error: (err as Error).message,
    };
  }
}

/**
 * Initializes the Chat Exporter module in WhatsApp Web Main World.
 */
export function initChatExporter(): void {
  // Expose global helper interface on window
  (window as any).__wallie_chat_exporter = {
    getAvailableChats,
    getActiveChatInfo,
    openChatByJid,
    runSingleChatExport,
  };

  // Listen for export requests dispatched via window.postMessage
  window.addEventListener('message', async (event) => {
    if (!event.data || typeof event.data !== 'object') return;

    if (event.data.type === 'WALLIE_START_SINGLE_EXPORT') {
      const { options, exportId } = event.data;
      const res = await runSingleChatExport(options, exportId, 0, 1);
      window.postMessage({ type: 'WALLIE_EXPORT_COMPLETED', exportId, result: res }, '*');
    }

    if (event.data.type === 'WALLIE_START_MULTI_EXPORT') {
      const { chats, outputDirectory, includeViewer, timeframeBoundary, exportId } = event.data;
      const results = [];

      for (let i = 0; i < chats.length; i++) {
        const isAborted = await window.__walinux_ipc?.isChatExportAborted?.(exportId);
        if (isAborted) break;

        const chat = chats[i];
        const res = await runSingleChatExport(
          {
            accountId: '',
            chatJid: chat.jid,
            chatTitle: chat.title,
            outputDirectory,
            includeViewer,
            timeframeBoundary,
          },
          exportId,
          i,
          chats.length
        );
        results.push(res);
      }

      window.postMessage({ type: 'WALLIE_MULTI_EXPORT_COMPLETED', exportId, results }, '*');
    }
  });
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

