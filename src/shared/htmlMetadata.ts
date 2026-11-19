import { decodeHtmlEntities } from './notificationFormatting.ts';

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extracts the content of an HTML <meta> tag for a given property or name.
 * Robustly handles double-quoted, single-quoted, and unquoted attributes,
 * and ensures apostrophes/quotes inside content don't prematurely truncate parsing.
 */
export function extractMetaContent(html: string, propertyName: string, isName = false): string | null {
  const attr = isName ? 'name' : 'property';
  const escapedProp = escapeRegex(propertyName);

  // Pattern 1: <meta ... attr="propertyName" ... content="value" ...>
  const r1 = new RegExp(
    `<meta\\s+[^>]*?\\b${attr}\\s*=\\s*(?:["']${escapedProp}["']|${escapedProp}(?=[\\s>]))[^>]*?\\bcontent\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i'
  );
  const m1 = html.match(r1);
  if (m1) {
    const val = m1[1] !== undefined ? m1[1] : (m1[2] !== undefined ? m1[2] : m1[3]);
    if (val !== undefined && val.trim()) return decodeHtmlEntities(val.trim());
  }

  // Pattern 2: <meta ... content="value" ... attr="propertyName" ...>
  const r2 = new RegExp(
    `<meta\\s+[^>]*?\\bcontent\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))[^>]*?\\b${attr}\\s*=\\s*(?:["']${escapedProp}["']|${escapedProp}(?=[\\s>]))`,
    'i'
  );
  const m2 = html.match(r2);
  if (m2) {
    const val = m2[1] !== undefined ? m2[1] : (m2[2] !== undefined ? m2[2] : m2[3]);
    if (val !== undefined && val.trim()) return decodeHtmlEntities(val.trim());
  }

  return null;
}

/**
 * Extracts the href from an HTML <link> tag for a given rel value.
 */
export function extractLinkHref(html: string, relType: string): string | null {
  const escapedRel = escapeRegex(relType);

  // Pattern 1: <link ... rel="relType" ... href="value" ...>
  const r1 = new RegExp(
    `<link\\s+[^>]*?\\brel\\s*=\\s*["'][^"']*?${escapedRel}[^"']*?["'][^>]*?\\bhref\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i'
  );
  const m1 = html.match(r1);
  if (m1) {
    const val = m1[1] !== undefined ? m1[1] : (m1[2] !== undefined ? m1[2] : m1[3]);
    if (val !== undefined && val.trim()) return decodeHtmlEntities(val.trim());
  }

  // Pattern 2: <link ... href="value" ... rel="relType" ...>
  const r2 = new RegExp(
    `<link\\s+[^>]*?\\bhref\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))[^>]*?\\brel\\s*=\\s*["'][^"']*?${escapedRel}[^"']*?["']`,
    'i'
  );
  const m2 = html.match(r2);
  if (m2) {
    const val = m2[1] !== undefined ? m2[1] : (m2[2] !== undefined ? m2[2] : m2[3]);
    if (val !== undefined && val.trim()) return decodeHtmlEntities(val.trim());
  }

  return null;
}

/**
 * Extracts text inside <title>...</title> tags.
 */
export function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m && m[1] ? decodeHtmlEntities(m[1].trim()) : null;
}
