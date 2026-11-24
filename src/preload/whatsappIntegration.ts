const { contextBridge, ipcRenderer, webFrame } = require('electron');
import { setupCallDetection } from './callDetection';
import { showGuestToast } from './toast';
import { VISUAL_ZOOM_MIN, VISUAL_ZOOM_MAX } from '../shared/constants';

const WHATSAPP_DOMAIN_REGEX = /^([^.\s]+\.)*whatsapp\.(com|net)$/i;

async function resolveIconToBase64(url: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  try {
    const parsedUrl = new URL(url);
    const isWhatsApp = WHATSAPP_DOMAIN_REGEX.test(parsedUrl.hostname);
    if (!isWhatsApp) {
      console.warn('Blocked non-WhatsApp avatar URL:', parsedUrl.hostname);
      return null;
    }
  } catch {
    return null;
  }
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error('Failed to resolve avatar to base64:', err);
    return null;
  }
}

const onClickCallbacks = new Set<(data: any) => void>();
let onInlineReplyCallback: ((data: { contactName: string; text: string; tag: string }) => void) | null = null;

export function setupWhatsAppIntegration(mainWorldScript: string): void {
  setupCallDetection();

  // Synchronize theme with host system / app settings
  function applyThemeToWhatsApp(shouldUseDarkColors: boolean) {
    try {
      const isDark = shouldUseDarkColors;
      const body = document.body;
      if (!body) return;

      let localTheme: string | null = null;
      try {
        const raw = localStorage.getItem('theme');
        if (raw) {
          localTheme = JSON.parse(raw);
        }
      } catch {
        localTheme = localStorage.getItem('theme');
      }

      if (!localTheme || localTheme === 'system') {
        if (isDark) {
          body.classList.add('dark');
        } else {
          body.classList.remove('dark');
        }
      }
    } catch (e) {
      console.error('[wallie] Failed to apply theme to WhatsApp Web:', e);
    }
  }

  ipcRenderer.on('theme:changed', (_event: any, data: { shouldUseDarkColors: boolean }) => {
    if (data && typeof data.shouldUseDarkColors === 'boolean') {
      applyThemeToWhatsApp(data.shouldUseDarkColors);
    }
  });

  const handleInitialTheme = () => {
    ipcRenderer.invoke('theme:get-current').then((info: any) => {
      if (info && typeof info.shouldUseDarkColors === 'boolean') {
        applyThemeToWhatsApp(info.shouldUseDarkColors);
      }
    }).catch(() => {});
  };

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', handleInitialTheme, { once: true });
  } else {
    handleInitialTheme();
  }

  // In-app toast notification listener
  ipcRenderer.on('toast:show', (_event: any, data: { message: string; url?: string }) => {
    if (data && data.message) {
      showGuestToast(data.message, data.url);
    }
  });

  // Light dismiss on webview click
  window.addEventListener('click', () => {
    ipcRenderer.send('webview:clicked');
  });

  function extractFilenameFromMessage(container: Element): string {
    const titleElements = container.querySelectorAll('[title]');
    for (const el of Array.from(titleElements)) {
      const rawTitle = (el.getAttribute('title') || '').trim();
      const match = rawTitle.match(/(?:(?:Download|View)\s+["“']?)?([^"”'\n\r]+\.[a-z0-9]{2,6})["”']?/i);
      if (match && match[1]) {
        const cleaned = match[1].trim();
        const lower = cleaned.toLowerCase();
        if (cleaned && !lower.startsWith('download') && !lower.startsWith('view')) {
          return cleaned;
        }
      }
    }

    const leafElements = container.querySelectorAll('span, div, p');
    for (const el of Array.from(leafElements)) {
      if (el.children.length === 0) {
        const text = (el.textContent || '').trim();
        if (/\.[a-z0-9]{2,6}$/i.test(text)) {
          return text;
        }
      }
    }

    const fallbackEl = container.querySelector('span[title], div[title]');
    const rawFallback = (fallbackEl?.getAttribute('title') || fallbackEl?.textContent || '').trim();
    return rawFallback.replace(/^(?:Download|View)\s+["“']?/i, '').replace(/["”']?$/i, '').trim();
  }

  function parseSizeToBytes(sizeStr: string): number | undefined {
    const match = sizeStr.trim().match(/^([\d.]+)\s*(B|kB|KB|MB|GB|TB)$/i);
    if (!match) return undefined;
    const num = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    if (isNaN(num)) return undefined;
    switch (unit) {
      case 'B': return Math.round(num);
      case 'KB': return Math.round(num * 1024);
      case 'MB': return Math.round(num * 1024 * 1024);
      case 'GB': return Math.round(num * 1024 * 1024 * 1024);
      case 'TB': return Math.round(num * 1024 * 1024 * 1024 * 1024);
      default: return undefined;
    }
  }

  function extractFileSizeFromMessage(container: Element): number | undefined {
    const elements = container.querySelectorAll('[title], span, div');
    for (const el of Array.from(elements)) {
      const title = (el.getAttribute('title') || '').trim();
      const fromTitle = parseSizeToBytes(title);
      if (fromTitle !== undefined) return fromTitle;

      if (el.children.length === 0) {
        const text = (el.textContent || '').trim();
        const fromText = parseSizeToBytes(text);
        if (fromText !== undefined) return fromText;
      }
    }
    return undefined;
  }

  // Capture clicks on document to detect Context Menu Download or Second-click on file
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const menuItem = target.closest('[role="button"], button, li, div[class*="menu-item"], div[tabindex="-1"]');
    if (menuItem) {
      const text = (menuItem.textContent || '').trim().toLowerCase();
      const ariaLabel = (menuItem.getAttribute('aria-label') || '').trim().toLowerCase();
      const title = (menuItem.getAttribute('title') || '').trim().toLowerCase();
      const svgTitle = menuItem.querySelector('svg title')?.textContent?.trim().toLowerCase();
      const isDownloadText = text === 'download' || text.startsWith('download') || ariaLabel === 'download' || title === 'download' || svgTitle === 'ic-download';
      const hasDownloadIcon = !!menuItem.querySelector('[data-icon*="download"], [data-testid*="download"]');
      const isInsideMenu = !!target.closest('[role="application"], [data-testid="context-menu"], [class*="popup"], [class*="menu"], [class*="dropdown"], [role="menu"]');
      const isInsideMediaViewer = !!target.closest('[data-testid="media-viewer-modal"], [data-animate-media-viewer="true"], [data-testid="drawer-fullscreen"]');

      if ((isDownloadText || hasDownloadIcon) && (isInsideMenu || isInsideMediaViewer)) {
        console.log(`[wallie] Explicit download button clicked (${isInsideMediaViewer ? 'media viewer' : 'context menu'}) -> intent: context-menu-download`);
        ipcRenderer.send('download:set-intent', { intent: 'context-menu-download' });
        return;
      }
    }

    const msgContainer = target.closest('[data-id], div[class*="message-in"], div[class*="message-out"], [data-testid="msg-container"]');
    if (msgContainer) {
      const isMenuOrAction = !!target.closest(
        '[data-testid*="down-context"], [data-testid*="context"], [data-icon*="down-context"], [data-icon*="context"], [data-testid="context-btn"], [data-testid="icon-down-context"], [data-js-context-icon], [data-icon="chevron-down"], [data-icon="down"], [data-testid*="menu"], button[aria-label*="menu" i], [aria-label*="context" i], [aria-label*="menu" i], [aria-label*="options" i], [aria-label*="more" i], [aria-label*="forward" i], [data-testid*="forward"], [data-testid="msg-meta"], [data-testid*="reaction"], [data-testid="reaction-entry-point"], [data-testid="forwarded-header"], [data-testid="author"], [data-testid*="author"], [data-testid*="caption"], [data-testid="document-caption selectable-text"], [data-testid="tail-in"], [data-testid="tail-out"], [role="menu"], [role="menuitem"]'
      );
      const svgTitle = target.closest('svg')?.querySelector('title')?.textContent?.trim().toLowerCase();
      const isActionSvg = !!svgTitle && ['down-context', 'chevron-down', 'down', 'ic-fast-forward', 'menu', 'context', 'tail-in', 'tail-out'].includes(svgTitle);

      if (isMenuOrAction || isActionSvg) {
        return;
      }

      // Ensure the click was strictly inside the document card / document space (the darker inner rectangle)
      const docCard = target.closest<HTMLElement>(
        '[data-testid="document-thumb"], [data-testid="document-thumb-details"], [data-testid="audio-play"], [data-testid="audio-download"], [role="button"][title^="Download "], [role="button"][title^="View "]'
      );
      if (!docCard) {
        return;
      }

      // Verify that the click coordinates fall strictly within the bounds of the document space
      if (e.clientX !== 0 || e.clientY !== 0) {
        const rect = docCard.getBoundingClientRect();
        if (
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom
        ) {
          return;
        }
      }

      const filename = extractFilenameFromMessage(docCard) || extractFilenameFromMessage(msgContainer);
      const isDocCard = !!(docCard.getAttribute('data-testid')?.includes('document') || msgContainer.querySelector('[data-icon*="document"], [data-icon="default-doc"], [data-testid="document-thumb"]'));
      const hasExtension = /\.[a-z0-9]{2,6}$/i.test(filename.trim());

      if (filename && (hasExtension || isDocCard)) {
        const cleanName = filename.trim();
        const extractedSize = extractFileSizeFromMessage(docCard) ?? extractFileSizeFromMessage(msgContainer);

        console.log(`[wallie] Document card clicked: "${cleanName}", approx size: ${extractedSize}`);

        ipcRenderer.invoke('downloads:file-card-clicked', {
          filename: cleanName,
          size: extractedSize,
        }).then((result: { handled: boolean; isExisting: boolean }) => {
          if (result && result.isExisting) {
            console.log('[wallie] Matched existing downloaded file on disk -> handled:', result.handled);
            ipcRenderer.send('download:set-intent', { intent: 'second-click', filename: cleanName, size: extractedSize });
          } else {
            console.log('[wallie] No existing matching file found -> intent: first-download (autoOpen: true)');
            ipcRenderer.send('download:set-intent', { intent: 'first-download', filename: cleanName, size: extractedSize, autoOpen: true });
          }
        }).catch((err: any) => {
          console.error('[wallie] Failed to handle file card click:', err);
          ipcRenderer.send('download:set-intent', { intent: 'first-download', filename: cleanName, size: extractedSize, autoOpen: true });
        });
      }
    }
  }, true);

  const errorModalObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) {
        if (!(node instanceof HTMLElement)) continue;
        const modal = node.matches('[data-animate-modal-popup="true"], [role="dialog"], [data-testid="confirm-popup"]')
          ? node
          : node.querySelector('[data-animate-modal-popup="true"], [role="dialog"], [data-testid="confirm-popup"]');
        if (modal) {
          const text = (modal.textContent || '').toLowerCase();
          const isPhoneError = text.includes('no longer exists on your phone') ||
            text.includes("can't download") ||
            text.includes('cannot download') ||
            (text.includes('resend') && text.includes('ask'));
          if (isPhoneError) {
            console.log('[wallie] Detected WhatsApp download failure modal:', text.slice(0, 80));
            ipcRenderer.send('download:failure-detected', { text });
          }
        }
      }
    }
  });
  if (document.body) {
    errorModalObserver.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      if (document.body) {
        errorModalObserver.observe(document.body, { childList: true, subtree: true });
      }
    });
  }

  let isPhysicalCtrlDown = false;

  ipcRenderer.on('zoom:ctrl-state-changed', (_event: any, isDown: boolean) => {
    isPhysicalCtrlDown = isDown;
  });

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && document.fullscreenElement) {
      e.preventDefault();
      e.stopPropagation();
      document.exitFullscreen().catch(() => {});
      return;
    }

    if (e.key === 'Control' || e.key === 'Meta' || e.ctrlKey || e.metaKey) {
      isPhysicalCtrlDown = true;
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    if (!e.ctrlKey && !e.metaKey) {
      isPhysicalCtrlDown = false;
    }
  };

  window.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('keydown', handleKeyDown, true);
  window.addEventListener('keyup', handleKeyUp, true);
  document.addEventListener('keyup', handleKeyUp, true);

  let wheelZoomTimeout: NodeJS.Timeout | null = null;
  let accumulatedDeltaY = 0;

  window.addEventListener('wheel', (e) => {
    if (isPhysicalCtrlDown && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      accumulatedDeltaY += e.deltaY;
      if (wheelZoomTimeout) clearTimeout(wheelZoomTimeout);
      wheelZoomTimeout = setTimeout(() => {
        if (Math.abs(accumulatedDeltaY) > 5) {
          const direction = accumulatedDeltaY < 0 ? 'in' : 'out';
          ipcRenderer.send('zoom:trigger-step', direction);
        }
        accumulatedDeltaY = 0;
      }, 30);
    }
  }, { passive: false });

  const applyVisualZoomSettings = () => {
    try {
      webFrame.setVisualZoomLevelLimits(VISUAL_ZOOM_MIN, VISUAL_ZOOM_MAX);
    } catch { }
  };

  applyVisualZoomSettings();
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', applyVisualZoomSettings);
  }

  window.addEventListener('dragover', (e: DragEvent) => {
    if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
      e.preventDefault();
    }
  }, false);

  window.addEventListener('drop', (e: DragEvent) => {
    if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
      e.preventDefault();
    }
  }, false);

  contextBridge.exposeInMainWorld('__wallie_ipc', {
    createNotification: (data: { title: string; body: string; icon: string; tag: string; canReply?: boolean; isEdit?: boolean }) => {
      resolveIconToBase64(data.icon).then((base64Icon) => {
        ipcRenderer.send('notification:create', {
          title: data.title,
          body: data.body,
          icon: base64Icon || '',
          tag: data.tag,
          canReply: data.canReply,
          isEdit: data.isEdit,
        });
      });
    },
    closeNotification: () => {},
    dismissChat: (data: { tag?: string; contactName?: string }) => {
      ipcRenderer.send('notification:dismiss-chat', data);
    },
    onNotificationClicked: (callback: (data: any) => void) => {
      onClickCallbacks.add(callback);
      return () => onClickCallbacks.delete(callback);
    },
    onSendInlineReply: (callback: (data: { contactName: string; text: string; tag: string }) => void) => {
      onInlineReplyCallback = callback;
    },
    onAnchorDownload: (filename: string, size?: number, hash?: string) => {
      ipcRenderer.send('download:set-intent', { intent: 'anchor-detected', filename, size, hash });
    },
    getResponsiveLayoutMode: () => {
      return ipcRenderer.invoke('responsive-layout:get-mode');
    },
    onResponsiveLayoutModeChanged: (callback: (mode: string) => void) => {
      const sub = (_event: any, mode: string) => callback(mode);
      ipcRenderer.on('responsive-layout:mode-changed', sub);
      return () => ipcRenderer.removeListener('responsive-layout:mode-changed', sub);
    },
  });

  ipcRenderer.on('notification:clicked-reply', (_event: any, data: any) => {
    onClickCallbacks.forEach((callback) => {
      try {
        callback(data);
      } catch (e) {
        console.error('Error in onNotificationClicked callback:', e);
      }
    });
  });

  ipcRenderer.on('notification:send-inline-reply', (_event: any, data: { contactName: string; text: string; tag: string }) => {
    if (onInlineReplyCallback) {
      onInlineReplyCallback(data);
    }
  });

  ipcRenderer.on('link-preview:clear-cache', () => {
    window.postMessage({ type: 'wallie:clear-link-preview-cache' }, '*');
  });

  // Inject the custom Notification class into the Main World (worldId 0)
  webFrame.executeJavaScriptInIsolatedWorld(0, [{
    code: mainWorldScript,
  }]);
}

