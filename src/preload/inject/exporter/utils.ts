/**
 * Exporter utilities for DOM operations, string normalization, and collections retrieval.
 */

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Yields execution to the browser event loop to avoid locking the UI thread
 * during computationally heavy or long-running DOM/model scraping loops.
 */
export const yieldToEventLoop = (): Promise<void> =>
  new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 30 });
    } else {
      setTimeout(resolve, 0);
    }
  });

/**
 * Normalizes strings for robust matching.
 */
export function norm(s: string | null | undefined): string {
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
export function getCollection(name: string): any {
  try {
    return (window as any).require?.(name);
  } catch {
    return null;
  }
}

/**
 * Resolves a raw JID, LID, or phone number to a friendly contact formatted name.
 */
export function resolveContactName(jidOrLid: any): string {
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
  } catch { }
  return clean || s;
}

/**
 * Builds a Member Labels lookup map for the given group.
 */
export function getMemberLabelsMap(groupJid: string): Record<string, string> {
  const map: Record<string, string> = {};
  try {
    const MemberLabelCollection = getCollection('WAWebMemberLabelCollection')?.MemberLabelCollection;
    if (!MemberLabelCollection) return map;

    const models = MemberLabelCollection.getModelsArray ? MemberLabelCollection.getModelsArray() : [];
    for (const m of models) {
      const id = String(m.id || '');
      if (id.startsWith(groupJid) && m.__x_label) {
        const parts = id.split('_');
        if (parts.length > 1) {
          map[parts[1]] = String(m.__x_label);
        }
      }
    }
  } catch { }
  return map;
}

/**
 * Safely dismisses any open WhatsApp Web context menu or backdrop without sending
 * a global Escape keyboard event to document, which would close the active chat conversation.
 */
export function dismissContextMenuSafely(): void {
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
 * Dispatches trusted native mouse clicks or clean pointer/mouse event lifecycle
 * to guarantee that interactive WhatsApp Web components receive and process the click.
 */
export async function clickElementThoroughly(el: HTMLElement): Promise<void> {
  try {
    el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    await sleep(40);
    const rect = el.getBoundingClientRect();
    const cx = Math.floor(rect.left + rect.width / 2);
    const cy = Math.floor(rect.top + rect.height / 2);

    if (
      (window as any).__wallie_ipc?.dispatchMouse &&
      cx > 0 &&
      cy > 0 &&
      cx < window.innerWidth &&
      cy < window.innerHeight
    ) {
      const ok = await (window as any).__wallie_ipc.dispatchMouse('click', cx, cy);
      if (ok) return;
    }

    const mouseOpts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };
    el.dispatchEvent(new PointerEvent('pointerdown', mouseOpts));
    el.dispatchEvent(new PointerEvent('pointerup', mouseOpts));
    el.dispatchEvent(new MouseEvent('click', mouseOpts));
    if (typeof el.click === 'function') {
      try { el.click(); } catch { }
    }
  } catch {
    try { el.click(); } catch { }
  }
}

/**
 * Extracts binary ArrayBuffer from a media DOM element (img, video, audio)
 * supporting blob: URLs, https: CDN URLs, and data: URIs.
 */
export async function extractBufferFromMediaElement(el: HTMLMediaElement | HTMLImageElement): Promise<ArrayBuffer | null> {
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
 * Sanitizes filename strings for safe cross-platform filesystem use.
 * Strips directory traversal sequences, reserved names, and illegal characters.
 */
export function sanitizeExportFilename(name: string): string {
  let sanitized = (name || 'WhatsApp-Chat')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\.{2,}/g, '_')
    .replace(/^[\.\s]+|[\.\s]+$/g, '')
    .trim()
    .slice(0, 100);

  if (
    !sanitized ||
    sanitized === '.' ||
    sanitized === '..' ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(sanitized)
  ) {
    sanitized = 'WhatsApp-Chat';
  }
  return sanitized;
}

export function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

