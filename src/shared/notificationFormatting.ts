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

