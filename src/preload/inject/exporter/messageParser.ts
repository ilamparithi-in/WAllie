/**
 * Parser for WhatsApp Web message models and timeline entry generation.
 */

import type {
  TimelineEntry,
  SystemNotificationEntry,
  MessageEntry,
  MessageSender,
  MessageContent,
  QuotedReplyContext,
  MessageReaction,
} from '../../../shared/chatExportTypes';
import {
  getCollection,
  resolveContactName,
  hashCode,
  formatBytes,
} from './utils';

/**
 * Extracts a single MessageEntry or SystemNotificationEntry from a WhatsApp message model.
 */
export function extractMessageEntry(
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
  } catch { }

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

  // Resolve thumbnail data URI
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
  } catch { }

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
 * Interleaves DateDividerEntry objects into the chronological timeline.
 */
export function interleaveDateDividers(messages: (MessageEntry | SystemNotificationEntry)[]): TimelineEntry[] {
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

