import './types';
import { norm, isChatOpen } from './chatNavigation';

export const activeNotificationCallbacks = new Map<string, () => void>();

let OriginalNotification: typeof Notification | null = typeof window !== 'undefined' && window.Notification ? window.Notification : null;

function isReadOnlyChat(tag: string, title: string, opts: any): boolean {
  // 1. WhatsApp Channels & Broadcast lists are strictly one-way for followers
  if (tag && (tag.endsWith('@newsletter') || tag.endsWith('@broadcast'))) {
    return true;
  }

  // 2. Direct 1:1 chats (@c.us / @s.whatsapp.net) are never announcement groups
  if (tag && (tag.endsWith('@c.us') || tag.endsWith('@s.whatsapp.net'))) {
    return false;
  }

  // 3. Options metadata check for announcement restrictions
  if (opts && opts.data) {
    const d = opts.data;
    if (d.readOnly === true || d.isReadOnly === true) return true;
    if (d.chat && (d.chat.readOnly === true || d.chat.isReadOnly === true)) return true;
    if (d.chat && d.chat.groupMetadata && d.chat.groupMetadata.announce && d.chat.groupMetadata.canSend === false) {
      return true;
    }
  }

  // 4. WhatsApp Web internal store check
  try {
    let chatCollection: any = null;
    if (typeof (window as any).require === 'function') {
      try {
        const mod = (window as any).require('WAWebChatCollection');
        chatCollection = mod ? (mod.ChatCollection || mod.default) : null;
      } catch (e) {}
    }
    if (!chatCollection && (window as any).Store && (window as any).Store.Chat) {
      chatCollection = (window as any).Store.Chat;
    }

    if (chatCollection) {
      let chat: any = null;
      if (tag && typeof chatCollection.get === 'function') {
        chat = chatCollection.get(tag);
      }
      if (!chat && chatCollection.models && Array.isArray(chatCollection.models)) {
        const normTitle = (title || '').trim().toLowerCase();
        chat = chatCollection.models.find((c: any) => {
          if (tag && c.id && (c.id._serialized === tag || c.id === tag)) return true;
          const cName = (c.name || c.formattedTitle || '').trim().toLowerCase();
          return cName && normTitle && cName === normTitle;
        });
      }

      if (chat) {
        if (chat.groupMetadata && chat.groupMetadata.announce) {
          if (chat.groupMetadata.canSend === false || chat.groupMetadata.isSenderAnAdmin === false) {
            return true;
          }
        }
      }
    }
  } catch (e) {}

  // 5. Active DOM check: only if an explicit admin restriction lock banner is displayed
  try {
    const activeHeader = document.querySelector('header span[title]');
    if (activeHeader && title && activeHeader.textContent?.trim().toLowerCase() === title.trim().toLowerCase()) {
      const lockBanner = document.querySelector('footer [data-icon="lock"], footer [data-icon="channel"], div[data-testid="conversation-footer-banner"]');
      if (lockBanner) {
        return true;
      }
    }
  } catch (e) {}

  return false;
}

export class CustomNotification extends EventTarget {
  title: string;
  body: string;
  icon: string;
  tag: string;
  data: any;
  onclick: (() => void) | null = null;
  onshow: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(title: string, options: any = {}) {
    super();
    this.title = title;
    this.body = options.body || '';
    this.icon = options.icon || '';
    this.tag = options.tag || 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    this.data = options.data;

    if (this.tag) {
      activeNotificationCallbacks.set(this.tag, () => {
        if (this.onclick) this.onclick();
        this.dispatchEvent(new Event('click'));
      });
    }

    const isReadOnly = isReadOnlyChat(this.tag, this.title, options);
    const canReply = !isReadOnly;

    if (window.__walinux_ipc) {
      window.__walinux_ipc.createNotification({
        title: this.title,
        body: this.body,
        icon: this.icon,
        tag: this.tag,
        canReply: canReply,
      });
    }

    setTimeout(() => {
      if (this.onshow) this.onshow();
      this.dispatchEvent(new Event('show'));
    }, 50);
  }

  close() {
    if (this.title && window.__walinux_ipc && window.__walinux_ipc.dismissChat) {
      if (isChatOpen(norm(this.title))) {
        window.__walinux_ipc.dismissChat({ tag: this.tag, contactName: this.title });
      }
    }
    setTimeout(() => {
      activeNotificationCallbacks.delete(this.tag);
    }, 120000);
    if (this.onclose) this.onclose();
    this.dispatchEvent(new Event('close'));
  }

  static get permission(): NotificationPermission {
    return OriginalNotification ? OriginalNotification.permission : 'granted';
  }

  static requestPermission(callback?: NotificationPermissionCallback): Promise<NotificationPermission> {
    if (OriginalNotification && typeof OriginalNotification.requestPermission === 'function') {
      return OriginalNotification.requestPermission(callback);
    }
    if (typeof callback === 'function') {
      callback('granted');
    }
    return Promise.resolve('granted' as NotificationPermission);
  }

  static get maxActions(): number {
    return (OriginalNotification as any)?.maxActions || 2;
  }
}

export function initCustomNotification(): void {
  const current = window.Notification;
  if (!current) return;

  if ((current as any) !== CustomNotification) {
    OriginalNotification = current;
    (window as any).Notification = CustomNotification;
  }

  if ((window as any).ServiceWorkerRegistration && (window as any).ServiceWorkerRegistration.prototype) {
    (window as any).ServiceWorkerRegistration.prototype.showNotification = function(title: string, options: any = {}) {
      new CustomNotification(title, options);
      return Promise.resolve();
    };
  }
}

export function initAnchorDownloadHandler(): void {
  if ((window as any).HTMLAnchorElement && (window as any).HTMLAnchorElement.prototype) {
    const originalAnchorClick = (window as any).HTMLAnchorElement.prototype.click;
    (window as any).HTMLAnchorElement.prototype.click = function(this: any) {
      if (this.download && window.__walinux_ipc && window.__walinux_ipc.onAnchorDownload) {
        const filename = this.download;
        const href = this.href;

        if (typeof href === 'string' && href.startsWith('blob:')) {
          fetch(href)
            .then((r) => r.blob())
            .then(async (blob) => {
              const size = blob.size;
              let hash: string | undefined;
              // For files <= 64 MB, compute SHA-256
              if (size <= 64 * 1024 * 1024 && window.crypto && window.crypto.subtle) {
                try {
                  const buf = await blob.arrayBuffer();
                  const hashBuf = await window.crypto.subtle.digest('SHA-256', buf);
                  hash = Array.from(new Uint8Array(hashBuf))
                    .map((b) => b.toString(16).padStart(2, '0'))
                    .join('');
                } catch (e) {}
              }
              window.__walinux_ipc?.onAnchorDownload?.(filename, size, hash);
            })
            .catch(() => {
              window.__walinux_ipc?.onAnchorDownload?.(filename);
            });
        } else {
          window.__walinux_ipc.onAnchorDownload(filename);
        }
      }
      return originalAnchorClick.apply(this, arguments);
    };
  }
}
