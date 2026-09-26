interface Window {
  Notification: any;
  ServiceWorkerRegistration: any;
  HTMLAnchorElement: any;
  Store?: any;
  require?: (module: string) => any;
  __walinux_ipc?: {
    onNotificationClicked: (callback: (data: any) => void) => void;
    onSendInlineReply: (callback: (data: { contactName: string; text: string; tag: string }) => void) => void;
    onAnchorDownload?: (filename: string, size?: number, hash?: string) => void;
    createNotification: (data: any) => void;
    closeNotification: (tag: string) => void;
    dismissChat?: (data: { tag?: string; contactName?: string }) => void;
  };
}

(() => {
  const OriginalNotification = window.Notification;
  if (!OriginalNotification) return;

  const activeNotificationCallbacks = new Map<string, () => void>();

  function norm(s: string | null | undefined): string {
    return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function vis(e: Element | null): boolean {
    if (!e) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function triggerEvents(el: Element | null, types: string[]): void {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    types.forEach((type) => {
      const Ev = type.startsWith('pointer') ? PointerEvent : MouseEvent;
      try {
        el.dispatchEvent(new Ev(type, {
          bubbles: true,
          cancelable: true,
          clientX: cx,
          clientY: cy,
          button: 0,
        }));
      } catch (e) {}
    });
  }

  function getSearchBox(): HTMLElement | null {
    return (
      document.querySelector('[data-testid="chat-list-search"] div[contenteditable="true"]') ||
      document.querySelector('[data-testid="chat-list-search"] input') ||
      document.querySelector('input[aria-label*="Search" i]') ||
      document.querySelector('input[aria-label*="Buscar" i]') ||
      document.querySelector('div[contenteditable="true"][aria-label*="Search" i]') ||
      document.querySelector('div[contenteditable="true"][aria-label*="Buscar" i]') ||
      document.querySelector('input[data-tab="3"]') ||
      document.querySelector('div[contenteditable="true"][data-tab="3"]')
    );
  }

  function getSearchText(el: HTMLElement | null): string {
    if (!el) return '';
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      return (el as HTMLInputElement).value || '';
    }
    return el.textContent || '';
  }

  function setSearchText(el: HTMLElement, val: string): void {
    el.focus();
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      const proto = el.tagName === 'INPUT' ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
      try {
        Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, val);
      } catch (e) {
        (el as HTMLInputElement).value = val;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      try { document.execCommand('selectAll', false, undefined); } catch (e) {}
      if (val) {
        try { document.execCommand('insertText', false, val); } catch (e) {}
      } else {
        try { document.execCommand('delete', false, undefined); } catch (e) {}
        el.textContent = '';
      }
      el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
  }

  function restoreSearchBox(sbox: HTMLElement | null, originalText: string): void {
    if (!sbox) return;
    if (originalText && originalText.trim()) {
      setSearchText(sbox, originalText);
    } else {
      setSearchText(sbox, '');
      try {
        sbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
        sbox.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
      } catch (e) {}

      const cancelIcon = (
        document.querySelector('span[data-icon="x-alt"]') ||
        document.querySelector('span[data-icon="x"]') ||
        document.querySelector('span[data-icon="back"]') ||
        document.querySelector('span[data-icon="arrow-back"]')
      );
      if (cancelIcon) {
        const clickTarget = cancelIcon.closest('button') || cancelIcon;
        triggerEvents(clickTarget, ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);
      } else {
        const cancelBtn = (
          document.querySelector('button[aria-label*="Cancel" i]') ||
          document.querySelector('button[aria-label*="Clear" i]') ||
          document.querySelector('button[aria-label*="Back" i]')
        );
        if (cancelBtn) {
          triggerEvents(cancelBtn, ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);
        }
      }
      try { sbox.blur(); } catch (e) {}
    }
  }

  function isChatOpen(query: string): boolean {
    const headerTitles = Array.from(document.querySelectorAll('header span[title]'));
    for (const el of headerTitles) {
      if (norm(el.getAttribute('title') || el.textContent) === query) {
        return true;
      }
    }
    return false;
  }

  function findMatchingRow(query: string): Element | null {
    const rows = Array.from(document.querySelectorAll(
      '#pane-side [role="row"], #side [role="row"], #pane-side [role="listitem"], #side [role="listitem"], [data-testid="chat-list"] [role="listitem"]'
    )).filter(vis);

    for (const row of rows) {
      const t = row.querySelector('span[title]');
      if (t && norm(t.getAttribute('title') || t.textContent) === query) {
        return row;
      }
    }
    return null;
  }

  function getActiveChatTitle(): string {
    const headerTitles = Array.from(document.querySelectorAll('header span[title]'));
    for (const el of headerTitles) {
      const t = (el.getAttribute('title') || el.textContent || '').trim();
      if (t) return t;
    }
    return '';
  }

  function dismissActiveChat(): void {
    try {
      const currentTitle = getActiveChatTitle();
      if (currentTitle && window.__walinux_ipc && window.__walinux_ipc.dismissChat) {
        window.__walinux_ipc.dismissChat({ contactName: currentTitle });
      }
    } catch (e) {}
  }

  window.addEventListener('focus', () => {
    dismissActiveChat();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      dismissActiveChat();
    }
  });

  document.addEventListener('click', () => {
    setTimeout(dismissActiveChat, 100);
  }, { passive: true });

  document.addEventListener('focusin', (e) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.closest('footer') || target.getAttribute('contenteditable') === 'true')) {
      dismissActiveChat();
    }
  }, { passive: true });

  let lastObservedChatTitle = '';
  let chatHeaderDismissTimer: NodeJS.Timeout | null = null;
  try {
    const chatHeaderObserver = new MutationObserver(() => {
      const t = getActiveChatTitle();
      if (t && t !== lastObservedChatTitle) {
        lastObservedChatTitle = t;
        if (chatHeaderDismissTimer) clearTimeout(chatHeaderDismissTimer);
        chatHeaderDismissTimer = setTimeout(dismissActiveChat, 150);
      }
    });
    chatHeaderObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  } catch (e) {}

  if (window.__walinux_ipc) {
    window.__walinux_ipc.onNotificationClicked((arg: any) => {
      const tag = typeof arg === 'string' ? arg : arg?.tag;
      const contactName = typeof arg === 'object' ? arg?.contactName : '';

      if (window.__walinux_ipc && window.__walinux_ipc.dismissChat) {
        window.__walinux_ipc.dismissChat({ tag, contactName });
      }

      const callback = activeNotificationCallbacks.get(tag);
      if (callback) {
        try { callback(); } catch (e) {}
      }

      if (!contactName) return;

      const targetQuery = norm(contactName);

      // Step 1: Give WhatsApp native notification callback ~400ms to open the chat
      let attempts = 0;
      const checkNativeInterval = setInterval(() => {
        attempts++;
        if (isChatOpen(targetQuery)) {
          clearInterval(checkNativeInterval);
          return;
        }

        // After timeout, check visible sidebar or fall back to search
        if (attempts >= 5) {
          clearInterval(checkNativeInterval);

          const row = findMatchingRow(targetQuery);
          if (row) {
            const clickTarget = row.querySelector('span[title]') || row;
            triggerEvents(clickTarget, ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);
            return;
          }

          // Chat is not in the visible sidebar list (scrolled away or virtualized) -> fallback to search
          const sbox = getSearchBox();
          if (sbox) {
            const prevSearchText = getSearchText(sbox);
            setSearchText(sbox, contactName);

            let searchAttempts = 0;
            const searchPoll = setInterval(() => {
              searchAttempts++;
              const searchedRow = findMatchingRow(targetQuery);
              if (searchedRow) {
                clearInterval(searchPoll);
                const clickTarget = searchedRow.querySelector('span[title]') || searchedRow;
                triggerEvents(clickTarget, ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);

                // Wait for chat to open, then restore search box to previous state
                let openAttempts = 0;
                const openPoll = setInterval(() => {
                  openAttempts++;
                  if (isChatOpen(targetQuery) || openAttempts >= 12) {
                    clearInterval(openPoll);
                    setTimeout(() => {
                      restoreSearchBox(sbox, prevSearchText);
                    }, 150);
                  }
                }, 50);
                return;
              }

              if (searchAttempts > 20) {
                clearInterval(searchPoll);
                restoreSearchBox(sbox, prevSearchText);
              }
            }, 50);
          }
        }
      }, 80);
    });

    window.__walinux_ipc.onSendInlineReply((data: { contactName: string; text: string; tag: string }) => {
      const { contactName, text, tag } = data;

      function getComposer(): HTMLElement | null {
        const candidates = Array.from(document.querySelectorAll(
          'footer div[contenteditable="true"][role="textbox"], div[contenteditable="true"][data-tab="10"], div[contenteditable="true"][data-tab="6"]'
        )).filter(vis) as HTMLElement[];
        return candidates.length ? candidates[candidates.length - 1] : null;
      }

      function getSendButton(): Element | null {
        const icon = (
          document.querySelector('[data-icon="wds-ic-send-filled"]') ||
          document.querySelector('span[data-icon="send"]')
        );
        if (icon) {
          return icon.closest('button, [role="button"]') || icon;
        }
        const candidates = Array.from(document.querySelectorAll(
          'button[aria-label], [role="button"][aria-label]'
        )).filter((x) => /^(send|enviar)/i.test(x.getAttribute('aria-label') || '') && vis(x));
        return candidates.length ? candidates[candidates.length - 1] : null;
      }

      function doSendText(comp: HTMLElement) {
        comp.focus();
        try {
          document.execCommand('selectAll', false, undefined);
          document.execCommand('insertText', false, text);
        } catch (e) {}
        comp.dispatchEvent(new InputEvent('input', { bubbles: true }));

        setTimeout(() => {
          const btn = getSendButton();
          if (btn) {
            triggerEvents(btn, ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);
          }
        }, 150);
      }

      // Step 1: Trigger notification callback if available to open chat immediately
      const notifCallback = activeNotificationCallbacks.get(tag);
      if (notifCallback) {
        try { notifCallback(); } catch (e) {}
      }

      // Step 2: Poll for composer or search
      let attempts = 0;
      let searched = false;
      let prevSearchText = '';
      let sboxEl: HTMLElement | null = null;
      const targetQuery = norm(contactName);

      const interval = setInterval(() => {
        attempts++;
        if (attempts > 50) {
          clearInterval(interval);
          if (searched && sboxEl) {
            restoreSearchBox(sboxEl, prevSearchText);
          }
          return;
        }

        const comp = getComposer();
        if (comp) {
          clearInterval(interval);
          doSendText(comp);
          if (searched && sboxEl) {
            setTimeout(() => {
              restoreSearchBox(sboxEl, prevSearchText);
            }, 300);
          }
          return;
        }

        if (!searched && attempts > 8) {
          const sbox = getSearchBox();
          if (sbox) {
            sboxEl = sbox;
            prevSearchText = getSearchText(sbox);
            setSearchText(sbox, contactName);
            searched = true;
          }
        }

        if (searched) {
          const row = findMatchingRow(targetQuery);
          if (row) {
            const clickTarget = row.querySelector('span[title]') || row;
            triggerEvents(clickTarget, ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);
          }
        }
      }, 100);
    });
  }

  class CustomNotification extends EventTarget {
    title: string;
    body: string;
    icon: string;
    tag: string;
    onclick: (() => void) | null = null;
    onshow: (() => void) | null = null;
    onclose: (() => void) | null = null;

    constructor(title: string, options: any = {}) {
      super();
      this.title = title;
      this.body = options.body || '';
      this.icon = options.icon || '';
      this.tag = options.tag || 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);

      if (this.tag) {
        activeNotificationCallbacks.set(this.tag, () => {
          if (this.onclick) this.onclick();
          this.dispatchEvent(new Event('click'));
        });
      }

      function isReadOnlyChat(tag: string, title: string, opts: any) {
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

    static get permission() {
      return OriginalNotification.permission;
    }

    static requestPermission(callback?: NotificationPermissionCallback) {
      return OriginalNotification.requestPermission(callback);
    }
  }

  (window as any).Notification = CustomNotification;

  if ((window as any).ServiceWorkerRegistration && (window as any).ServiceWorkerRegistration.prototype) {
    (window as any).ServiceWorkerRegistration.prototype.showNotification = function(title: string, options: any = {}) {
      new CustomNotification(title, options);
      return Promise.resolve();
    };
  }

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
})();
