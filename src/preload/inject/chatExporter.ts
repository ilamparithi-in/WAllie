import './types';
import {
  getSearchBox,
  setSearchText,
  getSearchText,
  restoreSearchBox,
  findMatchingRow,
  clickChatRow,
  isChatOpen,
} from './chatNavigation';
import type {
  WhatsAppChatExport,
  ChatMetadata,
  TimelineEntry,
  DateDividerEntry,
  SystemNotificationEntry,
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
    const mainEl = document.querySelector<HTMLElement>('#main');
    if (!mainEl) return null; // If #main is not in DOM, no chat conversation is open!

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
  const safeTitle = targetTitle || (targetChat ? targetChat.formattedTitle || targetChat.name : '');
  const targetNorm = norm(safeTitle);

  // 1. Instant programmatic switch via WhatsApp's Cmd module
  if (targetChat) {
    try {
      const Cmd = getCollection('WAWebCmd')?.Cmd;
      if (Cmd?.openChatBottom) {
        Cmd.openChatBottom({ chat: targetChat });
        await sleep(250);
        const check = getActiveChatInfo();
        if (check && (check.jid === targetJid || check.title === safeTitle)) {
          return true;
        }
      }
      if (Cmd?.openChatFromUnread) {
        Cmd.openChatFromUnread({ chat: targetChat });
        await sleep(250);
        const check = getActiveChatInfo();
        if (check && (check.jid === targetJid || check.title === safeTitle)) {
          return true;
        }
      }
    } catch (e) { }
  }

  // 2. Fast check if already open by title
  if (targetNorm && isChatOpen(targetNorm)) {
    return true;
  }

  // 3. Look for visible row in sidebar directly
  if (targetNorm) {
    const row = findMatchingRow(targetNorm);
    if (row) {
      clickChatRow(row);
      await sleep(300);
      if (isChatOpen(targetNorm)) return true;
    }
  }

  // 4. Search box mechanism (identical to notification opening)
  if (safeTitle) {
    const sbox = getSearchBox();
    if (sbox) {
      const prevSearch = getSearchText(sbox);
      setSearchText(sbox, safeTitle);
      await sleep(350);

      for (let i = 0; i < 25; i++) {
        await sleep(100);
        const matchRow = findMatchingRow(targetNorm);
        if (matchRow) {
          clickChatRow(matchRow);
          // Wait for chat to open before restoring search box
          for (let j = 0; j < 20; j++) {
            await sleep(100);
            if (isChatOpen(targetNorm)) break;
          }
          await sleep(150);
          restoreSearchBox(sbox, prevSearch);
          break;
        }
      }
    }
  }

  // Verify switch
  for (let i = 0; i < 25; i++) {
    const active = getActiveChatInfo();
    if (active && (active.jid === targetJid || (targetNorm && isChatOpen(targetNorm)))) {
      return true;
    }
    await sleep(150);
  }

  return false;
}

/**
 * Safely dismisses any open WhatsApp Web context menu or backdrop without sending
 * a global Escape keyboard event to document, which would close the active chat conversation.
 */
function dismissContextMenuSafely(): void {
  try {
    const backdrop = document.querySelector('[data-testid="menu-backdrop"]') as HTMLElement | null;
    if (backdrop) {
      backdrop.click();
      return;
    }
    const contextMenu = document.querySelector('div[data-animate-context-menu="true"], ul[role="menu"]');
    if (contextMenu) {
      contextMenu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: false, cancelable: true }));
    }
  } catch { }
}

/**
 * Ensures the target chat remains active in the viewport. If WhatsApp Web navigated away
 * or dropped to the default landing screen ("Voice and video calling is now available"),
 * this automatically restores and re-opens the target chat.
 */
async function ensureChatOpen(chatJid: string, chatTitle?: string): Promise<boolean> {
  try {
    const current = getActiveChatInfo();
    if (current && current.jid === chatJid) {
      return true;
    }
    console.log(`[walinux-exporter] Target chat ${chatJid} is not open (current: ${current?.jid}). Re-opening...`);
    return await openChatByJid(chatJid, chatTitle);
  } catch (err) {
    console.warn('[walinux-exporter] Failed to ensure chat open:', err);
    return false;
  }
}

/**
 * Dispatches trusted native mouse clicks or clean pointer/mouse event lifecycle
 * to guarantee that interactive WhatsApp Web components (like circular download buttons)
 * receive and process the click without double-toggling or spamming.
 */
async function clickElementThoroughly(el: HTMLElement): Promise<void> {
  try {
    el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    await sleep(40);
    const rect = el.getBoundingClientRect();
    const cx = Math.floor(rect.left + rect.width / 2);
    const cy = Math.floor(rect.top + rect.height / 2);

    if (
      window.__walinux_ipc?.dispatchMouse &&
      cx > 0 &&
      cy > 0 &&
      cx < window.innerWidth &&
      cy < window.innerHeight
    ) {
      const ok = await window.__walinux_ipc.dispatchMouse('click', cx, cy);
      if (ok) return; // Native click successfully delivered to Chromium; do not dispatch duplicate synthetic clicks!
    }

    const mouseOpts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };
    el.dispatchEvent(new PointerEvent('pointerdown', mouseOpts));
    el.dispatchEvent(new PointerEvent('pointerup', mouseOpts));
    el.dispatchEvent(new MouseEvent('click', mouseOpts));
    if (typeof el.click === 'function') {
      try { el.click(); } catch { }
    }
  } catch (e) {
    try { el.click(); } catch { }
  }
}

/**
 * Extracts binary ArrayBuffer from a media DOM element (img, video, audio)
 * supporting blob: URLs, https: CDN URLs, and data: URIs (e.g. data:image/webp).
 */
async function extractBufferFromMediaElement(el: HTMLMediaElement | HTMLImageElement): Promise<ArrayBuffer | null> {
  if (!el || !el.src) return null;
  const src = el.src;
  if (src.includes('data:image/gif')) return null;

  if (src.startsWith('blob:') || src.startsWith('https://')) {
    try {
      const resp = await fetch(src);
      return await resp.arrayBuffer();
    } catch { }
  } else if (src.startsWith('data:')) {
    try {
      const commaIdx = src.indexOf(',');
      if (commaIdx !== -1) {
        const base64 = src.slice(commaIdx + 1);
        const binStr = atob(base64);
        const bytes = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
        return bytes.buffer;
      }
    } catch { }
  }
  return null;
}

/**
 * Resolves a raw JID, LID, or phone number to a friendly contact formatted name.
 */
function resolveContactName(jidOrLid: any): string {
  if (!jidOrLid) return '';
  const s = typeof jidOrLid === 'object' ? String(jidOrLid._serialized || jidOrLid.user || jidOrLid) : String(jidOrLid);
  const clean = s.split('@')[0];
  try {
    const ContactCollection = getCollection('WAWebContactCollection')?.ContactCollection;
    let c = ContactCollection?.get
      ? (ContactCollection.get(s) ||
        ContactCollection.get(`${clean}@c.us`) ||
        ContactCollection.get(`${clean}@s.whatsapp.net`) ||
        ContactCollection.get(`${clean}@lid`))
      : null;

    if (!c && ContactCollection?.getModelsArray) {
      const models = ContactCollection.getModelsArray();
      c = models.find((x: any) =>
        x.id?._serialized === s ||
        x.lid?._serialized === s ||
        x.id?.user === clean ||
        x.lid?.user === clean
      );
    }

    if (c) {
      const name = c.formattedName || c.name || c.displayName || c.pushname || c.shortName;
      if (name) return String(name);
    }
  } catch (err) { }
  return clean || s;
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
  } catch (err) { }
  return map;
}

/**
 * Extracts a single MessageEntry from a WhatsApp message model.
 */
function extractMessageEntry(
  m: any,
  activeChat: any,
  memberLabelsMap: Record<string, string>
): MessageEntry | SystemNotificationEntry | null {
  if (!m || !m.id) return null;

  const msgType = String(m.type || 'chat');
  // Skip synthetic album containers (individual album images exist as separate image models in activeChat.msgs)
  if (msgType === 'album') return null;

  const stanzaId = String(m.id.id || m.id._serialized || m.id);
  const serializedId = String(m.id._serialized || m.id || stanzaId);
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
    const resolvedSender = resolveContactName(participantJid);
    displayName = m.senderObj?.formattedName || m.senderObj?.name || resolvedSender || activeChat?.formattedTitle || 'Contact';
  }

  // Handle System Events & Notifications (gp2, e2e_notification, group description change, etc.)
  if (m.isNotification || msgType === 'gp2' || msgType === 'notification_template' || msgType === 'e2e_notification') {
    const subtype = String(m.subtype || '');
    let sysSubtype: SystemNotificationEntry['subtype'] = 'generic';
    let sysText = typeof m.body === 'string' && m.body ? m.body : '';

    if (subtype === 'description' || sysText.toLowerCase().includes('group description')) {
      sysSubtype = 'group_description_change';
      if (!sysText) {
        sysText = isFromMe ? 'You changed the group description.' : `${displayName || 'Someone'} changed the group description.`;
      }
    } else if (subtype === 'add') {
      sysSubtype = 'participant_joined';
      if (!sysText) sysText = `${displayName || 'A participant'} was added to the group.`;
    } else if (subtype === 'remove' || subtype === 'leave') {
      sysSubtype = 'participant_left';
      if (!sysText) sysText = `${displayName || 'A participant'} left the group.`;
    } else if (subtype === 'ephemeral' || subtype === 'disappearing') {
      sysSubtype = 'disappearing_timer_change';
      if (!sysText) sysText = 'Disappearing messages timer was updated.';
    } else if (msgType === 'e2e_notification' || subtype === 'e2e') {
      sysSubtype = 'e2e_encryption';
      if (!sysText) sysText = 'Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.';
    } else if (!sysText) {
      sysText = String(m.caption || m.body || 'Group update');
    }

    return {
      type: 'system_event',
      id: stanzaId,
      timestamp: timestampIso,
      subtype: sysSubtype,
      text: sysText.replace(/<\/?span[^>]*>/g, '').replace(/View$/i, '').trim(),
    };
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
    const rModel = ReactionsCollection?.get ? (ReactionsCollection.get(m.id) || ReactionsCollection.get(m.id?._serialized) || ReactionsCollection.get(stanzaId)) : null;
    let rList: any[] = [];
    if (rModel && rModel.reactions) {
      if (typeof rModel.reactions.getModelsArray === 'function') {
        rList = rModel.reactions.getModelsArray();
      } else if (Array.isArray(rModel.reactions)) {
        rList = rModel.reactions;
      }
    } else if (m.reactions) {
      if (typeof m.reactions.getModelsArray === 'function') {
        rList = m.reactions.getModelsArray();
      } else if (Array.isArray(m.reactions)) {
        rList = m.reactions;
      }
    }

    if (rList && rList.length > 0) {
      reactions = rList.map((r: any) => {
        const emoji = String(r.aggregateEmoji || r.reactionText || r.emoji || '');
        const count = r.senders?.getModelsArray ? r.senders.getModelsArray().length : (Array.isArray(r.senders) ? r.senders.length : (typeof r.count === 'number' ? r.count : 1));
        return {
          emoji,
          count: count > 0 ? count : 1,
          senderJid: r.sender ? String(r.sender) : undefined,
          senderName: r.senderName || (r.sender ? resolveContactName(r.sender) : undefined),
        };
      }).filter((r) => Boolean(r.emoji));
      if (reactions.length === 0) reactions = undefined;
    }
  } catch (e) { }

    // Quoted Reply Context
    let replyContext: QuotedReplyContext | undefined;
    if (m.quotedMsg || m.quotedStanzaID) {
      let qSender = 'Reply';
      if (m.quotedParticipant) {
        if (m.quotedParticipant.fromMe) {
          qSender = 'You';
        } else {
          qSender = resolveContactName(m.quotedParticipant) || 'Contact';
        }
      }
      let snippet = typeof m.quotedMsg?.body === 'string' ? m.quotedMsg.body.slice(0, 150) : undefined;
      if (snippet && (snippet.startsWith('/9j/') || snippet.startsWith('data:') || /^[A-Za-z0-9+/=]{40,}$/.test(snippet.trim()))) {
        snippet = m.quotedMsg?.caption || 'Photo';
      }
      replyContext = {
        id: m.quotedStanzaID ? String(m.quotedStanzaID) : undefined,
        sender: { displayName: qSender },
        textSnippet: snippet,
      };
    }

    // Resolve thumbnail data URI (WhatsApp stores raw Base64 in m.body or m.mediaData.preview for media messages)
    let rawThumbnailUri: string | undefined;
    if (typeof m.body === 'string' && m.body.length > 30 && (m.body.startsWith('data:') || m.body.startsWith('/9j/'))) {
      rawThumbnailUri = m.body.startsWith('data:')
        ? m.body
        : `data:${m.mimetype || 'image/jpeg'};base64,${m.body}`;
    } else if (typeof m.mediaData?.preview === 'string' && m.mediaData.preview.length > 30) {
      rawThumbnailUri = m.mediaData.preview.startsWith('data:')
        ? m.mediaData.preview
        : `data:${m.mimetype || 'image/jpeg'};base64,${m.mediaData.preview}`;
    }

    // Mention Resolution in Text & Captions
    const resolveMentions = (text: string): string => {
      if (!text || !Array.isArray(m.mentionedJidList) || m.mentionedJidList.length === 0) return text;
      let resolvedText = text;
      for (const item of m.mentionedJidList) {
        const rawJid = typeof item === 'object' ? String(item._serialized || item.user || item) : String(item);
        const user = rawJid.split('@')[0];
        const resolved = resolveContactName(rawJid);
        if (resolved && user) {
          const cleanResolved = resolved.startsWith('@') ? resolved.slice(1) : resolved;
          resolvedText = resolvedText.replaceAll(`@${user}`, `@${cleanResolved}`);
        }
      }
      return resolvedText;
    };

    let content: MessageContent;
    if (msgType === 'chat') {
      content = {
        type: 'text',
        body: resolveMentions(String(m.body || '')),
      };
    } else if (msgType === 'image') {
      content = {
        type: 'image',
        caption: m.caption ? resolveMentions(String(m.caption)) : undefined,
        mediaRef: '',
        mimeType: String(m.mimetype || 'image/jpeg'),
        thumbnailDataUri: rawThumbnailUri,
      };
    } else if (msgType === 'video') {
      content = {
        type: 'video',
        caption: m.caption ? resolveMentions(String(m.caption)) : undefined,
        mediaRef: '',
        mimeType: String(m.mimetype || 'video/mp4'),
        durationSeconds: Number(m.duration || 0),
        thumbnailDataUri: rawThumbnailUri,
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
    } catch (e) { }

    return {
      type: 'message',
      id: stanzaId,
      serializedId,
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
 * Renders or updates the floating in-viewport progress HUD inside the WhatsApp DOM.
 * Semi-transparent dark background without blur so the chat DOM remains visible underneath.
 */
/**
 * Cache last known oldest message date across all HUD updates
 */
let lastKnownOldestDate: string = '';
let isCurrentJobAborted: boolean = false;

  /**
   * Renders or updates the floating HUD overlay in the top-center of the screen.
   * Semi-transparent dark background without blur so the chat DOM remains visible underneath.
   * Movable / draggable modal by header with word-wrapped log text (no truncation ellipses).
   */
  function showOrUpdateExportHUD(state: {
    title: string;
    index: number;
    total: number;
    statusText: string;
    msgCount: number;
    mediaCount: number;
    totalMedia?: number;
    skippedCount?: number;
    oldestDate?: string;
    exportId: string;
    canSkip?: boolean;
    onSkip?: () => void;
    skipLabel?: string;
  }): void {
    if (state.oldestDate) {
      lastKnownOldestDate = state.oldestDate;
    }

    let overlay = document.getElementById('wallie-export-hud-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'wallie-export-hud-overlay';
      overlay.setAttribute(
        'style',
        'position: fixed; inset: 0; z-index: 2147483640; pointer-events: none; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #e9edef; user-select: none;'
      );
      overlay.innerHTML = `
      <style>
        #wallie-export-hud-overlay,
        #wallie-export-hud-overlay *,
        #wallie-export-card button {
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        }
        @keyframes wallie-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .wallie-hud-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(0, 168, 132, 0.25);
          border-top-color: #00a884;
          border-radius: 50%;
          animation: wallie-spin 0.8s linear infinite;
          flex-shrink: 0;
        }
      </style>
      <div id="wallie-export-card" style="position: fixed; top: 72px; left: calc(50% - 225px); pointer-events: auto; background: #1f2c34; border: 1px solid #2a3942; border-radius: 14px; box-shadow: 0 16px 40px rgba(0,0,0,0.65); padding: 20px 24px; width: 450px; max-width: 90vw; display: flex; flex-direction: column; gap: 14px;">
        <div id="wallie-hud-header" style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #2a3942; padding-bottom: 10px; cursor: grab; user-select: none;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 600; font-size: 13px; color: #00a884;">WAllie Chat Exporter</span>
            <span style="font-size: 10px; color: #8696a0;">(drag to reposition)</span>
          </div>
          <span id="wallie-hud-badge" style="font-size: 11px; background: #111b21; border: 1px solid #2a3942; padding: 2px 8px; border-radius: 12px; color: #8696a0;">Chat 1 of 1</span>
        </div>

        <div>
          <div id="wallie-hud-title" style="font-size: 15px; font-weight: 600; color: #e9edef; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 6px;">Exporting Chat</div>
          <div style="display: flex; align-items: flex-start; gap: 10px; background: #111b21; padding: 10px 12px; border-radius: 8px; border: 1px solid #222d34;">
            <div class="wallie-hud-spinner" style="margin-top: 2px;"></div>
            <span id="wallie-hud-status" style="font-size: 12px; color: #8696a0; word-break: break-word; overflow-wrap: anywhere; white-space: normal; line-height: 1.4; max-height: 80px; overflow-y: auto;">Initializing export...</span>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; background: #111b21; padding: 10px; border-radius: 8px; border: 1px solid #222d34; text-align: center;">
          <div>
            <div style="font-size: 10px; color: #8696a0; text-transform: uppercase; letter-spacing: 0.3px;">Messages</div>
            <div id="wallie-hud-msgs" style="font-size: 16px; font-weight: 700; color: #00a884; margin-top: 2px;">0</div>
          </div>
          <div>
            <div style="font-size: 10px; color: #8696a0; text-transform: uppercase; letter-spacing: 0.3px;">Media Saved</div>
            <div id="wallie-hud-media" style="font-size: 16px; font-weight: 700; color: #53bdeb; margin-top: 2px;">0</div>
          </div>
          <div>
            <div style="font-size: 10px; color: #8696a0; text-transform: uppercase; letter-spacing: 0.3px;">Oldest Date</div>
            <div id="wallie-hud-oldest" style="font-size: 12px; font-weight: 600; color: #e9edef; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">—</div>
          </div>
        </div>

        <!-- Guidance Notices -->
        <div style="background: rgba(0, 168, 132, 0.08); border: 1px solid rgba(0, 168, 132, 0.2); border-radius: 8px; padding: 10px 12px; font-size: 11px; color: #aebac1; line-height: 1.45; display: flex; flex-direction: column; gap: 4px;">
          <div style="color: #00a884; font-weight: 600; font-size: 11px; display: flex; align-items: center; gap: 4px;">
            <span>ℹ️</span> <span>Export Guidance</span>
          </div>
          <div>• Keep the chat open and keep monitoring the exporter.</div>
          <div>• If the exporter does not fetch older messages, you may try it manually.</div>
          <div>• If the exporter misses some media, you may manually download it.</div>
          <div>• Export can be cancelled at any time; if it is frozen on a file just press skip file.</div>
          <div>• Sometimes it may take 2 or more exports for it to be complete.</div>
        </div>

        <div style="display: flex; justify-content: flex-end; align-items: center; gap: 10px; padding-top: 2px;">
          <button id="wallie-hud-skip-btn" style="display: none; background: transparent; border: 1px solid #53bdeb; color: #53bdeb; font-size: 12px; font-weight: 600; padding: 6px 14px; border-radius: 6px; cursor: pointer; transition: background 0.2s;">Skip File</button>
          <button id="wallie-hud-cancel-btn" style="background: transparent; border: 1px solid #ea4335; color: #ea4335; font-size: 12px; font-weight: 600; padding: 6px 14px; border-radius: 6px; cursor: pointer; transition: background 0.2s;">Cancel Export</button>
        </div>
      </div>
    `;
      document.body.appendChild(overlay);

      // Initialize drag repositioning
      const header = document.getElementById('wallie-hud-header');
      const card = document.getElementById('wallie-export-card');
      if (header && card) {
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let initialLeft = 0;
        let initialTop = 0;

        header.addEventListener('mousedown', (e: MouseEvent) => {
          if (e.button !== 0) return;
          isDragging = true;
          startX = e.clientX;
          startY = e.clientY;
          const rect = card.getBoundingClientRect();
          initialLeft = rect.left;
          initialTop = rect.top;
          card.style.left = `${initialLeft}px`;
          card.style.top = `${initialTop}px`;
          header.style.cursor = 'grabbing';
          e.preventDefault();
        });

        window.addEventListener('mousemove', (e: MouseEvent) => {
          if (!isDragging) return;
          const dx = e.clientX - startX;
          const dy = e.clientY - startY;
          const maxLeft = Math.max(10, window.innerWidth - card.offsetWidth - 10);
          const maxTop = Math.max(10, window.innerHeight - card.offsetHeight - 10);
          card.style.left = `${Math.max(10, Math.min(maxLeft, initialLeft + dx))}px`;
          card.style.top = `${Math.max(10, Math.min(maxTop, initialTop + dy))}px`;
        });

        window.addEventListener('mouseup', () => {
          if (isDragging) {
            isDragging = false;
            header.style.cursor = 'grab';
          }
        });
      }
    }

    const titleEl = document.getElementById('wallie-hud-title');
    if (titleEl) titleEl.textContent = state.title;

    const badgeEl = document.getElementById('wallie-hud-badge');
    if (badgeEl) badgeEl.textContent = `Chat ${state.index + 1} of ${state.total}`;

    const statusEl = document.getElementById('wallie-hud-status');
    if (statusEl) statusEl.textContent = state.statusText;

    const msgsEl = document.getElementById('wallie-hud-msgs');
    if (msgsEl) msgsEl.textContent = String(state.msgCount);

    const mediaEl = document.getElementById('wallie-hud-media');
    if (mediaEl) {
      if (typeof state.totalMedia === 'number' && state.totalMedia > 0) {
        const skipSuffix = state.skippedCount && state.skippedCount > 0 ? ` (${state.skippedCount} skipped)` : '';
        mediaEl.textContent = `${state.mediaCount}/${state.totalMedia}${skipSuffix}`;
        mediaEl.title = `${state.mediaCount} saved, ${state.skippedCount || 0} skipped of ${state.totalMedia} total`;
      } else {
        mediaEl.textContent = String(state.mediaCount);
      }
    }

    const oldestEl = document.getElementById('wallie-hud-oldest');
    if (oldestEl) {
      const rawDate = state.oldestDate || lastKnownOldestDate;
      if (rawDate) {
        const d = new Date(rawDate);
        oldestEl.textContent = isNaN(d.getTime())
          ? rawDate.slice(0, 10)
          : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      } else {
        oldestEl.textContent = '—';
      }
    }

    const skipBtn = document.getElementById('wallie-hud-skip-btn') as HTMLButtonElement | null;
    if (skipBtn) {
      if (state.canSkip) {
        skipBtn.style.display = 'inline-block';
        skipBtn.textContent = state.skipLabel || 'Skip File';
        skipBtn.onclick = () => {
          if (state.onSkip) state.onSkip();
        };
      } else {
        skipBtn.style.display = 'none';
        skipBtn.onclick = null;
      }
    }

    const cancelBtn = document.getElementById('wallie-hud-cancel-btn') as HTMLButtonElement | null;
    if (cancelBtn) {
      if (!isCurrentJobAborted) {
        cancelBtn.textContent = 'Cancel Export';
        cancelBtn.disabled = false;
      }
      cancelBtn.onclick = () => {
        isCurrentJobAborted = true;
        cancelBtn.textContent = 'Aborting...';
        cancelBtn.disabled = true;
        window.__walinux_ipc?.stopChatExport?.(state.exportId);
      };
    }
  }

  /**
   * Removes the floating HUD overlay from the DOM.
   */
  function removeExportHUD(): void {
    const overlay = document.getElementById('wallie-export-hud-overlay');
    if (overlay) overlay.remove();
  }

  /**
   * Renders the completion modal directly inside the WhatsApp DOM upon completion or failure.
   * Has standalone buttons per line with "Open Output Folder" and "Open Standalone Viewer in Browser".
   */
  function showExportCompletionModal(summary: {
    status: 'completed' | 'failed' | 'aborted';
    chatTitle: string;
    messagesCount: number;
    mediaCount: number;
    outputDirectory: string;
    htmlPath?: string;
    error?: string;
  }): void {
    removeExportHUD();
    const existingModal = document.getElementById('wallie-export-modal-overlay');
    if (existingModal) existingModal.remove();

    const isSuccess = summary.status === 'completed';
    const isAborted = summary.status === 'aborted';

    const modal = document.createElement('div');
    modal.id = 'wallie-export-modal-overlay';
    modal.setAttribute(
      'style',
      'position: fixed; inset: 0; z-index: 2147483645; display: flex; align-items: center; justify-content: center; background: rgba(11, 20, 26, 0.55); backdrop-filter: none !important; -webkit-backdrop-filter: none !important; pointer-events: auto; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #e9edef; user-select: none; padding: 16px;'
    );

    const iconColor = isSuccess ? '#00a884' : (isAborted ? '#f59e0b' : '#ea4335');
    const iconSymbol = isSuccess ? '✓' : (isAborted ? '⚠' : '✕');
    const titleText = isSuccess ? 'Chat Export Completed' : (isAborted ? 'Export Cancelled' : 'Chat Export Failed');

    modal.innerHTML = `
    <style>
      #wallie-export-modal-overlay,
      #wallie-export-modal-overlay *,
      #wallie-export-modal-overlay button {
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
      }
    </style>
    <div style="background: #1f2c34; border: 1px solid #2a3942; border-radius: 14px; box-shadow: 0 20px 50px rgba(0,0,0,0.7); padding: 24px 28px; width: 480px; max-width: 92vw; display: flex; flex-direction: column; gap: 18px;">
      <div style="display: flex; align-items: center; gap: 14px; border-bottom: 1px solid #2a3942; padding-bottom: 16px;">
        <div style="width: 40px; height: 40px; border-radius: 50%; background: ${iconColor}22; border: 2px solid ${iconColor}; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: bold; color: ${iconColor}; flex-shrink: 0;">
          ${iconSymbol}
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: 17px; font-weight: 700; color: #e9edef;">${titleText}</div>
          <div style="font-size: 13px; color: #8696a0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px;">${summary.chatTitle}</div>
        </div>
      </div>

      ${summary.error ? `
        <div style="background: rgba(234, 67, 53, 0.12); border: 1px solid #ea4335; border-radius: 8px; padding: 12px; color: #ea4335; font-size: 13px; line-height: 1.4;">
          <strong>Error:</strong> ${summary.error}
        </div>
      ` : ''}

      <div style="background: #111b21; border: 1px solid #222d34; border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 10px; font-size: 13px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #8696a0;">Messages Exported:</span>
          <span style="font-weight: 600; color: #00a884;">${summary.messagesCount}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #8696a0;">Media Files Saved:</span>
          <span style="font-weight: 600; color: #53bdeb;">${summary.mediaCount}</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <span style="color: #8696a0;">Output Folder:</span>
          <span style="font-size: 11px; color: #aebac1; word-break: break-all; background: #182229; padding: 6px 8px; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;">${summary.outputDirectory || '—'}</span>
        </div>
      </div>

      <!-- Action buttons in their own line -->
      <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 4px;">
        ${summary.outputDirectory ? `
          <button id="wallie-modal-open-folder-btn" style="background: #00a884; color: #111b21; border: none; font-size: 13px; font-weight: 600; padding: 11px 16px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: opacity 0.2s;">
            📂 Open Output Folder
          </button>
        ` : ''}
        ${summary.htmlPath ? `
          <button id="wallie-modal-open-viewer-btn" style="background: #2a3942; color: #e9edef; border: 1px solid #374248; font-size: 13px; font-weight: 600; padding: 10px 16px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: background 0.2s;">
            🌐 Open Standalone Viewer in Browser
          </button>
        ` : ''}
        <button id="wallie-modal-close-btn" style="background: transparent; color: #8696a0; border: 1px solid #374248; font-size: 13px; font-weight: 500; padding: 9px 16px; border-radius: 8px; cursor: pointer;">
          Close
        </button>
      </div>
    </div>
  `;

    document.body.appendChild(modal);

    const folderBtn = document.getElementById('wallie-modal-open-folder-btn');
    if (folderBtn) {
      folderBtn.onclick = () => {
        window.__walinux_ipc?.showInFolder?.(summary.outputDirectory);
      };
    }

    const viewerBtn = document.getElementById('wallie-modal-open-viewer-btn');
    if (viewerBtn && summary.htmlPath) {
      viewerBtn.onclick = () => {
        window.__walinux_ipc?.openPath?.(summary.htmlPath!);
      };
    }

    const closeBtn = document.getElementById('wallie-modal-close-btn');
    if (closeBtn) {
      closeBtn.onclick = () => {
        modal.remove();
      };
    }
  }

  /**
   * Finds and harvests all loaded and unmounted messages by scrolling the virtualized timeline,
   * while capturing live blob URLs from the DOM as elements pass through the viewport.
   */
  /**
   * Helper to capture live blob URLs and immediately fetch them into ArrayBuffers
   * from rendered DOM rows before WhatsApp Web unmounts and revokes them.
   */
  function captureLiveBlobsFromDom(
    liveBlobs: Map<string, string>,
    capturedBuffers: Map<string, { buffer: ArrayBuffer; mimeType: string }>
  ): void {
    const rows = Array.from(document.querySelectorAll('[data-id]'));
    for (const r of rows) {
      const dataId = r.getAttribute('data-id') || '';
      const parts = dataId.split('_');
      const stanzaId = parts.length >= 3 ? parts[2] : (parts[1] || dataId);
      const mediaEls = Array.from(r.querySelectorAll('img, video, audio')) as (HTMLMediaElement | HTMLImageElement)[];
      for (const mediaEl of mediaEls) {
        if (mediaEl && mediaEl.src && mediaEl.src.startsWith('blob:') && !mediaEl.src.includes('data:image/gif')) {
          const blobUrl = mediaEl.src;
          if (stanzaId && !liveBlobs.has(stanzaId)) {
            liveBlobs.set(stanzaId, blobUrl);
          }
          if (dataId && !liveBlobs.has(dataId)) {
            liveBlobs.set(dataId, blobUrl);
          }
          if (stanzaId && !capturedBuffers.has(stanzaId)) {
            fetch(blobUrl)
              .then(async (resp) => {
                if (resp.ok) {
                  const buf = await resp.arrayBuffer();
                  if (buf.byteLength > 0 && !capturedBuffers.has(stanzaId)) {
                    const mime = mediaEl.tagName === 'IMG' ? 'image/jpeg' : (mediaEl.tagName === 'VIDEO' ? 'video/mp4' : 'audio/ogg');
                    capturedBuffers.set(stanzaId, { buffer: buf, mimeType: mime });
                    capturedBuffers.set(dataId, { buffer: buf, mimeType: mime });
                  }
                }
              })
              .catch(() => { });
          }
        }
      }
    }
  }

  /**
   * Safely resolves the active chat's scroll container element in WhatsApp Web.
   */
  function getConversationScrollContainer(): HTMLElement | null {
    const panel = document.querySelector<HTMLElement>('div[data-testid="conversation-panel-messages"]');
    if (panel && panel.scrollHeight > panel.clientHeight) {
      return panel;
    }
    const main = document.querySelector<HTMLElement>('#main');
    if (main) {
      const divs = Array.from(main.querySelectorAll<HTMLElement>('div'));
      for (const d of divs) {
        try {
          const s = window.getComputedStyle(d);
          if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && d.scrollHeight > d.clientHeight) {
            return d;
          }
        } catch { }
      }
    }
    return panel || null;
  }

  async function scrollAndHarvestMessages(
    activeChat: any,
    timeframeBoundary: string | null,
    exportId: string,
    chatTitle: string,
    chatIndex: number,
    totalChats: number,
    onProgress: (harvestedCount: number, oldestIso: string) => void
  ): Promise<{ messages: (MessageEntry | SystemNotificationEntry)[]; liveBlobs: Map<string, string>; capturedBuffers: Map<string, { buffer: ArrayBuffer; mimeType: string }> }> {
    const isGroupChat = Boolean(
      activeChat.id?.server === 'g.us' ||
      activeChat.groupMetadata != null ||
      activeChat.isGroup === true ||
      (typeof activeChat.isGroup === 'function' && activeChat.isGroup())
    );
    const chatJid = String(activeChat.id?._serialized || activeChat.id || '');
    const memberLabelsMap = isGroupChat ? getMemberLabelsMap(chatJid) : {};
    const entriesMap = new Map<string, MessageEntry | SystemNotificationEntry>();
    const liveBlobs = new Map<string, string>();
    const capturedBuffers = new Map<string, { buffer: ArrayBuffer; mimeType: string }>();

    const harvestModels = () => {
      captureLiveBlobsFromDom(liveBlobs, capturedBuffers);

      // Source A: activeChat.msgs models (current active viewport window)
      if (activeChat.msgs) {
        const models = activeChat.msgs.getModelsArray ? activeChat.msgs.getModelsArray() : (activeChat.msgs._models || []);
        for (const m of models) {
          const entry = extractMessageEntry(m, activeChat, memberLabelsMap);
          if (entry && !entriesMap.has(entry.id)) {
            entriesMap.set(entry.id, entry);
          }
        }
      }

      // Source B: WAWebMsgCollection.MsgCollection.byChat (aggregates full message history for this chat)
      try {
        const MsgCol = getCollection('WAWebMsgCollection')?.MsgCollection;
        if (MsgCol?.byChat && activeChat.id) {
          const byChatView = MsgCol.byChat(activeChat.id);
          const byChatModels = byChatView?._models || (byChatView?.getModelsArray ? byChatView.getModelsArray() : []);
          for (const m of byChatModels) {
            const entry = extractMessageEntry(m, activeChat, memberLabelsMap);
            if (entry && !entriesMap.has(entry.id)) {
              entriesMap.set(entry.id, entry);
            }
          }
        }

        // Source C: MsgCollection global pool filtered by remote JID
        if (MsgCol?.getModelsArray && chatJid) {
          const allModels = MsgCol.getModelsArray();
          for (const m of allModels) {
            const remoteJid = String(m.id?.remote?._serialized || m.id?.remote || '');
            if (remoteJid === chatJid) {
              const entry = extractMessageEntry(m, activeChat, memberLabelsMap);
              if (entry && !entriesMap.has(entry.id)) {
                entriesMap.set(entry.id, entry);
              }
            }
          }
        }
      } catch (e) {
        console.warn('[walinux-exporter] MsgCollection secondary harvest error:', e);
      }

      // Source D: DOM-rendered system notices (e.g. group description changes, security codes)
      const domNotifs = Array.from(document.querySelectorAll('div[data-testid="msg-notification-container"]'));
      for (const dn of domNotifs) {
        const row = dn.closest('div[data-id]');
        const dataId = row?.getAttribute('data-id') || '';
        const text = (dn.textContent || '').replace(/View$/i, '').trim();
        if (dataId && text) {
          const parts = dataId.split('_');
          const stanzaId = parts.length >= 3 ? parts[2] : (parts[1] || dataId);
          if (!entriesMap.has(stanzaId)) {
            const isDesc = text.toLowerCase().includes('group description');
            entriesMap.set(stanzaId, {
              type: 'system_event',
              id: stanzaId,
              timestamp: new Date().toISOString(),
              subtype: isDesc ? 'group_description_change' : 'generic',
              text,
            });
          }
        }
      }
    };

    // Initial harvest from already-loaded models
    harvestModels();

    const scrollContainer = getConversationScrollContainer();

    // Helper to detect if a spinner or active loading state is running inside conversation panel
    const hasConversationSpinner = (): boolean => {
      if (!scrollContainer) return false;
      const mainEl = document.querySelector<HTMLElement>('#main') || scrollContainer;
      const sp =
        scrollContainer.querySelector(
          '[data-testid="loading-spinner"], [data-testid="spinner"], [data-visualcompletion="loading-state"], svg[role="status"], [role="progressbar"], span[data-icon*="progress"]'
        ) ||
        mainEl.querySelector(
          ':scope > [data-testid="loading-spinner"], :scope > [data-testid="spinner"], :scope > [data-visualcompletion="loading-state"], :scope > svg[role="status"], :scope > [role="progressbar"], :scope > span[data-icon*="progress"]'
        );
      const isSpinnerRunning = Boolean(sp && !sp.closest('#wallie-export-hud-overlay'));
      const isModelLoading = Boolean(activeChat.msgs?.msgLoadState?.isLoadingEarlierMsgs);
      return isSpinnerRunning || isModelLoading;
    };

    // Helper to find phone sync button (both initial request and error-retry states)
    const findPhoneSyncButton = (): { element: HTMLElement; isRetry: boolean } | null => {
      const mainEl = document.querySelector<HTMLElement>('#main') || scrollContainer;
      if (!mainEl) return null;

      const allButtons = Array.from(
        mainEl.querySelectorAll('button, div[role="button"], span[role="button"]')
      ).filter((b) => !b.closest('#wallie-export-hud-overlay'));

      for (const b of allButtons) {
        const txt = (b.textContent || '').toLowerCase();
        const isDisabled =
          b.hasAttribute('disabled') ||
          b.getAttribute('aria-disabled') === 'true' ||
          b.classList.contains('disabled');
        if (isDisabled) continue;

        // Retry error button: "Couldn't get older messages. Open WhatsApp on your phone and click here to try again."
        if (
          txt.includes("couldn't get older messages") ||
          txt.includes("could not get older messages") ||
          txt.includes("unable to get older messages") ||
          txt.includes("click here to try again")
        ) {
          return { element: b as HTMLElement, isRetry: true };
        }

        // Initial request button: "Click here to get older messages from your phone."
        if (
          txt.includes('get older messages') ||
          txt.includes('older messages from your phone') ||
          txt.includes('older messages from phone')
        ) {
          return { element: b as HTMLElement, isRetry: false };
        }
      }
      return null;
    };

    let consecutiveNoNewMessages = 0;
    let phoneSyncRetryCount = 0;
    let phoneSyncExhausted = false;
    let previousCount = entriesMap.size;

    while (true) {
      const isAborted = isCurrentJobAborted || (await window.__walinux_ipc?.isChatExportAborted?.(exportId));
      if (isAborted) {
        break;
      }

      await ensureChatOpen(chatJid, chatTitle);

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
      showOrUpdateExportHUD({
        title: chatTitle,
        index: chatIndex,
        total: totalChats,
        statusText: 'Harvesting message history (scrolling up)...',
        msgCount: entriesMap.size,
        mediaCount: 0,
        oldestDate: oldestDateIso,
        exportId,
      });

      if (timeframeBoundary && oldestEpoch <= new Date(timeframeBoundary).getTime()) {
        console.log('[walinux-exporter] Reached requested timeframe boundary:', timeframeBoundary);
        break;
      }

      if (!scrollContainer) {
        break;
      }

      // CRITICAL: Always ensure the real conversation container is scrolled to top first!
      if (scrollContainer.scrollTop > 0) {
        scrollContainer.scrollTop = 0;
        scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
        await sleep(150);
      } else {
        // Nudge scroll slightly to trigger WhatsApp Web's scroll listener
        scrollContainer.scrollTop = 60;
        scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
        await sleep(60);
        scrollContainer.scrollTop = 0;
        scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
      }

      captureLiveBlobsFromDom(liveBlobs, capturedBuffers);
      harvestModels();

      // Helper to check if view shows "couldn't load older messages" error
      const hasCouldNotLoadOlderMessages = (): boolean => {
        const mainEl = document.querySelector<HTMLElement>('#main') || scrollContainer;
        if (!mainEl) return false;
        const txt = (mainEl.innerText || mainEl.textContent || '').toLowerCase();
        return (
          txt.includes("couldn't get older messages") ||
          txt.includes("could not get older messages") ||
          txt.includes("couldn't load older messages") ||
          txt.includes("could not load older messages") ||
          txt.includes("unable to get older messages")
        );
      };

      // 1. Check for phone sync button
      const phoneSync = findPhoneSyncButton();

      if (phoneSync && !phoneSyncExhausted) {
        let skipSyncRequested = false;
        const handleSkipPhoneSync = () => {
          skipSyncRequested = true;
          phoneSyncExhausted = true;
          console.log('[walinux-exporter] User skipped phone sync; continuing with harvested messages.');
        };

        // If WhatsApp view shows the error / retry button
        if (phoneSync.isRetry || hasCouldNotLoadOlderMessages()) {
          phoneSyncRetryCount++;

          // Only skip automatically if:
          // 1. It has retried 3 times,
          // 2. The view shows "couldn't load older messages",
          // 3. AND no new (old) message loaded into view at all (entriesMap.size === previousCount)
          if (phoneSyncRetryCount >= 3 && hasCouldNotLoadOlderMessages() && entriesMap.size === previousCount) {
            console.warn('[walinux-exporter] Retried 3 times, view shows error and no new messages loaded; concluding phone sync.');
            phoneSyncExhausted = true;
            continue;
          }

          // Wait 5 seconds before clicking retry, prompting user to open WhatsApp on their phone
          showOrUpdateExportHUD({
            title: chatTitle,
            index: chatIndex,
            total: totalChats,
            statusText: `Couldn't get older messages from phone. Open WhatsApp on your phone (Retry ${phoneSyncRetryCount}/3 in 5s)...`,
            msgCount: entriesMap.size,
            mediaCount: 0,
            oldestDate: oldestDateIso,
            exportId,
            canSkip: true,
            skipLabel: 'Skip Phone Sync',
            onSkip: handleSkipPhoneSync,
          });

          for (let s = 0; s < 5 && !skipSyncRequested; s++) {
            const aborted = await window.__walinux_ipc?.isChatExportAborted?.(exportId);
            if (aborted) break;
            await sleep(1000);
          }

          if (skipSyncRequested) {
            phoneSyncExhausted = true;
            continue;
          }

          // Click retry
          phoneSync.element.click();
          await sleep(1500);
        } else {
          // Initial request button: click immediately
          showOrUpdateExportHUD({
            title: chatTitle,
            index: chatIndex,
            total: totalChats,
            statusText: 'Requesting older messages from phone... Open WhatsApp on your phone',
            msgCount: entriesMap.size,
            mediaCount: 0,
            oldestDate: oldestDateIso,
            exportId,
            canSkip: true,
            skipLabel: 'Skip Phone Sync',
            onSkip: handleSkipPhoneSync,
          });

          phoneSync.element.click();
          await sleep(1500);
        }

        // Wait until messages load, or error reappears, or user clicks Skip Phone Sync (no hardcoded timeout)
        let waitElapsedSec = 0;
        while (!phoneSyncExhausted && !skipSyncRequested) {
          waitElapsedSec++;
          const aborted = await window.__walinux_ipc?.isChatExportAborted?.(exportId);
          if (aborted) break;

          showOrUpdateExportHUD({
            title: chatTitle,
            index: chatIndex,
            total: totalChats,
            statusText: `Waiting for phone sync (${waitElapsedSec}s)... Open WhatsApp on your phone`,
            msgCount: entriesMap.size,
            mediaCount: 0,
            oldestDate: oldestDateIso,
            exportId,
            canSkip: true,
            skipLabel: 'Skip Phone Sync',
            onSkip: handleSkipPhoneSync,
          });

          await sleep(1000);
          harvestModels();

          // Check if new messages arrived
          if (entriesMap.size > previousCount) {
            const delta = entriesMap.size - previousCount;
            console.log(`[walinux-exporter] Received ${delta} new messages from phone sync! Total: ${entriesMap.size}`);
            previousCount = entriesMap.size;
            consecutiveNoNewMessages = 0;
            phoneSyncRetryCount = 0; // RESET retry count on successful load!
            phoneSyncExhausted = false; // Reset exhausted state so next batch card is processed!

            // Scroll back to top immediately so next batch card can mount
            scrollContainer.scrollTop = 0;
            scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
            await sleep(800);
            harvestModels();
            break; // Break the wait loop to evaluate next cycle!
          }

          const spinner = hasConversationSpinner();
          const currentBtn = findPhoneSyncButton();

          // If spinner finished and error reappeared, exit wait loop to handle retry evaluation
          if (!spinner && (currentBtn?.isRetry || hasCouldNotLoadOlderMessages())) {
            break;
          }

          // If spinner finished and button disappeared, wait 2s for DOM to settle and break
          if (!spinner && !currentBtn && waitElapsedSec >= 3) {
            await sleep(2000);
            harvestModels();
            if (entriesMap.size > previousCount) {
              previousCount = entriesMap.size;
              consecutiveNoNewMessages = 0;
              phoneSyncRetryCount = 0;
              phoneSyncExhausted = false;
            }
            scrollContainer.scrollTop = 0;
            scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
            break;
          }
        }

        await sleep(500);
        continue;
      }

      // 2. Dynamic wait if conversation spinner is active outside button click
      if (hasConversationSpinner()) {
        showOrUpdateExportHUD({
          title: chatTitle,
          index: chatIndex,
          total: totalChats,
          statusText: 'Loading chat history...',
          msgCount: entriesMap.size,
          mediaCount: 0,
          oldestDate: oldestDateIso,
          exportId,
        });
        await sleep(1000);
        harvestModels();
        consecutiveNoNewMessages = 0;
        continue;
      }

      await sleep(350);
      captureLiveBlobsFromDom(liveBlobs, capturedBuffers);
      harvestModels();

      // 3. Progress evaluation
      if (entriesMap.size > previousCount) {
        consecutiveNoNewMessages = 0;
        previousCount = entriesMap.size;
        phoneSyncRetryCount = 0;
        phoneSyncExhausted = false;
      } else {
        consecutiveNoNewMessages++;

        const currentBtn = findPhoneSyncButton();
        // If a phone sync card is visible (or reappeared), NEVER conclude!
        if (currentBtn && !phoneSyncExhausted) {
          consecutiveNoNewMessages = 0;
          continue;
        }

        const noEarlier = Boolean(activeChat.msgs?.msgLoadState?.noEarlierMsgs);
        if (noEarlier && !currentBtn) {
          console.log('[walinux-exporter] WhatsApp reports no earlier messages and no phone sync button; concluding harvest.');
          break;
        }

        if (phoneSyncExhausted && consecutiveNoNewMessages >= 25) {
          console.log('[walinux-exporter] Phone sync exhausted and no new messages; concluding history harvest.');
          break;
        }

        if (consecutiveNoNewMessages >= 40) {
          console.log('[walinux-exporter] Reached top of conversation history; concluding harvest.');
          break;
        }
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

    return { messages: results, liveBlobs, capturedBuffers };
  }

  /**
   * Downloads binary media attachments and saves them via main process IPC.
   * Strictly sequential: one file completes or fails before the next starts.
   * Performs a downward DOM scroll sweep to mount attachments and trigger native downloads for documents.
   */
  async function downloadAndAttachMedia(
    entries: (MessageEntry | SystemNotificationEntry)[],
    liveBlobs: Map<string, string>,
    capturedBuffers: Map<string, { buffer: ArrayBuffer; mimeType: string }>,
    activeChat: any,
    outputDirectory: string,
    filesDirName: string,
    exportId: string,
    chatTitle: string,
    chatIndex: number,
    totalChats: number,
    onMediaSaved: (count: number) => void
  ): Promise<void> {
    let savedCount = 0;
    const handlers = getCollection('WAWebMediaHubMessageActionHandlers');
    const scrollContainer = getConversationScrollContainer();

    // Do NOT reset scrollTop to 0! Setting scrollTop to 0 immediately triggers WhatsApp's
    // infinite scroll listener to fetch older messages and prepend them, shifting scrollHeight!
    // Instead, if currently scrolled far down, smoothly reposition near top (>= 150px) without touching 0
    if (scrollContainer && scrollContainer.scrollTop > 300) {
      scrollContainer.scrollTop = 150;
      scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
      await sleep(200);
    }

    const mediaEntries = entries.filter((e): e is MessageEntry => {
      if (e.type !== 'message') return false;
      const t = e.content.type;
      return t === 'image' || t === 'video' || t === 'audio' || t === 'document' || t === 'sticker';
    });

    // Reliably calculate earliest date across all harvested entries
    let minEpoch = Infinity;
    let computedOldestIso: string | undefined = undefined;
    for (const e of entries) {
      if (e.timestamp) {
        const ep = new Date(e.timestamp).getTime();
        if (!isNaN(ep) && ep > 0 && ep < minEpoch) {
          minEpoch = ep;
          computedOldestIso = e.timestamp;
        }
      }
    }
    const oldestDateIso = computedOldestIso || lastKnownOldestDate;
    const handledStanzaIds = new Set<string>();
    let skippedCount = 0;
    const isGroup = Boolean(activeChat.isGroup || activeChat.id?.server === 'g.us' || activeChat.groupMetadata);
    const chatJid = String(activeChat.id?._serialized || activeChat.id || '');
    const memberLabelsMap = isGroup ? getMemberLabelsMap(chatJid) : {};

    // Build fast lookup map for chronological entry indices
    const entryIndexMap = new Map<string, number>();
    entries.forEach((e, idx) => {
      entryIndexMap.set(e.id, idx);
      if ((e as any).serializedId) {
        entryIndexMap.set((e as any).serializedId, idx);
      }
    });

    // Helper to find message DOM row or album DOM container
    const findRowOrAlbumElement = (
      targetId: string,
      targetSerializedId?: string
    ): {
      element: HTMLElement | null;
      isAlbum: boolean;
      albumDataId?: string;
      albumEntries?: MessageEntry[];
    } => {
      const mainEl = document.querySelector<HTMLElement>('#main');

      // 1. Check all mounted album elements in DOM
      const albumEls = Array.from((mainEl || document).querySelectorAll<HTMLElement>('[data-id*="album-"]'));
      for (const aEl of albumEls) {
        const aDataId = aEl.getAttribute('data-id') || '';
        const match = aDataId.match(/album-([A-Za-z0-9]+)-([A-Za-z0-9]+)-(\d+)/);
        if (match) {
          const firstId = match[1];
          const lastId = match[2];
          const count = parseInt(match[3], 10);
          const firstIdx = mediaEntries.findIndex((m) => m.id === firstId);
          const lastIdx = mediaEntries.findIndex((m) => m.id === lastId);
          if (firstIdx !== -1) {
            const endIdx = lastIdx !== -1 ? lastIdx + 1 : firstIdx + count;
            const albumGroup = mediaEntries.slice(firstIdx, endIdx);
            if (albumGroup.some((m) => m.id === targetId || m.serializedId === targetId)) {
              return { element: aEl, isAlbum: true, albumDataId: aDataId, albumEntries: albumGroup };
            }
          } else if (aDataId.includes(targetId)) {
            return {
              element: aEl,
              isAlbum: true,
              albumDataId: aDataId,
              albumEntries: [mediaEntries.find((m) => m.id === targetId) || mediaEntries[0]],
            };
          }
        } else if (aDataId.includes(targetId)) {
          return { element: aEl, isAlbum: true, albumDataId: aDataId };
        }
      }

      // 2. Direct message row match scoped to #main conversation view
      const sel = targetSerializedId
        ? `[data-id*="${targetId}"], [data-id*="${targetSerializedId}"], [data-testid*="${targetId}"]`
        : `[data-id*="${targetId}"], [data-testid*="${targetId}"]`;
      const el = (mainEl ? mainEl.querySelector<HTMLElement>(sel) : null) || document.querySelector<HTMLElement>(sel);
      if (el) {
        const dataId = el.getAttribute('data-id') || '';
        const isAlbum = dataId.includes('album-') || Boolean(el.querySelector('[data-id*="album-"]'));
        const albumDataId = isAlbum
          ? dataId.includes('album-')
            ? dataId
            : el.querySelector('[data-id*="album-"]')?.getAttribute('data-id') || ''
          : undefined;
        return { element: el, isAlbum, albumDataId };
      }

      return { element: null, isAlbum: false };
    };

    for (let mediaIdx = 0; mediaIdx < mediaEntries.length; mediaIdx++) {
      const isAborted = isCurrentJobAborted || (await window.__walinux_ipc?.isChatExportAborted?.(exportId));
      if (isAborted) break;

      // Ensure active chat remains open
      await ensureChatOpen(chatJid, chatTitle);

      // Dynamically accommodate newly loaded messages (e.g. user scrolled up or triggered phone sync)
      try {
        if (activeChat?.msgs && typeof activeChat.msgs.getModelsArray === 'function') {
          const liveModels = activeChat.msgs.getModelsArray();
          if (liveModels.length > entries.length) {
            const existingIds = new Set(entries.map((e) => e.id));
            let newMsgsAdded = 0;
            for (const m of liveModels) {
              const sId = m.id?.id || (m.id?._serialized ? m.id._serialized.split('_')[2] : '');
              if (!sId || existingIds.has(sId)) continue;
              const extracted = extractMessageEntry(m, activeChat, memberLabelsMap);
              if (extracted) {
                entries.push(extracted);
                existingIds.add(extracted.id);
                newMsgsAdded++;
                if (extracted.type === 'message') {
                  const t = extracted.content.type;
                  if (t === 'image' || t === 'video' || t === 'audio' || t === 'document' || t === 'sticker') {
                    mediaEntries.push(extracted);
                  }
                }
              }
            }
            if (newMsgsAdded > 0) {
              entries.sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());
              mediaEntries.sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());
              // Rebuild entryIndexMap immediately so indices reflect new positions!
              entryIndexMap.clear();
              entries.forEach((e, idx) => {
                entryIndexMap.set(e.id, idx);
                if ((e as any).serializedId) {
                  entryIndexMap.set((e as any).serializedId, idx);
                }
              });
              showOrUpdateExportHUD({
                title: chatTitle,
                index: chatIndex,
                total: totalChats,
                statusText: `Accommodated ${newMsgsAdded} newly loaded messages...`,
                msgCount: entries.length,
                mediaCount: savedCount,
                totalMedia: mediaEntries.length,
                skippedCount,
                oldestDate: oldestDateIso,
                exportId,
              });
            }
          }
        }
      } catch (err) {
        console.warn('[walinux-exporter] Dynamic message accommodation error:', err);
      }

      const entry = mediaEntries[mediaIdx];

      const stanzaId = entry.id;
      if (handledStanzaIds.has(stanzaId)) {
        continue;
      }

      const content = entry.content;
      const serializedId = entry.serializedId || stanzaId;

      let ext = 'bin';
      let targetFileName = '';
      if (content.type === 'image') ext = 'jpeg';
      else if (content.type === 'video') ext = 'mp4';
      else if (content.type === 'audio') ext = (content as AudioContent).isVoiceNote ? 'ogg' : 'mp3';
      else if (content.type === 'sticker') ext = 'webp';
      else if (content.type === 'document') {
        targetFileName = (content as DocumentContent).fileName || 'Document';
        const match = targetFileName.match(/\.([a-zA-Z0-9]+)$/);
        ext = match ? match[1].toLowerCase() : 'bin';
      }

      const safeFileBase = targetFileName
        ? targetFileName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim()
        : `${stanzaId}.${ext}`;
      const subPath = `media/${stanzaId}_${safeFileBase}`;

      let entrySaved = false;
      let skipRequested = false;

      const handleSkip = () => {
        skipRequested = true;
        skippedCount++;
        handledStanzaIds.add(stanzaId);
        showOrUpdateExportHUD({
          title: chatTitle,
          index: chatIndex,
          total: totalChats,
          statusText: `Skipped (${mediaIdx + 1}/${mediaEntries.length}): ${targetFileName || safeFileBase}`,
          msgCount: entries.length,
          mediaCount: savedCount,
          totalMedia: mediaEntries.length,
          skippedCount,
          oldestDate: oldestDateIso,
          exportId,
          canSkip: false,
        });
      };

      // --- STEP 1: FAST PATH (Memory Buffers & Existing Files on Disk) ---
      // A. Check memory buffer captured during scroll
      const captured = capturedBuffers.get(stanzaId) || capturedBuffers.get(serializedId);
      if (captured && captured.buffer.byteLength > 0 && window.__walinux_ipc?.saveChatMedia) {
        try {
          const relativeSavedRef = await window.__walinux_ipc.saveChatMedia(
            outputDirectory,
            filesDirName,
            subPath,
            captured.buffer
          );
          (content as any).mediaRef = relativeSavedRef;
          entrySaved = true;
          savedCount++;
          handledStanzaIds.add(stanzaId);
          onMediaSaved(savedCount);
          showOrUpdateExportHUD({
            title: chatTitle,
            index: chatIndex,
            total: totalChats,
            statusText: `Saved (${mediaIdx + 1}/${mediaEntries.length}): ${targetFileName || safeFileBase}`,
            msgCount: entries.length,
            mediaCount: savedCount,
            totalMedia: mediaEntries.length,
            skippedCount,
            oldestDate: oldestDateIso,
            exportId,
            canSkip: false,
          });
          continue;
        } catch (err) {
          console.warn(`[walinux-exporter] Failed to save captured buffer for ${stanzaId}:`, err);
        }
      }

      // B. Check if file was already downloaded to disk previously
      if (targetFileName && window.__walinux_ipc?.findExistingDownload) {
        try {
          const existing = await window.__walinux_ipc.findExistingDownload(
            targetFileName,
            (content as any).fileSize
          );
          if (existing && existing.found && existing.path && window.__walinux_ipc?.copyFileToExport) {
            const relativeSavedRef = await window.__walinux_ipc.copyFileToExport(
              outputDirectory,
              filesDirName,
              subPath,
              existing.path
            );
            (content as any).mediaRef = relativeSavedRef;
            entrySaved = true;
            savedCount++;
            handledStanzaIds.add(stanzaId);
            onMediaSaved(savedCount);
            showOrUpdateExportHUD({
              title: chatTitle,
              index: chatIndex,
              total: totalChats,
              statusText: `Saved (${mediaIdx + 1}/${mediaEntries.length}): ${targetFileName}`,
              msgCount: entries.length,
              mediaCount: savedCount,
              totalMedia: mediaEntries.length,
              skippedCount,
              oldestDate: oldestDateIso,
              exportId,
              canSkip: false,
            });
            continue;
          }
        } catch (err) {
          console.warn(`[walinux-exporter] Existing file check failed for ${targetFileName}:`, err);
        }
      }

      // --- STEP 2: LOCATE IN DOM (Accurate, Monotonic Sweep; Never Pong-Paddle) ---
      let found = findRowOrAlbumElement(stanzaId, serializedId);
      if (!found.element && scrollContainer) {
        let liveModels: any[] = [];
        try {
          if (activeChat?.msgs?.getModelsArray) {
            liveModels = activeChat.msgs.getModelsArray();
          }
        } catch { }

        let targetModelIdx = -1;
        if (liveModels.length > 0) {
          targetModelIdx = liveModels.findIndex(
            (m) =>
              (m.id?.id && m.id.id === stanzaId) ||
              (m.id?._serialized && (m.id._serialized === stanzaId || m.id._serialized === serializedId))
          );
        }
        if (targetModelIdx === -1) {
          targetModelIdx = entryIndexMap.get(stanzaId) ?? entryIndexMap.get(serializedId) ?? -1;
        }

        for (let step = 0; step < 20; step++) {
          found = findRowOrAlbumElement(stanzaId, serializedId);
          if (found.element) break;

          const mainEl = document.querySelector<HTMLElement>('#main');
          const mounted = mainEl ? Array.from(mainEl.querySelectorAll<HTMLElement>('div[data-id]')) : [];
          let minIdx = Infinity;
          let maxIdx = -1;

          if (liveModels.length > 0) {
            for (const r of mounted) {
              const did = r.getAttribute('data-id') || '';
              const mIdx = liveModels.findIndex(
                (m) => m.id?.id === did || m.id?._serialized === did || m.id?._serialized?.includes(did)
              );
              if (mIdx !== -1) {
                if (mIdx < minIdx) minIdx = mIdx;
                if (mIdx > maxIdx) maxIdx = mIdx;
              }
            }
          } else {
            for (const r of mounted) {
              const did = r.getAttribute('data-id') || '';
              let mIdx = entryIndexMap.get(did);
              if (mIdx === undefined) {
                const parts = did.split('_');
                if (parts.length >= 3) {
                  mIdx = entryIndexMap.get(parts[2]);
                }
              }
              if (mIdx !== undefined) {
                if (mIdx < minIdx) minIdx = mIdx;
                if (mIdx > maxIdx) maxIdx = mIdx;
              }
            }
          }

          const stepSize = Math.max(450, Math.floor(scrollContainer.clientHeight * 0.75));
          const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);

          if (targetModelIdx !== -1 && minIdx !== Infinity && maxIdx !== -1) {
            if (targetModelIdx > maxIdx) {
              // Target is newer than visible window: scroll DOWN
              scrollContainer.scrollTop = Math.min(maxScrollTop, scrollContainer.scrollTop + stepSize);
            } else if (targetModelIdx < minIdx) {
              // Target is older than visible window: scroll UP, but never touch 0 (stay >= 150)
              scrollContainer.scrollTop = Math.max(150, scrollContainer.scrollTop - stepSize);
            } else {
              // Target is within mounted range: fine-tune scroll towards it proportionally
              const ratio = (targetModelIdx - minIdx) / (maxIdx - minIdx || 1);
              const targetTop = scrollContainer.scrollTop + (ratio - 0.5) * scrollContainer.clientHeight;
              scrollContainer.scrollTop = Math.max(150, Math.min(maxScrollTop, targetTop));
            }
          } else {
            // Index unknown or unmatched: advance DOWNWARD monotonically
            scrollContainer.scrollTop = Math.min(maxScrollTop, scrollContainer.scrollTop + stepSize);
          }

          scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
          await sleep(180);
          captureLiveBlobsFromDom(liveBlobs, capturedBuffers);
        }
      }

      const rowEl = found.element;
      const isAlbum = found.isAlbum;

      // Center row in viewport and give React time to render
      if (rowEl) {
        try {
          rowEl.scrollIntoView({ block: 'center', behavior: 'auto' });
          await sleep(200);
        } catch { }
      }

      // --- STEP 3: GROUPED MEDIA (ALBUMS) ---
      if (isAlbum && rowEl) {
        const albumEntries =
          found.albumEntries ||
          (() => {
            const match = found.albumDataId?.match(/album-([A-Za-z0-9]+)-([A-Za-z0-9]+)-(\d+)/);
            const firstId = match ? match[1] : '';
            const lastId = match ? match[2] : '';
            const count = match ? parseInt(match[3], 10) : 0;
            const firstIdx = firstId ? mediaEntries.findIndex((m) => m.id === firstId) : -1;
            const lastIdx = lastId ? mediaEntries.findIndex((m) => m.id === lastId) : -1;
            return firstIdx !== -1
              ? mediaEntries.slice(firstIdx, lastIdx !== -1 ? lastIdx + 1 : firstIdx + count)
              : [mediaEntries[mediaIdx]];
          })();
        const albumStanzaIds = albumEntries.map((ae) => ae.id);

        showOrUpdateExportHUD({
          title: chatTitle,
          index: chatIndex,
          total: totalChats,
          statusText: `Downloading grouped media album (${albumEntries.length} items)`,
          msgCount: entries.length,
          mediaCount: savedCount,
          totalMedia: mediaEntries.length,
          skippedCount,
          oldestDate: oldestDateIso,
          exportId,
          canSkip: true,
          onSkip: () => {
            skipRequested = true;
            skippedCount += albumEntries.length;
            for (const ae of albumEntries) handledStanzaIds.add(ae.id);
          },
        });

        let albumProcessedSuccessfully = false;

        // 1. Try trusted context menu "Download all"
        try {
          const rect = rowEl.getBoundingClientRect();
          const cx = Math.floor(rect.left + Math.min(80, rect.width / 2));
          const cy = Math.floor(rect.top + Math.min(80, rect.height / 2));

          await window.__walinux_ipc?.prepareExportDownload?.('.zip', 0);
          const dlPromise = window.__walinux_ipc?.waitForDownload?.('.zip', 8000);

          if (window.__walinux_ipc?.dispatchMouse) {
            await window.__walinux_ipc.dispatchMouse('contextmenu', cx, cy);
          } else {
            rowEl.dispatchEvent(
              new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: cx, clientY: cy })
            );
          }

          await sleep(200);

          const menuItems = Array.from(document.querySelectorAll('li, div[role="button"], span'));
          const dlAllOption = menuItems.find((el) => {
            const txt = (el.textContent || '').trim().toLowerCase();
            return txt === 'download all' || txt.includes('download all');
          }) as HTMLElement | null;

          if (dlAllOption) {
            dlAllOption.click();
            const dlRes = await dlPromise;
            if (dlRes && dlRes.success && dlRes.savePath && window.__walinux_ipc?.unzipAlbumDownload) {
              const unzipRes = await window.__walinux_ipc.unzipAlbumDownload(
                outputDirectory,
                filesDirName,
                dlRes.savePath,
                albumStanzaIds
              );
              if (unzipRes && unzipRes.success && unzipRes.mapping) {
                let albumSavedCount = 0;
                for (const ae of albumEntries) {
                  const mRef = unzipRes.mapping[ae.id];
                  if (mRef) {
                    (ae.content as any).mediaRef = mRef;
                    albumSavedCount++;
                    handledStanzaIds.add(ae.id);
                  }
                }
                if (albumSavedCount > 0) {
                  savedCount += albumSavedCount;
                  onMediaSaved(savedCount);
                  albumProcessedSuccessfully = true;
                }
              }
            }
          } else {
            // Dismiss menu if open safely without dispatching Escape to document (which closes the chat)
            dismissContextMenuSafely();
          }
        } catch (err) {
          console.warn('[walinux-exporter] Grouped media album zip download error:', err);
        }

        // 2. Fallback: harvest visible decrypted blobs from album tiles
        if (!albumProcessedSuccessfully) {
          const tileImgs = Array.from(rowEl.querySelectorAll<HTMLImageElement | HTMLMediaElement>('img, video')).filter(
            (m) => m.src && m.src.startsWith('blob:') && !m.src.includes('data:image/gif')
          );
          let tileSavedCount = 0;
          for (let ti = 0; ti < Math.min(tileImgs.length, albumEntries.length); ti++) {
            const ae = albumEntries[ti];
            if (handledStanzaIds.has(ae.id)) continue;
            try {
              const resp = await fetch(tileImgs[ti].src);
              const buf = await resp.arrayBuffer();
              if (buf.byteLength > 0 && window.__walinux_ipc?.saveChatMedia) {
                const aSubPath = `media/${ae.id}_${ae.id}.jpeg`;
                const savedRef = await window.__walinux_ipc.saveChatMedia(
                  outputDirectory,
                  filesDirName,
                  aSubPath,
                  buf
                );
                (ae.content as any).mediaRef = savedRef;
                handledStanzaIds.add(ae.id);
                tileSavedCount++;
              }
            } catch { }
          }
          if (tileSavedCount > 0) {
            savedCount += tileSavedCount;
            onMediaSaved(savedCount);
            albumProcessedSuccessfully = true;
          }
        }

        for (const ae of albumEntries) {
          handledStanzaIds.add(ae.id);
        }

        if (albumProcessedSuccessfully) {
          showOrUpdateExportHUD({
            title: chatTitle,
            index: chatIndex,
            total: totalChats,
            statusText: `Saved grouped media album (${albumEntries.length} items)`,
            msgCount: entries.length,
            mediaCount: savedCount,
            totalMedia: mediaEntries.length,
            skippedCount,
            oldestDate: oldestDateIso,
            exportId,
            canSkip: false,
          });
          continue;
        }
      }

      if (handledStanzaIds.has(stanzaId)) {
        continue;
      }

      // --- STEP 4: INDIVIDUAL MEDIA DOWNLOAD (Documents, Voice Notes, Images, Videos, Stickers) ---
      showOrUpdateExportHUD({
        title: chatTitle,
        index: chatIndex,
        total: totalChats,
        statusText: `Downloading (${mediaIdx + 1}/${mediaEntries.length}): ${targetFileName || safeFileBase}`,
        msgCount: entries.length,
        mediaCount: savedCount,
        totalMedia: mediaEntries.length,
        skippedCount,
        oldestDate: oldestDateIso,
        exportId,
        canSkip: true,
        onSkip: handleSkip,
      });

      // A. Check visible DOM element media blob (or data URI for stickers/images)
      if (rowEl) {
        const mediaEls = Array.from(rowEl.querySelectorAll<HTMLImageElement | HTMLMediaElement>('img, video, audio'));
        for (const m of mediaEls) {
          const buf = await extractBufferFromMediaElement(m);
          if (buf && buf.byteLength > 0 && window.__walinux_ipc?.saveChatMedia) {
            try {
              const relativeSavedRef = await window.__walinux_ipc.saveChatMedia(
                outputDirectory,
                filesDirName,
                subPath,
                buf
              );
              (content as any).mediaRef = relativeSavedRef;
              entrySaved = true;
              savedCount++;
              handledStanzaIds.add(stanzaId);
              onMediaSaved(savedCount);
              showOrUpdateExportHUD({
                title: chatTitle,
                index: chatIndex,
                total: totalChats,
                statusText: `Saved (${mediaIdx + 1}/${mediaEntries.length}): ${targetFileName || safeFileBase}`,
                msgCount: entries.length,
                mediaCount: savedCount,
                totalMedia: mediaEntries.length,
                skippedCount,
                oldestDate: oldestDateIso,
                exportId,
                canSkip: false,
              });
              break;
            } catch (e) { }
          }
        }
        if (entrySaved) continue;
      }

      if (skipRequested) continue;

      // B. Trigger Download (Documents, Voice Notes, Stickers, Unrendered items)
      try {
        const isSticker = content.type === 'sticker';
        const isDocument = content.type === 'document';
        const expectedName = !isSticker ? (targetFileName || (content.type === 'audio' ? '.ogg' : undefined)) : undefined;
        let dlPromise: Promise<{ success: boolean; savePath?: string; filename?: string } | null> | undefined;

        if (!isSticker && expectedName) {
          await window.__walinux_ipc?.prepareExportDownload?.(expectedName, (content as any).fileSize);
          dlPromise = window.__walinux_ipc?.waitForDownload?.(expectedName, 8000);
        }

        let triggered = false;

        if (rowEl) {
          if (isSticker) {
            // STICKERS: ALWAYS and ONLY click the circular download button on the sticker.
            // STICKERS CANNOT BE DOWNLOADED VIA CONTEXT MENU.
            const dlIconBtn = (
              rowEl.querySelector<HTMLElement>(
                'span[data-icon="download"], span[data-icon="refresh"], [data-icon*="download"], [data-testid*="download"]'
              )?.closest<HTMLElement>('button, [role="button"]') ||
              rowEl.querySelector<HTMLElement>(
                '[role="button"][title*="Download" i], [role="button"][aria-label*="Download" i], button[title*="Download" i], button[aria-label*="Download" i], [data-testid="media-download"], [data-testid="button-download"]'
              )
            );

            const stickerBtn = dlIconBtn || rowEl.querySelector<HTMLElement>('div[role="button"][aria-label*="Sticker" i]') || rowEl.querySelector<HTMLElement>('div[role="button"]');

            if (stickerBtn) {
              await clickElementThoroughly(stickerBtn);
              triggered = true;
            }
          } else if (isDocument) {
            // DOCUMENTS: First try explicit download button, then ALWAYS try right-click context menu download!
            // 1. Explicit download button on card (e.g. download icon button)
            const explicitDlBtn = rowEl.querySelector<HTMLElement>(
              'span[data-icon="download"], span[data-icon="down"], [data-icon*="download"], [data-testid="audio-download"], [data-testid="document-download"]'
            )?.closest<HTMLElement>('button, [role="button"]');

            if (explicitDlBtn) {
              await clickElementThoroughly(explicitDlBtn);
              triggered = true;
            }

            // 2. Open context menu on document card
            const docTarget = (
              rowEl.querySelector<HTMLElement>(
                '[data-testid="document-thumb"], div[title*="."], div[class*="message-in"], div[class*="message-out"], .copyable-text'
              ) || rowEl
            );

            docTarget.scrollIntoView({ block: 'nearest', behavior: 'auto' });
            await sleep(60);
            const rect = docTarget.getBoundingClientRect();
            const cx = Math.floor(rect.left + rect.width / 2);
            const cy = Math.floor(rect.top + rect.height / 2);

            // Hover to reveal context menu chevron if present
            docTarget.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: cx, clientY: cy }));
            await sleep(50);

            // Method A: Click chevron if present
            const chevron = rowEl.querySelector<HTMLElement>(
              '[data-testid="down-context"], [data-icon="down-context"], span[data-icon="chevron-down"], div[role="button"][title*="Menu" i], [aria-label*="Context menu" i], [aria-label*="Menu" i]'
            );

            let menuOpened = false;
            if (chevron) {
              await clickElementThoroughly(chevron);
              await sleep(250);
              menuOpened = Boolean(document.querySelector('div[data-animate-context-menu="true"], ul[role="menu"]'));
            }

            // Method B: If chevron did not open menu, trigger right-click contextmenu event directly
            if (!menuOpened) {
              if (window.__walinux_ipc?.dispatchMouse && cx > 0 && cy > 0 && cx < window.innerWidth && cy < window.innerHeight) {
                await window.__walinux_ipc.dispatchMouse('contextmenu', cx, cy);
              } else {
                docTarget.dispatchEvent(
                  new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: cx, clientY: cy })
                );
              }
              await sleep(250);
            }

            // Select "Download" from context menu
            const menuItems = Array.from(document.querySelectorAll('li, div[role="button"], span, div[tabindex="-1"]'));
            const downloadItem = menuItems.find((el) => {
              const txt = (el.textContent || '').trim().toLowerCase();
              return txt === 'download' || txt.startsWith('download');
            }) as HTMLElement | null;

            if (downloadItem) {
              await clickElementThoroughly(downloadItem);
              triggered = true;
            } else {
              dismissContextMenuSafely();
            }
          } else {
            // OTHER MEDIA (Audio, Voice notes, Video, Images)
            const dlBtn = rowEl.querySelector<HTMLElement>(
              '[role="button"][title*="Download" i], [role="button"][aria-label*="Download" i], [data-testid="audio-download"], [data-testid="media-download"], [data-testid="button-download"], [data-icon*="download" i], div[title*="Download" i], button[title*="Download" i]'
            );

            if (dlBtn) {
              await clickElementThoroughly(dlBtn);
              triggered = true;
            } else {
              // Context menu fallback
              const mediaTarget = rowEl.querySelector<HTMLElement>(
                'img, video, audio, [data-testid="audio-player"], .copyable-text, div[class*="message-in"], div[class*="message-out"]'
              ) || rowEl;

              mediaTarget.scrollIntoView({ block: 'nearest', behavior: 'auto' });
              await sleep(60);
              const rect = mediaTarget.getBoundingClientRect();
              const cx = Math.floor(rect.left + rect.width / 2);
              const cy = Math.floor(rect.top + rect.height / 2);

              mediaTarget.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: cx, clientY: cy }));
              await sleep(50);

              const chevron = rowEl.querySelector<HTMLElement>(
                '[data-testid="down-context"], [data-icon="down-context"], span[data-icon="chevron-down"], div[role="button"][title*="Menu" i], [aria-label*="Context menu" i], [aria-label*="Menu" i]'
              );

              if (chevron) {
                await clickElementThoroughly(chevron);
              } else {
                if (window.__walinux_ipc?.dispatchMouse && cx > 0 && cy > 0) {
                  await window.__walinux_ipc.dispatchMouse('contextmenu', cx, cy);
                } else {
                  mediaTarget.dispatchEvent(
                    new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: cx, clientY: cy })
                  );
                }
              }

              await sleep(300);

              const menuItems = Array.from(document.querySelectorAll('li, div[role="button"], span, div[tabindex="-1"]'));
              const downloadItem = menuItems.find((el) => {
                const txt = (el.textContent || '').trim().toLowerCase();
                return txt === 'download' || txt.startsWith('download');
              }) as HTMLElement | null;

              if (downloadItem) {
                await clickElementThoroughly(downloadItem);
                triggered = true;
              } else {
                dismissContextMenuSafely();
              }
            }
          }
        }

        // Responsive wait loop (checks every 150ms, max 8 seconds, zero artificial pauses)
        const dlHolder: { result: { success: boolean; savePath?: string; filename?: string } | null } = { result: null };
        if (dlPromise) {
          dlPromise
            .then((res) => {
              dlHolder.result = res;
            })
            .catch(() => {
              dlHolder.result = { success: false };
            });
        }

        const startTimeMs = Date.now();
        const maxWaitMs = 8000;

        while (Date.now() - startTimeMs < maxWaitMs && !skipRequested && !entrySaved) {
          await sleep(150);

          // 1. Check if a decrypted media blob or data URI appeared in DOM (stickers, images, videos)
          if (rowEl) {
            const mediaEls = Array.from(rowEl.querySelectorAll<HTMLImageElement | HTMLMediaElement>('img, video, audio'));
            for (const m of mediaEls) {
              const buf = await extractBufferFromMediaElement(m);
              if (buf && buf.byteLength > 0 && window.__walinux_ipc?.saveChatMedia) {
                try {
                  const relativeSavedRef = await window.__walinux_ipc.saveChatMedia(
                    outputDirectory,
                    filesDirName,
                    subPath,
                    buf
                  );
                  (content as any).mediaRef = relativeSavedRef;
                  entrySaved = true;
                  savedCount++;
                  handledStanzaIds.add(stanzaId);
                  onMediaSaved(savedCount);
                  break;
                } catch (e) { }
              }
            }
            if (entrySaved) break;
          }

          // 2. Check if Chromium download completed (documents, audio, etc.)
          if (!isSticker) {
            const curResult = dlHolder.result;
            if (
              curResult &&
              curResult.success &&
              curResult.savePath &&
              window.__walinux_ipc?.copyFileToExport
            ) {
              try {
                const relativeSavedRef = await window.__walinux_ipc.copyFileToExport(
                  outputDirectory,
                  filesDirName,
                  subPath,
                  curResult.savePath
                );
                (content as any).mediaRef = relativeSavedRef;
                entrySaved = true;
                savedCount++;
                handledStanzaIds.add(stanzaId);
                onMediaSaved(savedCount);
                break;
              } catch (e) { }
            }

            // 3. Check if file landed on disk directly
            if (targetFileName && window.__walinux_ipc?.findExistingDownload) {
              try {
                const existing = await window.__walinux_ipc.findExistingDownload(
                  targetFileName,
                  (content as any).fileSize
                );
                if (existing && existing.found && existing.path && window.__walinux_ipc?.copyFileToExport) {
                  const relativeSavedRef = await window.__walinux_ipc.copyFileToExport(
                    outputDirectory,
                    filesDirName,
                    subPath,
                    existing.path
                  );
                  (content as any).mediaRef = relativeSavedRef;
                  entrySaved = true;
                  savedCount++;
                  handledStanzaIds.add(stanzaId);
                  onMediaSaved(savedCount);
                  break;
                }
              } catch (e) { }
            }
          }
        }

        if (entrySaved) {
          showOrUpdateExportHUD({
            title: chatTitle,
            index: chatIndex,
            total: totalChats,
            statusText: `Saved (${mediaIdx + 1}/${mediaEntries.length}): ${targetFileName || safeFileBase}`,
            msgCount: entries.length,
            mediaCount: savedCount,
            totalMedia: mediaEntries.length,
            skippedCount,
            oldestDate: oldestDateIso,
            exportId,
            canSkip: false,
          });
        }
      } catch (err) {
        console.warn(`[walinux-exporter] Download error for ${stanzaId}:`, err);
      }

      // C. Thumbnail fallback if binary not saved
      if (!entrySaved) {
        handledStanzaIds.add(stanzaId);
        if ((content as any).thumbnailDataUri && window.__walinux_ipc?.saveChatMedia) {
          try {
            const thumbSubPath = `media/${stanzaId}.jpeg`;
            const relativeSavedRef = await window.__walinux_ipc.saveChatMedia(
              outputDirectory,
              filesDirName,
              thumbSubPath,
              (content as any).thumbnailDataUri
            );
            (content as any).mediaRef = relativeSavedRef;
          } catch (e) { }
        } else {
          (content as any).isExpired = true;
        }
      }
    }

    // Final reconciliation pass: Accommodate any media downloaded manually by the user or loaded into view
    const unsavedMedia = mediaEntries.filter(
      (m) => (m.content as any).isExpired || !(m.content as any).mediaRef
    );

    if (unsavedMedia.length > 0) {
      showOrUpdateExportHUD({
        title: chatTitle,
        index: chatIndex,
        total: totalChats,
        statusText: `Reconciling unsaved media (${unsavedMedia.length} items)...`,
        msgCount: entries.length,
        mediaCount: savedCount,
        totalMedia: mediaEntries.length,
        skippedCount,
        oldestDate: oldestDateIso,
        exportId,
        canSkip: false,
      });

      for (const entry of unsavedMedia) {
        const stanzaId = entry.id;
        const content = entry.content;
        let targetFileName = '';
        let ext = 'bin';
        if (content.type === 'document') {
          targetFileName = (content as DocumentContent).fileName || '';
          const match = targetFileName.match(/\.([a-zA-Z0-9]+)$/);
          ext = match ? match[1].toLowerCase() : 'bin';
        } else if (content.type === 'image') ext = 'jpeg';
        else if (content.type === 'video') ext = 'mp4';
        else if (content.type === 'audio') ext = (content as AudioContent).isVoiceNote ? 'ogg' : 'mp3';
        else if (content.type === 'sticker') ext = 'webp';

        const safeFileBase = targetFileName
          ? targetFileName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim()
          : `${stanzaId}.${ext}`;
        const subPath = `media/${stanzaId}_${safeFileBase}`;

        // 1. Check if user manually downloaded or Chromium saved to disk
        if (targetFileName && window.__walinux_ipc?.findExistingDownload) {
          try {
            const existing = await window.__walinux_ipc.findExistingDownload(
              targetFileName,
              (content as any).fileSize
            );
            if (existing && existing.found && existing.path && window.__walinux_ipc?.copyFileToExport) {
              const relativeSavedRef = await window.__walinux_ipc.copyFileToExport(
                outputDirectory,
                filesDirName,
                subPath,
                existing.path
              );
              (content as any).mediaRef = relativeSavedRef;
              (content as any).isExpired = false;
              savedCount++;
              handledStanzaIds.add(stanzaId);
              onMediaSaved(savedCount);
              continue;
            }
          } catch { }
        }

        // 2. Check memory buffer captured during scroll
        const captured = capturedBuffers.get(stanzaId) || capturedBuffers.get(entry.serializedId || stanzaId);
        if (captured && captured.buffer.byteLength > 0 && window.__walinux_ipc?.saveChatMedia) {
          try {
            const relativeSavedRef = await window.__walinux_ipc.saveChatMedia(
              outputDirectory,
              filesDirName,
              subPath,
              captured.buffer
            );
            (content as any).mediaRef = relativeSavedRef;
            (content as any).isExpired = false;
            savedCount++;
            handledStanzaIds.add(stanzaId);
            onMediaSaved(savedCount);
            continue;
          } catch { }
        }
      }
    }

    // Restore scroll container to the bottom after download sweep
    if (scrollContainer) {
      try {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      } catch { }
    }
  }

  /**
   * Interleaves DateDividerEntry objects into the chronological timeline.
   */
  function interleaveDateDividers(messages: (MessageEntry | SystemNotificationEntry)[]): TimelineEntry[] {
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
      ): Promise<{ success: boolean; messagesCount: number; mediaCount: number; htmlPath?: string; error?: string }> {
        (window as any).__wallie_is_exporting = true;
        try {
          showOrUpdateExportHUD({
            title: options.chatTitle || options.chatJid,
            index: chatIndex,
            total: totalChats,
            statusText: 'Opening chat conversation...',
            msgCount: 0,
            mediaCount: 0,
            exportId,
          });

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

          const safeTitle = (activeChat.formattedTitle || activeChat.name || options.chatTitle || 'Chat')
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
            .trim();
          const filesDirName = `${safeTitle}_files`;

          // 3. Harvest messages
          await window.__walinux_ipc?.updateChatExportProgress?.(exportId, {
            status: 'scrolling',
          });

          const { messages, liveBlobs, capturedBuffers } = await scrollAndHarvestMessages(
            activeChat,
            options.timeframeBoundary,
            exportId,
            safeTitle,
            chatIndex,
            totalChats,
            (count, oldestIso) => {
              window.__walinux_ipc?.updateChatExportProgress?.(exportId, {
                messagesExported: count,
                oldestMessageDate: oldestIso,
              });
            }
          );

          // 4. Download media attachments
          await window.__walinux_ipc?.updateChatExportProgress?.(exportId, {
            status: 'downloading_media',
          });

          let mediaSavedCount = 0;
          await downloadAndAttachMedia(
            messages,
            liveBlobs,
            capturedBuffers,
            activeChat,
            options.outputDirectory,
            filesDirName,
            exportId,
            safeTitle,
            chatIndex,
            totalChats,
            (count) => {
              mediaSavedCount = count;
              window.__walinux_ipc?.updateChatExportProgress?.(exportId, {
                mediaFilesSaved: count,
              });
            }
          );

          // 5. Save Avatars
          showOrUpdateExportHUD({
            title: safeTitle,
            index: chatIndex,
            total: totalChats,
            statusText: 'Saving group and participant avatars...',
            msgCount: messages.length,
            mediaCount: mediaSavedCount,
            exportId,
          });

          let chatAvatarUrl: string | undefined;
          try {
            let chatAvatarData: string | ArrayBuffer | null = null;
            const thumb = activeChat.contact?.profilePicThumb || activeChat.profilePicThumb;
            if (thumb?.img && typeof thumb.img === 'string' && !thumb.img.includes('static.whatsapp.net')) {
              chatAvatarData = thumb.img;
            } else if (thumb?.eurl && typeof thumb.eurl === 'string' && !thumb.eurl.includes('static.whatsapp.net')) {
              try {
                const resp = await fetch(thumb.eurl);
                chatAvatarData = await resp.arrayBuffer();
              } catch { }
            }
            if (!chatAvatarData) {
              // Exclude Meta AI! Only check #main header images from WhatsApp CDN / PPS
              const headerImgs = Array.from(document.querySelectorAll('#main header img')) as HTMLImageElement[];
              const validHeaderImg = headerImgs.find((img) => {
                const src = img.src || '';
                if (!src || src.includes('static.whatsapp.net') || src.includes('rsrc.php')) return false;
                return src.includes('whatsapp.net') || src.startsWith('blob:');
              });
              if (validHeaderImg && validHeaderImg.src) {
                try {
                  const resp = await fetch(validHeaderImg.src);
                  chatAvatarData = await resp.arrayBuffer();
                } catch { }
              }
            }
            if (chatAvatarData && window.__walinux_ipc?.saveChatMedia) {
              chatAvatarUrl = await window.__walinux_ipc.saveChatMedia(
                options.outputDirectory,
                filesDirName,
                'avatars/chat_avatar.jpg',
                chatAvatarData
              );
            }
          } catch (e) {
            console.warn('[walinux-exporter] Failed to save chat avatar:', e);
          }

          // Save participant avatars for group chats
          const savedParticipantAvatars = new Map<string, string>();
          const ProfilePicThumbCollection = getCollection('WAWebProfilePicThumbCollection')?.ProfilePicThumbCollection;
          const ContactCollection = getCollection('WAWebContactCollection')?.ContactCollection;

          for (const msg of messages) {
            if (msg.type !== 'message') continue;
            if (!msg.sender?.jid || msg.direction === 'outgoing') continue;
            const senderJid = msg.sender.jid;

            if (savedParticipantAvatars.has(senderJid)) {
              msg.sender.avatarUrl = savedParticipantAvatars.get(senderJid);
              continue;
            }

            try {
              let avatarData: string | ArrayBuffer | null = null;

              // 1. Check ProfilePicThumbCollection
              const ppt = ProfilePicThumbCollection?.get ? (
                ProfilePicThumbCollection.get(senderJid) ||
                ProfilePicThumbCollection.get(`${senderJid.split('@')[0]}@c.us`) ||
                ProfilePicThumbCollection.get(`${senderJid.split('@')[0]}@lid`)
              ) : null;

              if (ppt?.img && typeof ppt.img === 'string') {
                avatarData = ppt.img;
              } else if (ppt?.eurl && typeof ppt.eurl === 'string' && !ppt.eurl.includes('static.whatsapp.net')) {
                try {
                  const resp = await fetch(ppt.eurl);
                  avatarData = await resp.arrayBuffer();
                } catch { }
              }

              // 2. Check ContactCollection
              if (!avatarData) {
                let contact = ContactCollection?.get ? (
                  ContactCollection.get(senderJid) ||
                  ContactCollection.get(`${senderJid.split('@')[0]}@c.us`) ||
                  ContactCollection.get(`${senderJid.split('@')[0]}@lid`)
                ) : null;
                if (!contact && ContactCollection?.getModelsArray) {
                  const list = ContactCollection.getModelsArray();
                  contact = list.find((c: any) =>
                    c.id?._serialized === senderJid ||
                    c.lid?._serialized === senderJid ||
                    c.id?.user === senderJid.split('@')[0]
                  );
                }

                const msgModel = activeChat.msgs?.get?.(msg.serializedId || msg.id);
                const senderObj = contact || msgModel?.senderObj;
                const thumb = senderObj?.profilePicThumb;

                if (thumb?.img && typeof thumb.img === 'string') {
                  avatarData = thumb.img;
                } else if (thumb?.eurl && typeof thumb.eurl === 'string' && !thumb.eurl.includes('static.whatsapp.net')) {
                  try {
                    const resp = await fetch(thumb.eurl);
                    avatarData = await resp.arrayBuffer();
                  } catch { }
                }
              }

              // 3. Check live DOM for participant avatar image
              if (!avatarData) {
                const rowEl = document.querySelector(`[data-id*="${msg.id}"], [data-id*="${msg.serializedId}"]`);
                const avatarImg = rowEl?.querySelector('img[src*="pps.whatsapp.net"], img[src*="blob:"]') as HTMLImageElement | null;
                if (avatarImg?.src) {
                  try {
                    const resp = await fetch(avatarImg.src);
                    avatarData = await resp.arrayBuffer();
                  } catch { }
                }
              }

              if (avatarData && window.__walinux_ipc?.saveChatMedia) {
                const safeJid = senderJid.replace(/[^a-zA-Z0-9_-]/g, '_');
                const savedAvatarPath = await window.__walinux_ipc.saveChatMedia(
                  options.outputDirectory,
                  filesDirName,
                  `avatars/${safeJid}.jpg`,
                  avatarData
                );
                savedParticipantAvatars.set(senderJid, savedAvatarPath);
                msg.sender.avatarUrl = savedAvatarPath;
              }
            } catch (e) {
              console.warn(`[walinux-exporter] Failed to save participant avatar for ${senderJid}:`, e);
            }
          }

          // Determine group chat status
          const isGroup = Boolean(
            activeChat.id?.server === 'g.us' ||
            activeChat.groupMetadata != null ||
            activeChat.isGroup === true ||
            (typeof activeChat.isGroup === 'function' && activeChat.isGroup())
          );

          let groupMetadataObj: any = undefined;
          if (isGroup) {
            const participantsList: any[] = [];
            if (activeChat.groupMetadata?.participants) {
              const rawParticipants = Array.isArray(activeChat.groupMetadata.participants)
                ? activeChat.groupMetadata.participants
                : (typeof activeChat.groupMetadata.participants.getModelsArray === 'function'
                  ? activeChat.groupMetadata.participants.getModelsArray()
                  : []);

              for (const p of rawParticipants) {
                const pJid = String(p.id?._serialized || p.id || '');
                const pName = resolveContactName(pJid);
                const avUrl = savedParticipantAvatars.get(pJid) ||
                  savedParticipantAvatars.get(`${pJid.split('@')[0]}@c.us`) ||
                  savedParticipantAvatars.get(`${pJid.split('@')[0]}@lid`);
                participantsList.push({
                  jid: pJid,
                  displayName: pName,
                  isAdmin: Boolean(p.isAdmin),
                  isSuperAdmin: Boolean(p.isSuperAdmin),
                  avatarUrl: avUrl,
                });
              }
            }

            groupMetadataObj = {
              description: activeChat.groupMetadata?.desc ? String(activeChat.groupMetadata.desc) : undefined,
              participantsCount: participantsList.length || (activeChat.groupMetadata?.participants?.length || 0),
              participants: participantsList,
            };
          }

          // 6. Interleave date dividers
          const timeline = interleaveDateDividers(messages);

          // 7. Check abort status
          const isAborted = Boolean(isCurrentJobAborted || (await window.__walinux_ipc?.isChatExportAborted?.(exportId)));

          // 8. Build envelope
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
              type: isGroup ? 'group' : (activeChat.isBroadcast ? 'broadcast' : 'direct'),
              avatarUrl: chatAvatarUrl,
              groupMetadata: groupMetadataObj,
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

          // 9. Finalize files
          showOrUpdateExportHUD({
            title: safeTitle,
            index: chatIndex,
            total: totalChats,
            statusText: 'Writing JSON envelope and standalone viewer...',
            msgCount: messages.length,
            mediaCount: mediaSavedCount,
            exportId,
          });

          await window.__walinux_ipc?.updateChatExportProgress?.(exportId, {
            status: 'saving',
          });

          const finalizeRes = await window.__walinux_ipc?.finalizeChatExport?.(
            options.outputDirectory,
            envelope,
            options.includeViewer ?? true
          );

          await window.__walinux_ipc?.updateChatExportProgress?.(exportId, {
            status: 'completed',
            outputDirectory: options.outputDirectory,
            jsonPath: finalizeRes?.jsonPath,
            htmlPath: finalizeRes?.htmlPath,
            messagesExported: messages.length,
            mediaFilesSaved: mediaSavedCount,
          });

          await window.__walinux_ipc?.completeChatExportJob?.(exportId);

          // If single chat export, display in-viewport completion modal
          if (totalChats <= 1) {
            showExportCompletionModal({
              status: isAborted ? 'aborted' : 'completed',
              chatTitle: safeTitle,
              messagesCount: messages.length,
              mediaCount: mediaSavedCount,
              outputDirectory: options.outputDirectory,
              htmlPath: finalizeRes?.htmlPath,
            });
          }

          return {
            success: true,
            messagesCount: messages.length,
            mediaCount: mediaSavedCount,
            htmlPath: finalizeRes?.htmlPath,
          };
        } catch (err) {
          console.error('[walinux-exporter] Export failed:', err);
          await window.__walinux_ipc?.updateChatExportProgress?.(exportId, {
            status: 'failed',
            error: (err as Error).message,
          });
          await window.__walinux_ipc?.completeChatExportJob?.(exportId);

          if (totalChats <= 1) {
            showExportCompletionModal({
              status: 'failed',
              chatTitle: options.chatTitle || 'WhatsApp Chat',
              messagesCount: 0,
              mediaCount: 0,
              outputDirectory: options.outputDirectory,
              error: (err as Error).message,
            });
          }

          return {
            success: false,
            messagesCount: 0,
            mediaCount: 0,
            error: (err as Error).message,
          };
        } finally {
          (window as any).__wallie_is_exporting = false;
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
            isCurrentJobAborted = false;
            const { options, exportId } = event.data;
            const res = await runSingleChatExport(options, exportId, 0, 1);
            window.postMessage({ type: 'WALLIE_EXPORT_COMPLETED', exportId, result: res }, '*');
          }

          if (event.data.type === 'WALLIE_START_MULTI_EXPORT') {
            isCurrentJobAborted = false;
            const { chats, outputDirectory, includeViewer, timeframeBoundary, exportId } = event.data;
            const results = [];
            let totalMsgs = 0;
            let totalMedia = 0;
            let firstHtmlPath: string | undefined;

            for (let i = 0; i < chats.length; i++) {
              const isAborted = isCurrentJobAborted || (await window.__walinux_ipc?.isChatExportAborted?.(exportId));
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
              totalMsgs += res.messagesCount;
              totalMedia += res.mediaCount;
              if (!firstHtmlPath && res.htmlPath) {
                firstHtmlPath = res.htmlPath;
              }

              if (isCurrentJobAborted || (await window.__walinux_ipc?.isChatExportAborted?.(exportId))) {
                break;
              }
            }

            const isAborted = isCurrentJobAborted || (await window.__walinux_ipc?.isChatExportAborted?.(exportId));
            showExportCompletionModal({
              status: isAborted ? 'aborted' : 'completed',
              chatTitle: `${chats.length} Chats`,
              messagesCount: totalMsgs,
              mediaCount: totalMedia,
              outputDirectory,
              htmlPath: firstHtmlPath,
            });

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

