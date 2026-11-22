/**
 * Utility functions for formatting and sanitizing notification text
 * across Linux desktop environments (Freedesktop D-Bus), Electron native popups,
 * and renderer history views.
 */

const HTML_ENTITY_HEX_REGEX = /&#x([0-9a-fA-F]+);/g;
const HTML_ENTITY_DEC_REGEX = /&#(\d+);/g;
const STRIP_HTML_REGEX = /<[^>]*>/g;
const WHITESPACE_COLLAPSE_REGEX = /[\r\n\t]+/g;
const MULTI_SPACE_REGEX = /\s+/g;
const SAFE_TAG_REGEX = /<\/?(b|i|u|s|strike|tt|code|br)\b[^>]*>/gi;
const SAFE_TAG_RESTORE_REGEX = /\uE000(\d+)\uE001/g;
const CODE_BLOCK_REGEX = /```([\s\S]+?)```/g;
const INLINE_CODE_REGEX = /`([^`\n]+)`/g;
const BOLD_REGEX = /(^|[\s\p{P}\p{S}])\*([^\s*](?:[\s\S]*?[^\s*])?)\*(?=[\s\p{P}\p{S}]|$)/gu;
const ITALIC_REGEX = /(^|[\s\p{P}\p{S}])_([^\s_](?:[\s\S]*?[^\s_])?)_(?=[\s\p{P}\p{S}]|$)/gu;
const STRIKE_REGEX = /(^|[\s\p{P}\p{S}])~([^\s~](?:[\s\S]*?[^\s~])?)~(?=[\s\p{P}\p{S}]|$)/gu;
const BR_TO_NEWLINE_REGEX = /<br\s*\/?>/gi;
const TOKENIZE_REGEX = /```([\s\S]+?)```|`([^`\n]+)`|(?<=^|[\s\p{P}\p{S}])\*([^\s*](?:[\s\S]*?[^\s*])?)\*(?=[\s\p{P}\p{S}]|$)|(?<=^|[\s\p{P}\p{S}])_([^\s_](?:[\s\S]*?[^\s_])?)_(?=[\s\p{P}\p{S}]|$)|(?<=^|[\s\p{P}\p{S}])~([^\s~](?:[\s\S]*?[^\s~])?)~(?=[\s\p{P}\p{S}]|$)/gu;

/**
 * Decodes all common HTML and XML entities (named, decimal, hex numeric).
 * Performs up to 2 passes to handle nested/double-escaped entities (e.g. &amp;apos;).
 */
export function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  let res = str;
  for (let pass = 0; pass < 2; pass++) {
    const prev = res;
    res = res
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#039;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(HTML_ENTITY_HEX_REGEX, (_, hex) => {
        try {
          return String.fromCodePoint(parseInt(hex, 16));
        } catch {
          return '';
        }
      })
      .replace(HTML_ENTITY_DEC_REGEX, (_, dec) => {
        try {
          return String.fromCodePoint(parseInt(dec, 10));
        } catch {
          return '';
        }
      });
    if (res === prev || !res.includes('&')) break;
  }
  return res;
}

/**
 * Strips HTML tags from text.
 */
export function stripHtmlTags(str: string): string {
  if (!str) return '';
  return str.replace(STRIP_HTML_REGEX, '');
}

/**
 * Formats a single-line summary (title) for notification daemons and native popups.
 * Under the Desktop Notifications Specification, summary is plain text.
 * Entities are decoded and HTML tags are stripped. Special characters like `'`, `"`, `&`
 * are kept unescaped so notification servers do not display literal entity codes (e.g. &apos;).
 */
export function formatNotificationSummary(title: string, maxLength = 256): string {
  if (!title) return '';
  let text = decodeHtmlEntities(title);
  text = stripHtmlTags(text);
  text = text.replace(WHITESPACE_COLLAPSE_REGEX, ' ').replace(MULTI_SPACE_REGEX, ' ').trim();
  return text.slice(0, maxLength);
}

/**
 * Formats body text for notification daemons supporting markup (KDE Plasma, Dunst, SwayNC, GNOME).
 * - Decodes any incoming HTML entities.
 * - Protects safe markup tags (b, i, u, s, strike, tt, code, br).
 * - XML-escapes text nodes (&, <, >). Notice: ' and " are left bare as they are valid in XML text nodes.
 * - Normalizes safe tags.
 * - Converts WhatsApp markdown (*bold*, _italic_, ~strike~, `code`, ```code```) to valid XML tags.
 */
export function formatNotificationBody(rawBody: string, maxLength = 4096): string {
  if (!rawBody) return '';
  let text = decodeHtmlEntities(rawBody.trim());
  if (text.length > maxLength) {
    text = text.slice(0, maxLength);
  }

  // Preserve existing safe tags if present
  const placeholders: string[] = [];
  text = text.replace(SAFE_TAG_REGEX, (match) => {
    const idx = placeholders.length;
    placeholders.push(match.toLowerCase());
    return `\uE000${idx}\uE001`;
  });

  // Escape XML special chars in user text (DO NOT escape quotes or apostrophes in text nodes)
  text = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Restore safe tags normalized
  text = text.replace(SAFE_TAG_RESTORE_REGEX, (_, idx) => {
    let tag = placeholders[parseInt(idx, 10)];
    if (tag.startsWith('<strike')) tag = '<s>';
    else if (tag.startsWith('</strike')) tag = '</s>';
    else if (tag.startsWith('<code')) tag = '<tt>';
    else if (tag.startsWith('</code')) tag = '</tt>';
    else if (tag.startsWith('<br')) tag = '<br/>';
    return tag;
  });

  // WhatsApp formatting:
  text = text.replace(CODE_BLOCK_REGEX, '<tt>$1</tt>');
  text = text.replace(INLINE_CODE_REGEX, '<tt>$1</tt>');
  text = text.replace(BOLD_REGEX, '$1<b>$2</b>');
  text = text.replace(ITALIC_REGEX, '$1<i>$2</i>');
  text = text.replace(STRIKE_REGEX, '$1<s>$2</s>');

  return text;
}

/**
 * Strips markup for notification providers that do not support markup (e.g. standard Electron native popups).
 */
export function stripNotificationMarkup(rawBody: string, maxLength = 4096): string {
  if (!rawBody) return '';
  let text = decodeHtmlEntities(rawBody.trim());
  text = text.replace(BR_TO_NEWLINE_REGEX, '\n');
  text = stripHtmlTags(text);
  if (text.length > maxLength) {
    text = text.slice(0, maxLength);
  }
  return text;
}

export interface FormattedToken {
  type: 'text' | 'bold' | 'italic' | 'strike' | 'code' | 'codeblock';
  value: string;
}

/**
 * Tokenizes text with WhatsApp formatting for clean React rendering without dangerouslySetInnerHTML.
 */
export function tokenizeFormattedText(rawText: string): FormattedToken[] {
  if (!rawText) return [];
  const text = decodeHtmlEntities(rawText);
  TOKENIZE_REGEX.lastIndex = 0;

  const tokens: FormattedToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TOKENIZE_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    if (match[1] !== undefined) tokens.push({ type: 'codeblock', value: match[1] });
    else if (match[2] !== undefined) tokens.push({ type: 'code', value: match[2] });
    else if (match[3] !== undefined) tokens.push({ type: 'bold', value: match[3] });
    else if (match[4] !== undefined) tokens.push({ type: 'italic', value: match[4] });
    else if (match[5] !== undefined) tokens.push({ type: 'strike', value: match[5] });
    lastIndex = TOKENIZE_REGEX.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return tokens;
}

export interface MediaTypeDef {
  key: string;
  singular: string;
  plural: string;
  nounRegex: RegExp;
}

export const WHATSAPP_MEDIA_TYPES: MediaTypeDef[] = [
  {
    key: 'photo',
    singular: 'photo',
    plural: 'photos',
    nounRegex: /^(?:photos?|pictures?|images?|photo\s+albums?|albums?)$/i,
  },
  {
    key: 'video',
    singular: 'video',
    plural: 'videos',
    nounRegex: /^(?:videos?)$/i,
  },
  {
    key: 'voice_message',
    singular: 'voice message',
    plural: 'voice messages',
    nounRegex: /^(?:voice\s+messages?|voice\s+notes?)$/i,
  },
  {
    key: 'audio',
    singular: 'audio',
    plural: 'audio files',
    nounRegex: /^(?:audios?|audio\s+files?)$/i,
  },
  {
    key: 'document',
    singular: 'document',
    plural: 'documents',
    nounRegex: /^(?:documents?|files?)$/i,
  },
  {
    key: 'sticker',
    singular: 'sticker',
    plural: 'stickers',
    nounRegex: /^(?:stickers?)$/i,
  },
  {
    key: 'gif',
    singular: 'GIF',
    plural: 'GIFs',
    nounRegex: /^(?:gifs?|gif\s+videos?)$/i,
  },
  {
    key: 'contact',
    singular: 'contact',
    plural: 'contacts',
    nounRegex: /^(?:contacts?|contact\s+cards?)$/i,
  },
  {
    key: 'location',
    singular: 'location',
    plural: 'locations',
    nounRegex: /^(?:locations?|live\s+locations?)$/i,
  },
  {
    key: 'poll',
    singular: 'poll',
    plural: 'polls',
    nounRegex: /^(?:polls?)$/i,
  },
  {
    key: 'event',
    singular: 'event',
    plural: 'events',
    nounRegex: /^(?:events?)$/i,
  },
  {
    key: 'media',
    singular: 'media file',
    plural: 'media files',
    nounRegex: /^(?:media|media\s+files?)$/i,
  },
  {
    key: 'product',
    singular: 'product',
    plural: 'products',
    nounRegex: /^(?:products?|catalogs?)$/i,
  },
];

const LEADING_EMOJI_REGEX = /^([\p{Extended_Pictographic}\uFE0F\u200D]+(?:\s+[\p{Extended_Pictographic}\uFE0F\u200D]+)*)\s*/u;
const TRAILING_EMOJI_REGEX = /\s*([\p{Extended_Pictographic}\uFE0F\u200D]+(?:\s+[\p{Extended_Pictographic}\uFE0F\u200D]+)*)$/u;
const DURATION_REGEX = /^(.*?)(?:\s*\(\d+:\d+\))?$/;
const COUNT_REGEX = /^(\d+)\s+(.+)$/;

export interface ParsedMediaLine {
  sender: string;
  mediaDef: MediaTypeDef;
  count: number;
  isExplicitCount: boolean;
  emojiPrefix: string;
}

function parseMediaBody(bodyText: string): {
  mediaDef: MediaTypeDef;
  count: number;
  isExplicitCount: boolean;
  emojiPrefix: string;
} | null {
  const trimmed = decodeHtmlEntities(bodyText || '').trim();
  if (!trimmed) return null;

  let emojiPrefix = '';
  let withoutEmoji = trimmed;

  const leadingEmojiMatch = trimmed.match(LEADING_EMOJI_REGEX);
  if (leadingEmojiMatch) {
    emojiPrefix = leadingEmojiMatch[1];
    withoutEmoji = trimmed.slice(leadingEmojiMatch[0].length).trim();
  }

  const trailingEmojiMatch = withoutEmoji.match(TRAILING_EMOJI_REGEX);
  if (trailingEmojiMatch) {
    if (!emojiPrefix) {
      emojiPrefix = trailingEmojiMatch[1];
    }
    withoutEmoji = withoutEmoji.slice(0, trailingEmojiMatch.index).trim();
  }

  if (!withoutEmoji) return null;

  let count = 1;
  let isExplicitCount = false;
  let nounPart = withoutEmoji;

  const countMatch = withoutEmoji.match(COUNT_REGEX);
  if (countMatch) {
    const parsedNum = parseInt(countMatch[1], 10);
    if (!isNaN(parsedNum) && parsedNum > 0) {
      count = parsedNum;
      isExplicitCount = true;
      nounPart = countMatch[2].trim();
    }
  }

  const durationMatch = nounPart.match(DURATION_REGEX);
  const cleanedNoun = durationMatch ? durationMatch[1].trim() : nounPart;

  for (const def of WHATSAPP_MEDIA_TYPES) {
    if (def.nounRegex.test(cleanedNoun)) {
      return {
        mediaDef: def,
        count,
        isExplicitCount,
        emojiPrefix: emojiPrefix.trim() ? emojiPrefix.trim() + ' ' : '',
      };
    }
  }

  return null;
}

export function parseMediaLine(line: string): ParsedMediaLine | null {
  if (!line || typeof line !== 'string') return null;
  const decoded = decodeHtmlEntities(line).trim();
  if (!decoded) return null;

  // 1. Group chat format: "Sender: Media"
  const firstColon = decoded.indexOf(':');
  if (firstColon > 0) {
    const senderCandidate = decoded.slice(0, firstColon).trim();
    const bodyCandidate = decoded.slice(firstColon + 1).trim();
    const parsed = parseMediaBody(bodyCandidate);
    if (parsed) {
      return {
        sender: senderCandidate,
        ...parsed,
      };
    }
  }

  // 2. Sender with colon in name: "User:Alias: Media"
  const lastColon = decoded.lastIndexOf(':');
  if (lastColon > 0 && lastColon !== firstColon) {
    const senderCandidate = decoded.slice(0, lastColon).trim();
    const bodyCandidate = decoded.slice(lastColon + 1).trim();
    const parsed = parseMediaBody(bodyCandidate);
    if (parsed) {
      return {
        sender: senderCandidate,
        ...parsed,
      };
    }
  }

  // 3. 1-on-1 chat format without sender prefix: "2 photos", "Photo", "📷 Photo"
  const parsedDirect = parseMediaBody(decoded);
  if (parsedDirect) {
    return {
      sender: '',
      ...parsedDirect,
    };
  }

  return null;
}

export function formatMediaLine(
  sender: string,
  mediaDef: MediaTypeDef,
  count: number,
  emojiPrefix = ''
): string {
  const emoji = emojiPrefix.trim() ? emojiPrefix.trim() + ' ' : '';
  let content = '';

  if (count <= 1) {
    const singularCap = mediaDef.singular.charAt(0).toUpperCase() + mediaDef.singular.slice(1);
    content = `${emoji}${singularCap}`;
  } else {
    content = `${emoji}${count} ${mediaDef.plural}`;
  }

  if (sender) {
    return `${sender}: ${content}`;
  }
  return content;
}

/**
 * Extracts the sender prefix and message body from a notification line.
 * e.g. "Alice: Hello world" -> { sender: "Alice", body: "Hello world" }
 * In 1-on-1 chats (no sender prefix): -> { sender: "", body: "..." }
 * Correctly strips directional Unicode controls (\u200e) and avoids false positives on URLs (http://...).
 */
export function extractSenderPrefix(line: string): { sender: string; body: string } {
  if (!line || typeof line !== 'string') return { sender: '', body: '' };
  const decoded = decodeHtmlEntities(line).trim();
  const cleanLine = decoded.replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '');
  const colonIdx = cleanLine.indexOf(':');
  if (colonIdx > 0) {
    const candidateSender = cleanLine.slice(0, colonIdx).trim();
    if (!/^(?:https?|ftp|file|mailto)$/i.test(candidateSender)) {
      const candidateBody = cleanLine.slice(colonIdx + 1).trim();
      return { sender: candidateSender, body: candidateBody };
    }
  }
  return { sender: '', body: cleanLine };
}

export function coalesceNotificationMessages(
  existingMessages: string[],
  incomingMsg: string,
  options?: { isEdit?: boolean }
): string[] {
  const messages = [...existingMessages];

  // If this incoming message is an edit, update the previous line from this sender in-place
  if (options?.isEdit) {
    const incomingParsed = extractSenderPrefix(incomingMsg);
    let matchIdx = -1;

    if (incomingParsed.sender) {
      // Group chat: search backwards for the last message from this sender
      const targetSenderNorm = normalizeNotificationText(incomingParsed.sender);
      for (let i = messages.length - 1; i >= 0; i--) {
        const existingParsed = extractSenderPrefix(messages[i]);
        if (existingParsed.sender && normalizeNotificationText(existingParsed.sender) === targetSenderNorm) {
          matchIdx = i;
          break;
        }
      }
    } else {
      // 1-on-1 chat: search backwards for the last message that is not an inline reply ("You: ...")
      for (let i = messages.length - 1; i >= 0; i--) {
        const existingParsed = extractSenderPrefix(messages[i]);
        if (normalizeNotificationText(existingParsed.sender) !== 'you') {
          matchIdx = i;
          break;
        }
      }
    }

    if (matchIdx !== -1) {
      messages[matchIdx] = incomingMsg;
      return messages;
    }

    // Fallback: if no prior message found from this sender, append as usual
    messages.push(incomingMsg);
    return messages;
  }

  const incomingMedia = parseMediaLine(incomingMsg);

  if (!incomingMedia) {
    messages.push(incomingMsg);
    return messages;
  }

  // Find the last matching media line for the same sender and same media type
  let matchIdx = -1;
  let existingMedia: ParsedMediaLine | null = null;

  for (let i = messages.length - 1; i >= 0; i--) {
    const parsed = parseMediaLine(messages[i]);
    if (
      parsed &&
      parsed.sender.trim().toLowerCase() === incomingMedia.sender.trim().toLowerCase() &&
      parsed.mediaDef.key === incomingMedia.mediaDef.key
    ) {
      matchIdx = i;
      existingMedia = parsed;
      break;
    }
  }

  if (matchIdx !== -1 && existingMedia !== null) {
    let newCount: number;
    if (incomingMedia.count > existingMedia.count) {
      // Cumulative count from WhatsApp Web (e.g. 2 photos -> 3 photos -> 4 photos)
      newCount = incomingMedia.count;
    } else if (incomingMedia.isExplicitCount) {
      // Explicit count arriving <= existing (e.g. subsequent batch arriving)
      newCount = existingMedia.count + incomingMedia.count;
    } else {
      // Single media arriving one by one without explicit count (e.g. Photo after Photo)
      newCount = existingMedia.count + 1;
    }

    const emojiPrefix = existingMedia.emojiPrefix || incomingMedia.emojiPrefix;
    const sender = incomingMedia.sender || existingMedia.sender;
    const updatedLine = formatMediaLine(sender, incomingMedia.mediaDef, newCount, emojiPrefix);

    messages[matchIdx] = updatedLine;
    return messages;
  }

  // First media message from this sender for this media type
  messages.push(incomingMsg);
  return messages;
}

/**
 * Normalizes text for notification deduplication and matching:
 * - Decodes HTML entities
 * - Strips zero-width and directional Unicode control characters
 * - Normalizes quotes and collapses consecutive whitespace
 * - Trims and lowercases
 */
export function normalizeNotificationText(str: string | null | undefined): string {
  if (!str) return '';
  return decodeHtmlEntities(str)
    .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/["“”„‟]/g, '"')
    .replace(/['’‘`´‚‛]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Returns a short badge string for an account (emoji if defined, otherwise account name).
 */
export function formatAccountBadge(account: { emoji?: string; name?: string }): string {
  if (account.emoji && account.emoji.trim()) {
    return account.emoji.trim();
  }
  if (account.name && account.name.trim()) {
    return account.name.trim();
  }
  return '';
}

/**
 * Formats a coalesced notification title with all receiving account badges placed before ` | `:
 * e.g. "🏢 👥 | General" or "🏢 | General"
 * If accountOrder is provided, accounts are ordered according to the configured order in state.
 */
export function formatCoalescedNotificationTitle(
  accounts: Array<{ id?: string; accountId?: string; emoji?: string; name?: string }>,
  chatTitle: string,
  accountOrder?: string[]
): string {
  const cleanTitle = decodeHtmlEntities(chatTitle || '').trim();
  if (!accounts || accounts.length === 0) {
    return cleanTitle ? `| ${cleanTitle}` : '';
  }

  // Deduplicate accounts by ID
  const uniqueAccounts: Array<{ id?: string; accountId?: string; emoji?: string; name?: string }> = [];
  const seenIds = new Set<string>();

  for (const acc of accounts) {
    const id = acc.accountId || acc.id;
    if (id) {
      if (seenIds.has(id)) continue;
      seenIds.add(id);
    }
    uniqueAccounts.push(acc);
  }

  // Sort by configured accountOrder if provided
  if (accountOrder && accountOrder.length > 0) {
    uniqueAccounts.sort((a, b) => {
      const idA = a.accountId || a.id || '';
      const idB = b.accountId || b.id || '';
      const idxA = accountOrder.indexOf(idA);
      const idxB = accountOrder.indexOf(idB);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return 0;
    });
  }

  const badges = uniqueAccounts.map(formatAccountBadge).filter(Boolean);

  if (badges.length === 0) {
    return `| ${cleanTitle}`;
  }

  return `${badges.join(' ')} | ${cleanTitle}`;
}

/**
 * Checks whether two notification payloads represent the exact same incoming message
 * based on chat title, sender & message body, and JID tags.
 */
export function isSameNotificationMessage(
  a: { title?: string; contactName?: string; body: string; tag?: string },
  b: { title?: string; contactName?: string; body: string; tag?: string }
): boolean {
  const chatA = normalizeNotificationText(a.contactName || a.title);
  const chatB = normalizeNotificationText(b.contactName || b.title);
  if (!chatA || !chatB || chatA !== chatB) {
    return false;
  }

  const bodyA = normalizeNotificationText(a.body);
  const bodyB = normalizeNotificationText(b.body);
  if (!bodyA || !bodyB || bodyA !== bodyB) {
    return false;
  }

  // If both tags are WhatsApp JIDs, verify they match
  const isJidRegex = /@(?:g\.us|c\.us|s\.whatsapp\.net|newsletter|broadcast)$/i;
  if (a.tag && b.tag && isJidRegex.test(a.tag) && isJidRegex.test(b.tag)) {
    if (a.tag.trim().toLowerCase() !== b.tag.trim().toLowerCase()) {
      return false;
    }
  }

  return true;
}

/**
 * Resolves the focused account if it is in the coalesced accounts list,
 * or falls back to the account appearing first in the configured account list.
 */
export function getFocusedOrFirstInListAccount<T extends { accountId?: string; id?: string }>(
  accounts: T[],
  activeAccountId?: string,
  accountOrder?: string[]
): T | undefined {
  if (!accounts || accounts.length === 0) return undefined;

  // 1. If currently focused account is among the coalesced accounts, choose it
  if (activeAccountId) {
    const active = accounts.find((a) => (a.accountId || a.id) === activeAccountId);
    if (active) return active;
  }

  // 2. Otherwise, pick the account that appears earliest in the configured account list
  if (accountOrder && accountOrder.length > 0) {
    for (const id of accountOrder) {
      const match = accounts.find((a) => (a.accountId || a.id) === id);
      if (match) return match;
    }
  }

  // 3. Fallback to the first account in the array
  return accounts[0];
}


