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
              let mmsData: Record<string, any> = {};
              const hqBase64 = preview.thumbnailHQBase64 || preview.thumbnailBase64;

              if (hqBase64 && typeof window.require === 'function') {
                try {
                  const opaqueData = window.require('WAWebMediaOpaqueData');
                  const uploadMms = window.require('WAWebMediaUploadMmsThumbnail');
                  const mediaTypes = window.require('WAWebMmsMediaTypes');
                  const randomKey = window.require('WAWebCryptoRandomMediaKey');
                  const constants = window.require('WAWebMediaConstants');
                  const getUploadOrigin = window.require('WAWebMediaGetUploadOriginForChat');
                  const chatGetters = window.require('WAWebChatGetters');

                  if (
                    opaqueData?.createFromBase64Jpeg &&
                    typeof uploadMms === 'function' &&
                    typeof randomKey === 'function'
                  ) {
                    const thumb = await opaqueData.createFromBase64Jpeg(hqBase64);
                    const isNewsletter =
                      _q && chatGetters?.getIsNewsletter ? chatGetters.getIsNewsletter(_q) : false;
                    const mediaType = isNewsletter
                      ? mediaTypes?.MEDIA_TYPES?.NEWSLETTER_THUMBNAIL_LINK
                      : mediaTypes?.MEDIA_TYPES?.THUMBNAIL_LINK;
                    const uploadOrigin =
                      typeof getUploadOrigin === 'function' ? getUploadOrigin(_q) : 1;

                    const mmsRes = await uploadMms({
                      thumbnail: thumb,
                      mediaType,
                      mediaKeyInfo: randomKey(),
                      uploadOrigin,
                      fileOrigin: null,
                      forwardedFromWeb: false,
                      timeout: constants?.MMS_THUMBNAIL_UPLOAD_TIMEOUT || 5000,
                      isViewOnce: false,
                    });

                    if (mmsRes?.mediaEntry?.directPath) {
                      mmsData = {
                        thumbnailDirectPath: mmsRes.mediaEntry.directPath,
                        mediaKey: mmsRes.mediaEntry.mediaKey,
                        mediaKeyTimestamp: mmsRes.mediaEntry.mediaKeyTimestamp,
                        thumbnailSha256: mmsRes.filehash,
                        thumbnailEncSha256: mmsRes.mediaEntry.encFilehash,
                      };
                    }
                  }
                } catch (mmsErr) {
                  console.warn(
                    '[walinux] Standalone MMS thumbnail upload failed, falling back to inline thumbnail:',
                    mmsErr
                  );
                }
              }

              return {
                url: e.url,
                data: {
                  matchedText: e.url,
                  title: preview.title,
                  description: preview.description,
                  richPreviewType: preview.previewType === 'video' ? 1 : 0,
                  doNotPlayInline: false,
                  isLoading: false,
                  thumbnailHQ: hqBase64 || undefined,
                  thumbnail: preview.thumbnailBase64 || undefined,
                  thumbnailHeight: preview.thumbnailHeight || undefined,
                  thumbnailWidth: preview.thumbnailWidth || undefined,
                  ...mmsData,
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
