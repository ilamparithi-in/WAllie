/**
 * Utility functions for formatting and sanitizing notification text
 * across Linux desktop environments (Freedesktop D-Bus), Electron native popups,
 * and renderer history views.
 */

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
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
        try {
          return String.fromCodePoint(parseInt(hex, 16));
        } catch {
          return '';
        }
      })
      .replace(/&#(\d+);/g, (_, dec) => {
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
  return str.replace(/<[^>]*>/g, '');
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
  text = text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
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
  const SAFE_TAG_REGEX = /<\/?(b|i|u|s|strike|tt|code|br)\b[^>]*>/gi;
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
  text = text.replace(/\uE000(\d+)\uE001/g, (_, idx) => {
    let tag = placeholders[parseInt(idx, 10)];
    if (tag.startsWith('<strike')) tag = '<s>';
    else if (tag.startsWith('</strike')) tag = '</s>';
    else if (tag.startsWith('<code')) tag = '<tt>';
    else if (tag.startsWith('</code')) tag = '</tt>';
    else if (tag.startsWith('<br')) tag = '<br/>';
    return tag;
  });

  // WhatsApp formatting:
  // 1. Monospace code block ```...```
  text = text.replace(/```([\s\S]+?)```/g, '<tt>$1</tt>');
  // 2. Inline code `...`
  text = text.replace(/`([^`\n]+)`/g, '<tt>$1</tt>');
  // 3. Bold *...*
  text = text.replace(/(^|[\s\p{P}\p{S}])\*([^\s*](?:[\s\S]*?[^\s*])?)\*(?=[\s\p{P}\p{S}]|$)/gu, '$1<b>$2</b>');
  // 4. Italic _..._
  text = text.replace(/(^|[\s\p{P}\p{S}])_([^\s_](?:[\s\S]*?[^\s_])?)_(?=[\s\p{P}\p{S}]|$)/gu, '$1<i>$2</i>');
  // 5. Strikethrough ~...~
  text = text.replace(/(^|[\s\p{P}\p{S}])~([^\s~](?:[\s\S]*?[^\s~])?)~(?=[\s\p{P}\p{S}]|$)/gu, '$1<s>$2</s>');

  return text;
}

/**
 * Strips markup for notification providers that do not support markup (e.g. standard Electron native popups).
 */
export function stripNotificationMarkup(rawBody: string, maxLength = 4096): string {
  if (!rawBody) return '';
  let text = decodeHtmlEntities(rawBody.trim());
  text = text.replace(/<br\s*\/?>/gi, '\n');
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
  const regex = /```([\s\S]+?)```|`([^`\n]+)`|(?<=^|[\s\p{P}\p{S}])\*([^\s*](?:[\s\S]*?[^\s*])?)\*(?=[\s\p{P}\p{S}]|$)|(?<=^|[\s\p{P}\p{S}])_([^\s_](?:[\s\S]*?[^\s_])?)_(?=[\s\p{P}\p{S}]|$)|(?<=^|[\s\p{P}\p{S}])~([^\s~](?:[\s\S]*?[^\s~])?)~(?=[\s\p{P}\p{S}]|$)/gu;

  const tokens: FormattedToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    if (match[1] !== undefined) tokens.push({ type: 'codeblock', value: match[1] });
    else if (match[2] !== undefined) tokens.push({ type: 'code', value: match[2] });
    else if (match[3] !== undefined) tokens.push({ type: 'bold', value: match[3] });
    else if (match[4] !== undefined) tokens.push({ type: 'italic', value: match[4] });
    else if (match[5] !== undefined) tokens.push({ type: 'strike', value: match[5] });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return tokens;
}

