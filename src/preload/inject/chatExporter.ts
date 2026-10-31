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
      if (Cmd?.openChatFromUnread) {
        Cmd.openChatFromUnread({ chat: targetChat });
        await sleep(250);
        const check = getActiveChatInfo();
        if (check && (check.jid === targetJid || check.title === safeTitle)) {
          return true;
        }
      }
    } catch (e) {}
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
  } catch (err) {}
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
    const rModel = ReactionsCollection?.get ? ReactionsCollection.get(stanzaId) : null;
    const rawReactions = rModel?.__x_reactions || m.reactions;
    if (rawReactions && Array.isArray(rawReactions) && rawReactions.length > 0) {
      reactions = rawReactions.map((r: any) => ({
        emoji: String(r.aggregateEmoji || r.emoji || ''),
        senderJid: r.sender ? String(r.sender) : undefined,
        senderName: r.senderName || (r.sender ? resolveContactName(r.sender) : undefined),
      }));
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
function showOrUpdateExportHUD(state: {
  title: string;
  index: number;
  total: number;
  statusText: string;
  msgCount: number;
  mediaCount: number;
  oldestDate?: string;
  exportId: string;
  canSkip?: boolean;
  onSkip?: () => void;
}): void {
  let overlay = document.getElementById('wallie-export-hud-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'wallie-export-hud-overlay';
    overlay.setAttribute(
      'style',
      'position: fixed; inset: 0; z-index: 2147483640; display: flex; align-items: center; justify-content: center; background: rgba(11, 20, 26, 0.55); backdrop-filter: none !important; -webkit-backdrop-filter: none !important; pointer-events: auto; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #e9edef; user-select: none;'
    );
    overlay.innerHTML = `
      <style>
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
      <div id="wallie-export-card" style="background: #1f2c34; border: 1px solid #2a3942; border-radius: 14px; box-shadow: 0 16px 40px rgba(0,0,0,0.6); padding: 22px 26px; width: 440px; max-width: 90vw; display: flex; flex-direction: column; gap: 16px;">
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #2a3942; padding-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 600; font-size: 13px; color: #00a884; letter-spacing: 0.3px;">WAllie Chat Exporter</span>
          </div>
          <span id="wallie-hud-badge" style="font-size: 11px; background: #111b21; border: 1px solid #2a3942; padding: 2px 8px; border-radius: 12px; color: #8696a0;">Chat 1 of 1</span>
        </div>

        <div>
          <div id="wallie-hud-title" style="font-size: 16px; font-weight: 600; color: #e9edef; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 8px;">Exporting Chat</div>
          <div style="display: flex; align-items: center; gap: 10px; background: #111b21; padding: 10px 14px; border-radius: 8px; border: 1px solid #222d34;">
            <div class="wallie-hud-spinner"></div>
            <span id="wallie-hud-status" style="font-size: 13px; color: #8696a0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Initializing export...</span>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; background: #111b21; padding: 12px; border-radius: 8px; border: 1px solid #222d34; text-align: center;">
          <div>
            <div style="font-size: 11px; color: #8696a0; text-transform: uppercase;">Messages</div>
            <div id="wallie-hud-msgs" style="font-size: 17px; font-weight: 700; color: #00a884; margin-top: 2px;">0</div>
          </div>
          <div>
            <div style="font-size: 11px; color: #8696a0; text-transform: uppercase;">Media Saved</div>
            <div id="wallie-hud-media" style="font-size: 17px; font-weight: 700; color: #53bdeb; margin-top: 2px;">0</div>
          </div>
          <div>
            <div style="font-size: 11px; color: #8696a0; text-transform: uppercase;">Oldest Date</div>
            <div id="wallie-hud-oldest" style="font-size: 12px; font-weight: 600; color: #e9edef; margin-top: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">—</div>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; align-items: center; gap: 10px; padding-top: 2px;">
          <button id="wallie-hud-skip-btn" style="display: none; background: transparent; border: 1px solid #53bdeb; color: #53bdeb; font-size: 12px; font-weight: 600; padding: 6px 16px; border-radius: 6px; cursor: pointer; transition: background 0.2s;">Skip File</button>
          <button id="wallie-hud-cancel-btn" style="background: transparent; border: 1px solid #ea4335; color: #ea4335; font-size: 12px; font-weight: 600; padding: 6px 16px; border-radius: 6px; cursor: pointer; transition: background 0.2s;">Cancel Export</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const cancelBtn = document.getElementById('wallie-hud-cancel-btn');
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        cancelBtn.textContent = 'Aborting...';
        (cancelBtn as HTMLButtonElement).disabled = true;
        window.__walinux_ipc?.stopChatExport?.(state.exportId);
      };
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
  if (mediaEl) mediaEl.textContent = String(state.mediaCount);

  const oldestEl = document.getElementById('wallie-hud-oldest');
  if (oldestEl) {
    if (state.oldestDate) {
      const d = new Date(state.oldestDate);
      oldestEl.textContent = isNaN(d.getTime()) ? state.oldestDate.slice(0, 10) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
    } else {
      oldestEl.textContent = '—';
    }
  }

  const skipBtn = document.getElementById('wallie-hud-skip-btn') as HTMLButtonElement | null;
  if (skipBtn) {
    if (state.canSkip) {
      skipBtn.style.display = 'inline-block';
      skipBtn.onclick = () => {
        if (state.onSkip) state.onSkip();
      };
    } else {
      skipBtn.style.display = 'none';
      skipBtn.onclick = null;
    }
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
    'position: fixed; inset: 0; z-index: 2147483645; display: flex; align-items: center; justify-content: center; background: rgba(11, 20, 26, 0.55); backdrop-filter: none !important; -webkit-backdrop-filter: none !important; pointer-events: auto; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #e9edef; user-select: none; padding: 16px;'
  );

  const iconColor = isSuccess ? '#00a884' : (isAborted ? '#f59e0b' : '#ea4335');
  const iconSymbol = isSuccess ? '✓' : (isAborted ? '⚠' : '✕');
  const titleText = isSuccess ? 'Chat Export Completed' : (isAborted ? 'Export Cancelled' : 'Chat Export Failed');

  modal.innerHTML = `
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
          <span style="font-size: 11px; color: #aebac1; word-break: break-all; background: #182229; padding: 6px 8px; border-radius: 4px; font-family: monospace;">${summary.outputDirectory || '—'}</span>
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
            .catch(() => {});
        }
      }
    }
  }
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
  const memberLabelsMap = isGroupChat ? getMemberLabelsMap(String(activeChat.id?._serialized || activeChat.id)) : {};
  const entriesMap = new Map<string, MessageEntry | SystemNotificationEntry>();
  const liveBlobs = new Map<string, string>();
  const capturedBuffers = new Map<string, { buffer: ArrayBuffer; mimeType: string }>();

  const harvestModels = () => {
    captureLiveBlobsFromDom(liveBlobs, capturedBuffers);
    if (activeChat.msgs) {
      const models = activeChat.msgs.getModelsArray ? activeChat.msgs.getModelsArray() : [];
      for (const m of models) {
        const entry = extractMessageEntry(m, activeChat, memberLabelsMap);
        if (entry && !entriesMap.has(entry.id)) {
          entriesMap.set(entry.id, entry);
        }
      }
    }

    // Also harvest any DOM-rendered system notices (e.g. group description changes, security codes)
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

  const scrollContainer = document.querySelector<HTMLElement>(
    'div[data-testid="conversation-panel-messages"], .copyable-area [tabindex="0"]'
  );

  let consecutiveNoNewMessages = 0;
  let phoneSyncWaitSeconds = 0;
  let phoneSyncClickCount = 0;
  let previousCount = entriesMap.size;

  while (true) {
    const isAborted = await window.__walinux_ipc?.isChatExportAborted?.(exportId);
    if (isAborted) {
      break;
    }

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
      break;
    }

    if (!scrollContainer) {
      break;
    }

    // Scroll up
    scrollContainer.scrollTop = 0;
    await sleep(200);

    captureLiveBlobsFromDom(liveBlobs, capturedBuffers);
    harvestModels();

    const mainEl = document.querySelector<HTMLElement>('#main') || scrollContainer;
    const containerText = (scrollContainer.textContent || mainEl.textContent || '').toLowerCase();

    // Check for explicit sync failure in DOM (accommodating transient split-second notices)
    const hasSyncFailedNotice =
      containerText.includes("couldn't get older messages") ||
      containerText.includes("could not get older messages") ||
      containerText.includes('unable to get older messages') ||
      containerText.includes('make sure your phone has an active internet connection');

    // Only conclude on sync failure notice if it persists across consecutive scroll attempts without new messages
    if (hasSyncFailedNotice && phoneSyncClickCount >= 1 && consecutiveNoNewMessages >= 8) {
      console.warn('[walinux-exporter] Phone sync failed persistently to load older messages. Ending scroll.');
      break;
    }

    // Helper to detect if a spinner is actively running inside conversation panel
    const hasConversationSpinner = (): boolean => {
      const sp = scrollContainer.querySelector('[data-testid="spinner"], [role="progressbar"], span[data-icon*="progress"]') ||
        mainEl.querySelector(':scope > [data-testid="spinner"], :scope > [role="progressbar"], :scope > span[data-icon*="progress"]');
      return Boolean(sp && !sp.closest('#wallie-export-hud-overlay'));
    };

    // Find phone sync button strictly inside mainEl, excluding WAllie HUD
    const allButtons = Array.from(mainEl.querySelectorAll('button, div[role="button"], span[role="button"]'))
      .filter((b) => !b.closest('#wallie-export-hud-overlay'));

    const phoneSyncBtn = allButtons.find((b) => {
      const txt = (b.textContent || '').toLowerCase();
      if (
        txt.includes("couldn't") ||
        txt.includes("could not") ||
        txt.includes("unable") ||
        txt.includes("failed")
      ) {
        return false;
      }
      return (
        txt.includes('get older messages') ||
        txt.includes('older messages from your phone') ||
        txt.includes('older messages from phone')
      );
    }) as HTMLElement | undefined;

    const isBtnDisabled = Boolean(
      phoneSyncBtn && (
        phoneSyncBtn.hasAttribute('disabled') ||
        phoneSyncBtn.getAttribute('aria-disabled') === 'true' ||
        phoneSyncBtn.classList.contains('disabled')
      )
    );

    // 1. If phone sync button is available and enabled: click it once and dynamically wait
    if (phoneSyncBtn && !isBtnDisabled && phoneSyncClickCount < 1) {
      phoneSyncClickCount++;
      showOrUpdateExportHUD({
        title: chatTitle,
        index: chatIndex,
        total: totalChats,
        statusText: 'Requesting older messages from phone...',
        msgCount: entriesMap.size,
        mediaCount: 0,
        oldestDate: oldestDateIso,
        exportId,
      });

      phoneSyncBtn.click();
      await sleep(1500);

      // Dynamically wait while WhatsApp is loading/syncing from phone
      // WhatsApp might briefly flash a transient "couldn't get older messages" error for a split second before loading; accommodate it with a grace period
      phoneSyncWaitSeconds = 0;
      let stableCountWithoutSpinner = 0;

      while (phoneSyncWaitSeconds < 75) {
        phoneSyncWaitSeconds++;
        const spinner = hasConversationSpinner();

        showOrUpdateExportHUD({
          title: chatTitle,
          index: chatIndex,
          total: totalChats,
          statusText: `Syncing older messages from phone (${phoneSyncWaitSeconds}s)... Waiting for phone.`,
          msgCount: entriesMap.size,
          mediaCount: 0,
          oldestDate: oldestDateIso,
          exportId,
        });

        const aborted = await window.__walinux_ipc?.isChatExportAborted?.(exportId);
        if (aborted) break;

        await sleep(1000);

        // Check if messages have begun landing in memory
        harvestModels();
        if (entriesMap.size > previousCount) {
          console.log('[walinux-exporter] New messages detected during phone sync wait!');
          break;
        }

        if (!spinner && !isBtnDisabled) {
          stableCountWithoutSpinner++;
          // Allow at least 4 seconds without spinner and 5s total so any transient error flash settles and messages load
          if (stableCountWithoutSpinner >= 4 && phoneSyncWaitSeconds >= 5) {
            break;
          }
        } else {
          stableCountWithoutSpinner = 0;
        }
      }

      // CRITICAL: Once WhatsApp's spinner/sync settles, wait for models to be committed to activeChat.msgs and rendered to DOM!
      showOrUpdateExportHUD({
        title: chatTitle,
        index: chatIndex,
        total: totalChats,
        statusText: 'Phone sync completed. Loading received messages into chat...',
        msgCount: entriesMap.size,
        mediaCount: 0,
        oldestDate: oldestDateIso,
        exportId,
      });
      await sleep(3500);

      captureLiveBlobsFromDom(liveBlobs, capturedBuffers);
      harvestModels();
      consecutiveNoNewMessages = 0;
      previousCount = entriesMap.size;
      continue;
    }

    // 2. If phone sync was already attempted and is not active
    if (phoneSyncBtn && phoneSyncClickCount >= 1 && !hasConversationSpinner()) {
      console.warn('[walinux-exporter] Phone sync was already completed; concluding history scroll.');
      break;
    }

    // 3. Dynamic wait if conversation spinner is active outside button click
    if (hasConversationSpinner()) {
      phoneSyncWaitSeconds++;
      showOrUpdateExportHUD({
        title: chatTitle,
        index: chatIndex,
        total: totalChats,
        statusText: `Loading chat history (${phoneSyncWaitSeconds}s)...`,
        msgCount: entriesMap.size,
        mediaCount: 0,
        oldestDate: oldestDateIso,
        exportId,
      });
      await sleep(1000);
      consecutiveNoNewMessages = 0;
      continue;
    }

    phoneSyncWaitSeconds = 0;

    // 4. Standard scroll checking: advance or conclude
    if (entriesMap.size === previousCount) {
      consecutiveNoNewMessages++;
      if (consecutiveNoNewMessages === 12 || consecutiveNoNewMessages === 24) {
        try {
          if (typeof activeChat.loadEarlierMsgs === 'function') {
            activeChat.loadEarlierMsgs();
          } else if (typeof activeChat.msgs?.loadEarlierMsgs === 'function') {
            activeChat.msgs.loadEarlierMsgs();
          }
        } catch {}
      }

      if (consecutiveNoNewMessages >= 28) {
        console.log('[walinux-exporter] Reached top of conversation history; concluding harvest.');
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
  const scrollContainer = document.querySelector<HTMLElement>(
    'div[data-testid="conversation-panel-messages"], .copyable-area [tabindex="0"]'
  );

  // Guarantee we start at the top of the chat so we can sweep downward chronologically
  if (scrollContainer) {
    scrollContainer.scrollTop = 0;
    await sleep(250);
  }

  const mediaEntries = entries.filter((e): e is MessageEntry => {
    if (e.type !== 'message') return false;
    const t = e.content.type;
    return t === 'image' || t === 'video' || t === 'audio' || t === 'document' || t === 'sticker';
  });

  for (let mediaIdx = 0; mediaIdx < mediaEntries.length; mediaIdx++) {
    const entry = mediaEntries[mediaIdx];
    const isAborted = await window.__walinux_ipc?.isChatExportAborted?.(exportId);
    if (isAborted) break;

    const content = entry.content;
    const stanzaId = entry.id;
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
      showOrUpdateExportHUD({
        title: chatTitle,
        index: chatIndex,
        total: totalChats,
        statusText: `Skipping attachment: ${targetFileName || `${stanzaId}.${ext}`}...`,
        msgCount: entries.length,
        mediaCount: savedCount,
        exportId,
        canSkip: false,
      });
    };

    const MAX_DOWNLOAD_ATTEMPTS = 2;
    for (let attempt = 1; attempt <= MAX_DOWNLOAD_ATTEMPTS && !entrySaved && !skipRequested; attempt++) {
      const isRetry = attempt > 1;

      // 1. Check if the binary was already captured into memory during scrolling
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
          onMediaSaved(savedCount);
          showOrUpdateExportHUD({
            title: chatTitle,
            index: chatIndex,
            total: totalChats,
            statusText: `Saved attachment (${savedCount}/${mediaEntries.length}): ${targetFileName || `${stanzaId}.${ext}`}`,
            msgCount: entries.length,
            mediaCount: savedCount,
            exportId,
            canSkip: false,
          });
          break;
        } catch (err) {
          console.warn(`[walinux-exporter] Failed to save captured buffer for ${stanzaId}:`, err);
        }
      }

      // 2. Check if the file was already downloaded to disk previously
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
            onMediaSaved(savedCount);
            showOrUpdateExportHUD({
              title: chatTitle,
              index: chatIndex,
              total: totalChats,
              statusText: `Saved attachment (${savedCount}/${mediaEntries.length}): ${targetFileName}`,
              msgCount: entries.length,
              mediaCount: savedCount,
              exportId,
              canSkip: false,
            });
            break;
          }
        } catch (err) {
          console.warn(`[walinux-exporter] Existing file check failed for ${targetFileName}:`, err);
        }
      }

      // 3. Find WhatsApp model for this message
      let model: any = null;
      if (activeChat?.msgs) {
        model = typeof activeChat.msgs.get === 'function'
          ? (activeChat.msgs.get(serializedId) || activeChat.msgs.get(stanzaId))
          : null;

        if (!model && typeof activeChat.msgs.getModelsArray === 'function') {
          const models = activeChat.msgs.getModelsArray();
          model = models.find((m: any) =>
            m.id?._serialized === serializedId ||
            m.id?._serialized === stanzaId ||
            m.id?.id === stanzaId ||
            m.id === serializedId
          );
        }
      }

      // Check if model already has active decrypted blob
      if (model) {
        let blobUrl: string | null = null;
        try {
          if (typeof model.mediaData?.mediaBlob?.url === 'function') {
            blobUrl = model.mediaData.mediaBlob.url();
          } else if (typeof model.mediaData?.preview?.url === 'function') {
            blobUrl = model.mediaData.preview.url();
          } else if (model.mediaData?.staticUrl) {
            blobUrl = model.mediaData.staticUrl;
          }
        } catch (e) {}

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
              entrySaved = true;
              savedCount++;
              onMediaSaved(savedCount);
              showOrUpdateExportHUD({
                title: chatTitle,
                index: chatIndex,
                total: totalChats,
                statusText: `Saved attachment (${savedCount}/${mediaEntries.length}): ${targetFileName || `${stanzaId}.${ext}`}`,
                msgCount: entries.length,
                mediaCount: savedCount,
                exportId,
                canSkip: false,
              });
              break;
            }
          } catch (err) {}
        }
      }

      // 4. Locate message DOM row (search downward sequentially)
      let rowEl = document.querySelector(`[data-id*="${stanzaId}"], [data-id*="${serializedId}"]`) as HTMLElement | null;
      if (!rowEl && scrollContainer) {
        let scrollAttempts = 0;
        while (!rowEl && scrollContainer && scrollAttempts < 45) {
          const prevTop = scrollContainer.scrollTop;
          scrollContainer.scrollTop += 550;
          await sleep(100);
          captureLiveBlobsFromDom(liveBlobs, capturedBuffers);
          rowEl = document.querySelector(`[data-id*="${stanzaId}"], [data-id*="${serializedId}"]`) as HTMLElement | null;
          if (scrollContainer.scrollTop === prevTop && scrollAttempts > 2) {
            break;
          }
          scrollAttempts++;
        }
      }

      if (rowEl) {
        try {
          rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(250);
        } catch {}

        // Check if newly visible media element has a live blob
        const mediaEls = Array.from(rowEl.querySelectorAll('img, video, audio')) as (HTMLMediaElement | HTMLImageElement)[];
        const validMedia = mediaEls.find((m) => m && m.src && m.src.startsWith('blob:') && !m.src.includes('data:image/gif'));
        if (validMedia?.src) {
          try {
            const resp = await fetch(validMedia.src);
            const buf = await resp.arrayBuffer();
            if (buf.byteLength > 0 && window.__walinux_ipc?.saveChatMedia) {
              const relativeSavedRef = await window.__walinux_ipc.saveChatMedia(
                outputDirectory,
                filesDirName,
                subPath,
                buf
              );
              (content as any).mediaRef = relativeSavedRef;
              entrySaved = true;
              savedCount++;
              onMediaSaved(savedCount);
              showOrUpdateExportHUD({
                title: chatTitle,
                index: chatIndex,
                total: totalChats,
                statusText: `Saved attachment (${savedCount}/${mediaEntries.length}): ${targetFileName || `${stanzaId}.${ext}`}`,
                msgCount: entries.length,
                mediaCount: savedCount,
                exportId,
                canSkip: false,
              });
              break;
            }
          } catch {}
        }
      }

      if (skipRequested) break;

      // 5. Trigger download for documents or un-fetched media (including grouped media)
      showOrUpdateExportHUD({
        title: chatTitle,
        index: chatIndex,
        total: totalChats,
        statusText: isRetry
          ? `Retrying download [Attempt ${attempt}/${MAX_DOWNLOAD_ATTEMPTS}]: ${targetFileName || `${stanzaId}.${ext}`}...`
          : `Downloading attachment (${savedCount + 1}/${mediaEntries.length}): ${targetFileName || `${stanzaId}.${ext}`}...`,
        msgCount: entries.length,
        mediaCount: savedCount,
        exportId,
        canSkip: true,
        onSkip: handleSkip,
      });

      try {
        const expectedName = targetFileName || model?.filename || undefined;
        await window.__walinux_ipc?.prepareExportDownload?.(expectedName, (content as any).fileSize);

        let triggered = false;

        // Try DOM download button / card
        if (rowEl) {
          const dlBtn = rowEl.querySelector(
            '[role="button"][title*="Download"], [role="button"][aria-label*="Download"], [data-testid="document-thumb"], [data-testid="audio-download"], div[title*="Download"]'
          ) as HTMLElement | null;
          if (dlBtn) {
            dlBtn.click();
            triggered = true;
          } else {
            // Try message context menu chevron -> Download
            const chevron = rowEl.querySelector(
              '[data-testid="down-context"], [data-icon="down-context"], [aria-label*="Context menu"], [aria-label*="options"]'
            ) as HTMLElement | null;
            if (chevron) {
              chevron.click();
              await sleep(150);
              const menuItems = Array.from(document.querySelectorAll('li, div[role="button"], span'));
              const downloadItem = menuItems.find((el) => el.textContent?.trim().toLowerCase() === 'download') as HTMLElement | null;
              if (downloadItem) {
                downloadItem.click();
                triggered = true;
              }
            }
          }
        }

        // Fallback: Trigger via WhatsApp Web internal API (ESSENTIAL for grouped media albums!)
        if (!triggered) {
          if (handlers && typeof handlers.handleMessageDownloadClick === 'function' && model) {
            try {
              handlers.handleMessageDownloadClick([model], () => {}, 'chat');
              triggered = true;
            } catch {}
          }
          if (model && typeof model.downloadMedia === 'function') {
            try {
              model.downloadMedia({ downloadEvenIfExpensive: true, isUserInitiated: true }).catch(() => {});
              triggered = true;
            } catch {}
          }
        }

        // Dynamic sequential wait: up to 30 seconds per attempt
        const maxWaitSec = 30;
        let waitElapsed = 0;
        const dlPromise = window.__walinux_ipc?.waitForDownload?.(expectedName, maxWaitSec * 1000);

        while (waitElapsed < maxWaitSec && !skipRequested && !entrySaved) {
          waitElapsed++;
          showOrUpdateExportHUD({
            title: chatTitle,
            index: chatIndex,
            total: totalChats,
            statusText: `Downloading (${savedCount + 1}/${mediaEntries.length}): ${targetFileName || `${stanzaId}.${ext}`} (${waitElapsed}s)...`,
            msgCount: entries.length,
            mediaCount: savedCount,
            exportId,
            canSkip: true,
            onSkip: handleSkip,
          });

          // Check if model.mediaBlob became available while waiting
          if (model) {
            try {
              const blobUrl = typeof model.mediaData?.mediaBlob?.url === 'function'
                ? model.mediaData.mediaBlob.url()
                : (model.mediaData?.staticUrl || null);
              if (blobUrl) {
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
                  entrySaved = true;
                  savedCount++;
                  onMediaSaved(savedCount);
                  break;
                }
              }
            } catch {}
          }

          // Check if file landed on disk
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
                onMediaSaved(savedCount);
                break;
              }
            } catch {}
          }

          // Check if Chromium download finished
          const raceResult = await Promise.race([
            dlPromise?.then((res) => ({ settled: true, res })).catch(() => ({ settled: false, res: null })),
            sleep(1000).then(() => ({ settled: false, res: null }))
          ]);

          if (raceResult?.settled && raceResult.res?.success && raceResult.res.savePath && window.__walinux_ipc?.copyFileToExport) {
            const relativeSavedRef = await window.__walinux_ipc.copyFileToExport(
              outputDirectory,
              filesDirName,
              subPath,
              raceResult.res.savePath
            );
            (content as any).mediaRef = relativeSavedRef;
            entrySaved = true;
            savedCount++;
            onMediaSaved(savedCount);
            break;
          }
        }

        if (entrySaved) {
          showOrUpdateExportHUD({
            title: chatTitle,
            index: chatIndex,
            total: totalChats,
            statusText: `Saved attachment (${savedCount}/${mediaEntries.length}): ${targetFileName || `${stanzaId}.${ext}`}`,
            msgCount: entries.length,
            mediaCount: savedCount,
            exportId,
            canSkip: false,
          });
          break;
        }
      } catch (err) {
        console.warn(`[walinux-exporter] Sequential download failed on attempt ${attempt} for ${stanzaId}:`, err);
      }

      if (!entrySaved && !skipRequested && attempt < MAX_DOWNLOAD_ATTEMPTS) {
        await sleep(1500);
      }
    }

    // 6. If full download failed after retries (or was skipped), fallback to thumbnail if available
    if (!entrySaved) {
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
        } catch (e) {}
      } else {
        (content as any).isExpired = true;
      }
    }
  }

  // Restore scroll container to the bottom after download sweep
  if (scrollContainer) {
    try {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    } catch {}
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
        } catch {}
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
          } catch {}
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
          } catch {}
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
            } catch {}
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
            } catch {}
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
    const isAborted = Boolean(await window.__walinux_ipc?.isChatExportAborted?.(exportId));

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
      const { options, exportId } = event.data;
      const res = await runSingleChatExport(options, exportId, 0, 1);
      window.postMessage({ type: 'WALLIE_EXPORT_COMPLETED', exportId, result: res }, '*');
    }

    if (event.data.type === 'WALLIE_START_MULTI_EXPORT') {
      const { chats, outputDirectory, includeViewer, timeframeBoundary, exportId } = event.data;
      const results = [];
      let totalMsgs = 0;
      let totalMedia = 0;
      let firstHtmlPath: string | undefined;

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
        totalMsgs += res.messagesCount;
        totalMedia += res.mediaCount;
        if (!firstHtmlPath && res.htmlPath) {
          firstHtmlPath = res.htmlPath;
        }
      }

      const isAborted = await window.__walinux_ipc?.isChatExportAborted?.(exportId);
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

