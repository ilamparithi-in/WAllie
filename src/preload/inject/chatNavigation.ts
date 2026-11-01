import './types';

export function norm(s: string | null | undefined): string {
  return (s || '')
    .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/['"’‘`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function vis(e: Element | null): boolean {
  if (!e) return false;
  const r = e.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

export function triggerEvents(el: Element | null, types: string[]): void {
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

export function clickChatRow(row: Element): void {
  const clickTarget = (
    row.querySelector('[data-testid="cell-frame-title"]') ||
    row.querySelector('span[title]') ||
    row
  );
  triggerEvents(clickTarget, ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);
  if (typeof (clickTarget as any).click === 'function') {
    try { (clickTarget as any).click(); } catch (e) {}
  }
}

export function getSearchBox(): HTMLElement | null {
  // 1. Modern WhatsApp Web search container input
  const modernSearchInput = document.querySelector<HTMLElement>(
    '[data-testid="chat-list-search-container"] input, [data-testid="chat-list-search-container"] [contenteditable="true"]'
  );
  if (modernSearchInput && vis(modernSearchInput)) return modernSearchInput;

  // 2. Legacy / alternate testid containers
  const altSearchInput = document.querySelector<HTMLElement>(
    '[data-testid="chat-list-search"] input, [data-testid="chat-list-search"] [contenteditable="true"], [data-testid*="search"] input'
  );
  if (altSearchInput && vis(altSearchInput)) return altSearchInput;

  // 3. WhatsApp tab navigation convention (tab 3 is chat list search)
  const tab3Input = document.querySelector<HTMLElement>(
    '#side input[data-tab="3"], input[data-tab="3"], #side [role="textbox"][data-tab="3"], [data-tab="3"][role="textbox"]'
  );
  if (tab3Input && vis(tab3Input)) return tab3Input;

  // 4. Sidebar text input
  const sidebarInput = document.querySelector<HTMLElement>(
    '#side input[type="text"], #side input:not([type="checkbox"]):not([type="radio"]), #pane-side ~ * input'
  );
  if (sidebarInput && vis(sidebarInput)) return sidebarInput;

  // 5. Semantic / accessibility role fallback
  const roleSearchInput = document.querySelector<HTMLElement>(
    '[role="search"] input, [role="search"] [contenteditable="true"]'
  );
  if (roleSearchInput && vis(roleSearchInput)) return roleSearchInput;

  // 6. Multilingual placeholder / aria-label regex fallback
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('input[type="text"], input:not([type]), [role="textbox"]')).filter(vis);
  for (const c of candidates) {
    const label = (c.getAttribute('aria-label') || c.getAttribute('placeholder') || '').toLowerCase();
    if (/search|buscar|cerca|recherch|pesquis|suche|поиск|खोज/i.test(label) && !c.closest('footer') && !c.closest('#main')) {
      return c;
    }
  }

  return null;
}

export function getSearchText(el: HTMLElement | null): string {
  if (!el) return '';
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    return (el as HTMLInputElement).value || '';
  }
  return el.textContent || '';
}

export function setSearchText(el: HTMLElement, val: string): void {
  el.focus();
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    const inputEl = el as HTMLInputElement;
    const proto = el.tagName === 'INPUT' ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;

    // Reset React internal valueTracker so synthetic change detection reliably fires
    const tracker = (inputEl as any)._valueTracker;
    if (tracker) {
      tracker.setValue(val === '' ? ' ' : '');
    }

    try {
      Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(inputEl, val);
    } catch (e) {
      inputEl.value = val;
    }
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
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

export function restoreSearchBox(sbox: HTMLElement | null, originalText: string): void {
  if (!sbox) return;
  if (originalText && originalText.trim()) {
    setSearchText(sbox, originalText);
    return;
  }

  // Cleanly revert the search UI to the normal chat list view
  const container = (
    sbox.closest('[data-testid*="search"]') ||
    sbox.closest('#side') ||
    sbox.parentElement?.parentElement ||
    document.getElementById('side') ||
    document
  );

  // 1. Locate close / clear icon button in the search container
  let clearBtn: HTMLElement | null = null;
  const buttons = Array.from(container.querySelectorAll<HTMLElement>('button, [role="button"]')).filter(vis);
  for (const btn of buttons) {
    const svgTitle = (btn.querySelector('title')?.textContent || '').toLowerCase();
    if (svgTitle.includes('close') || svgTitle.includes('cancel') || svgTitle.includes('clear')) {
      clearBtn = btn;
      break;
    }
    const label = (btn.getAttribute('aria-label') || '').toLowerCase();
    if (label === 'end icon button' || /\b(cancel|clear|close|cerrar|cancelar)\b/i.test(label)) {
      clearBtn = btn;
      break;
    }
  }

  if (!clearBtn) {
    const legacyIcon = container.querySelector(
      'span[data-icon="x-alt"], span[data-icon="x"]'
    );
    if (legacyIcon) {
      clearBtn = (legacyIcon.closest('button, [role="button"]') || legacyIcon) as HTMLElement;
    }
  }

  if (clearBtn) {
    triggerEvents(clearBtn, ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);
    if (typeof (clearBtn as any).click === 'function') {
      try { (clearBtn as any).click(); } catch (e) {}
    }
  } else {
    setSearchText(sbox, '');
  }

  // 2. Dispatch non-bubbling Escape to the search box itself only to dismiss local autocomplete/dropdown
  try {
    sbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: false }));
    sbox.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: false }));
  } catch (e) {}

  // 3. Remove focus so cursor doesn't remain in search box
  try {
    sbox.blur();
  } catch (e) {}

  // 4. Verify search text was emptied
  setTimeout(() => {
    if (sbox && getSearchText(sbox).length > 0) {
      setSearchText(sbox, '');
    }
  }, 100);
}

export function getActiveChatTitle(): string {
  // 1. Modern WhatsApp Web dedicated conversation header title element
  const titleEl = (
    document.querySelector('[data-testid="conversation-info-header-chat-title"]') ||
    document.querySelector('#main header [data-testid*="chat-title"]') ||
    document.querySelector('[data-testid="conversation-info-header"] [dir="auto"]') ||
    document.querySelector('#main header div[role="button"] span[dir="auto"]')
  );
  if (titleEl) {
    const t = (titleEl.getAttribute('title') || titleEl.textContent || '').trim();
    if (t) return t;
  }

  // 2. Fallback: inspect spans in the active conversation header, skipping subtitle / participants
  const mainHeader = document.querySelector('#main header, [data-testid="conversation-header"]');
  if (mainHeader) {
    const spans = Array.from(mainHeader.querySelectorAll('div[role="button"] span[title], span[title]'));
    for (const el of spans) {
      if (el.closest('[data-testid="chat-subtitle"]')) continue;
      const t = (el.getAttribute('title') || el.textContent || '').trim();
      if (t) return t;
    }
  }

  return '';
}

export function isChatOpen(query: string): boolean {
  if (!query) return false;
  const active = norm(getActiveChatTitle());
  if (!active) return false;
  return active === query || active.includes(query) || query.includes(active);
}

export function findMatchingRow(query: string): Element | null {
  if (!query) return null;
  const rows = Array.from(document.querySelectorAll(
    '#pane-side [role="row"], [data-testid^="list-item-"], #pane-side [role="listitem"], #side [role="row"], [data-testid="cell-frame-container"]'
  )).filter(vis);

  for (const row of rows) {
    const titleSpan = (
      row.querySelector('[data-testid="cell-frame-title"] span[title]') ||
      row.querySelector('[data-testid="cell-frame-title"]') ||
      row.querySelector('span[title]')
    );
    if (titleSpan) {
      const rawTitle = titleSpan.getAttribute('title') || titleSpan.textContent || '';
      const rowNorm = norm(rawTitle);
      if (rowNorm === query || rowNorm.includes(query) || query.includes(rowNorm)) {
        return row;
      }
    }
  }
  return null;
}

export function dismissActiveChat(): void {
  try {
    const currentTitle = getActiveChatTitle();
    if (currentTitle && window.__walinux_ipc && window.__walinux_ipc.dismissChat) {
      window.__walinux_ipc.dismissChat({ contactName: currentTitle });
    }
  } catch (e) {}
}

export function initChatNavigation(activeNotificationCallbacks: Map<string, () => void>): void {
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
  let chatHeaderDismissTimer: ReturnType<typeof setTimeout> | null = null;
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

      // Fast path: if the chat is already open, nothing more needed!
      if (isChatOpen(targetQuery)) {
        dismissActiveChat();
        return;
      }

      // Step 1: Give WhatsApp native notification callback a quick chance (~200ms) to open the chat
      let attempts = 0;
      const checkNativeInterval = setInterval(() => {
        attempts++;
        if (isChatOpen(targetQuery)) {
          clearInterval(checkNativeInterval);
          dismissActiveChat();
          return;
        }

        if (attempts >= 4) {
          clearInterval(checkNativeInterval);

          // Step 2: Check if chat row is visible in sidebar without searching
          const row = findMatchingRow(targetQuery);
          if (row) {
            clickChatRow(row);
            let waitOpenAttempts = 0;
            const waitOpen = setInterval(() => {
              waitOpenAttempts++;
              if (isChatOpen(targetQuery) || waitOpenAttempts >= 10) {
                clearInterval(waitOpen);
                dismissActiveChat();
              }
            }, 50);
            return;
          }

          // Step 3: Chat is not visible in viewport -> fallback to search
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
                clickChatRow(searchedRow);

                // Wait for chat to open, then restore search box to previous state
                let openAttempts = 0;
                const openPoll = setInterval(() => {
                  openAttempts++;
                  if (isChatOpen(targetQuery) || openAttempts >= 15) {
                    clearInterval(openPoll);
                    dismissActiveChat();
                    setTimeout(() => {
                      restoreSearchBox(sbox, prevSearchText);
                    }, 120);
                  }
                }, 50);
                return;
              }

              if (searchAttempts > 25) {
                clearInterval(searchPoll);
                restoreSearchBox(sbox, prevSearchText);
              }
            }, 50);
          }
        }
      }, 50);
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
        const footer = document.querySelector('footer, #main footer');
        const scope = footer || document;
        const icon = (
          scope.querySelector('[data-icon="wds-ic-send-filled"]') ||
          scope.querySelector('span[data-icon="send"]') ||
          scope.querySelector('[data-icon*="send"]')
        );
        if (icon) {
          return icon.closest('button, [role="button"]') || icon;
        }
        const buttons = Array.from(scope.querySelectorAll('button, [role="button"]')).filter(vis);
        for (const btn of buttons) {
          const svgTitle = (btn.querySelector('title')?.textContent || '').toLowerCase();
          if (svgTitle.includes('send')) return btn;
          const label = (btn.getAttribute('aria-label') || '').toLowerCase();
          if (label.includes('feedback')) continue;
          if (/^(send|enviar)\b/i.test(label)) return btn;
        }
        return null;
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
            if (typeof (btn as any).click === 'function') {
              try { (btn as any).click(); } catch (e) {}
            }
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

      // Fast check if composer is already available for this contact
      if (isChatOpen(targetQuery)) {
        const directComp = getComposer();
        if (directComp) {
          doSendText(directComp);
          return;
        }
      }

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
        if (comp && isChatOpen(targetQuery)) {
          clearInterval(interval);
          doSendText(comp);
          if (searched && sboxEl) {
            setTimeout(() => {
              restoreSearchBox(sboxEl, prevSearchText);
            }, 300);
          }
          return;
        }

        if (!searched && attempts > 4) {
          // Check sidebar before resorting to search
          const row = findMatchingRow(targetQuery);
          if (row) {
            clickChatRow(row);
          } else {
            const sbox = getSearchBox();
            if (sbox) {
              sboxEl = sbox;
              prevSearchText = getSearchText(sbox);
              setSearchText(sbox, contactName);
              searched = true;
            }
          }
        }

        if (searched) {
          const row = findMatchingRow(targetQuery);
          if (row) {
            clickChatRow(row);
          }
        }
      }, 100);
    });
  }
}
