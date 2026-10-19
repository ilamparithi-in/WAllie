import './types';

/**
 * Standalone Desktop Link Previews:
 * Intercepts WAWebLinkPreviewChatAction.getLinkPreview to provide instant OpenGraph rich previews
 * via WAllie's native main process, completely bypassing the 7s phone peer timeout.
 */
export function initStandaloneLinkPreview(): void {
  const tryHook = (): boolean => {
    try {
      if (typeof window.require !== 'function') return false;
      const linkAction = window.require('WAWebLinkPreviewChatAction');
      if (!linkAction || typeof linkAction.getLinkPreview !== 'function') return false;
      if ((linkAction.getLinkPreview as any).__wallieHooked) return true;

      const originalGetLinkPreview = linkAction.getLinkPreview;
      const hooked = async function (this: any, e: any, _q: any) {
        if (window.__walinux_ipc?.fetchLinkPreview && e && e.url) {
          try {
            const preview = await window.__walinux_ipc.fetchLinkPreview(e.url);
            if (preview && (preview.title || preview.description)) {
              return {
                url: e.url,
                data: {
                  matchedText: e.url,
                  title: preview.title,
                  description: preview.description,
                  richPreviewType: preview.previewType === 'video' ? 1 : 0,
                  doNotPlayInline: false,
                  isLoading: false,
                  thumbnailHQ: preview.thumbnailBase64 || undefined,
                  thumbnail: preview.thumbnailBase64 || undefined,
                  thumbnailHeight: preview.thumbnailHeight || undefined,
                  thumbnailWidth: preview.thumbnailWidth || undefined,
                },
              };
            }
          } catch (err) {
            console.warn('[walinux] Standalone link preview error, falling back:', err);
          }
        }
        return originalGetLinkPreview.apply(this, arguments);
      };

      (hooked as any).__wallieHooked = true;
      linkAction.getLinkPreview = hooked;
      return true;
    } catch (err) {
      return false;
    }
  };

  if (!tryHook()) {
    const interval = setInterval(() => {
      if (tryHook()) clearInterval(interval);
    }, 500);
    setTimeout(() => clearInterval(interval), 60000);
  }
}
