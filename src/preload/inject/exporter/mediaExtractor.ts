/**
 * Media attachment extraction, downloading, and persistence for chat export.
 */

import type {
  MessageEntry,
  SystemNotificationEntry,
  DocumentContent,
  AudioContent,
} from '../../../shared/chatExportTypes';
import {
  sleep,
  getCollection,
  getMemberLabelsMap,
  dismissContextMenuSafely,
  clickElementThoroughly,
  extractBufferFromMediaElement,
  sanitizeExportFilename,
} from './utils';
import { extractMessageEntry } from './messageParser';
import {
  getConversationScrollContainer,
  captureLiveBlobsFromDom,
  ensureChatOpen,
} from './domScraper';
import {
  showOrUpdateExportHUD,
  getIsCurrentJobAborted,
  getLastKnownOldestDate,
} from './exportHud';

/**
 * Downloads and attaches media files for all media entries in the chat timeline.
 */
export async function downloadAndAttachMedia(
  entries: (MessageEntry | SystemNotificationEntry)[],
  liveBlobs: Map<string, string>,
  capturedBuffers: Map<string, { buffer: ArrayBuffer; mimeType: string }>,
  activeChat: any,
  outputDirectory: string,
  filesDirName: string,
  exportId: string,
  chatTitle: string,
  chatIndex: number,
  totalChats: number,
  onMediaSaved: (count: number) => void
): Promise<void> {
  let savedCount = 0;
  const scrollContainer = getConversationScrollContainer();

  // If currently scrolled far down, smoothly reposition near top (>= 150px) without touching 0
  if (scrollContainer && scrollContainer.scrollTop > 300) {
    scrollContainer.scrollTop = 150;
    scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
    await sleep(200);
  }

  const mediaEntries = entries.filter((e): e is MessageEntry => {
    if (e.type !== 'message') return false;
    const t = e.content.type;
    return t === 'image' || t === 'video' || t === 'audio' || t === 'document' || t === 'sticker';
  });

  // Reliably calculate earliest date across all harvested entries
  let minEpoch = Infinity;
  let computedOldestIso: string | undefined = undefined;
  for (const e of entries) {
    if (e.timestamp) {
      const ep = new Date(e.timestamp).getTime();
      if (!isNaN(ep) && ep > 0 && ep < minEpoch) {
        minEpoch = ep;
        computedOldestIso = e.timestamp;
      }
    }
  }
  const oldestDateIso = computedOldestIso || getLastKnownOldestDate();
  const handledStanzaIds = new Set<string>();
  let skippedCount = 0;
  const isGroup = Boolean(activeChat.isGroup || activeChat.id?.server === 'g.us' || activeChat.groupMetadata);
  const chatJid = String(activeChat.id?._serialized || activeChat.id || '');
  const memberLabelsMap = isGroup ? getMemberLabelsMap(chatJid) : {};

  // Build fast lookup map for chronological entry indices
  const entryIndexMap = new Map<string, number>();
  entries.forEach((e, idx) => {
    entryIndexMap.set(e.id, idx);
    if ((e as any).serializedId) {
      entryIndexMap.set((e as any).serializedId, idx);
    }
  });

  // Helper to find message DOM row or album DOM container
  const findRowOrAlbumElement = (
    targetId: string,
    targetSerializedId?: string
  ): {
    element: HTMLElement | null;
    isAlbum: boolean;
    albumDataId?: string;
    albumEntries?: MessageEntry[];
  } => {
    const mainEl = document.querySelector<HTMLElement>('#main');

    // 1. Check all mounted album elements in DOM
    const albumEls = Array.from((mainEl || document).querySelectorAll<HTMLElement>('[data-id*="album-"]'));
    for (const aEl of albumEls) {
      const aDataId = aEl.getAttribute('data-id') || '';
      const match = aDataId.match(/album-([A-Za-z0-9]+)-([A-Za-z0-9]+)-(\d+)/);
      if (match) {
        const firstId = match[1];
        const lastId = match[2];
        const count = parseInt(match[3], 10);
        const firstIdx = mediaEntries.findIndex((m) => m.id === firstId);
        const lastIdx = mediaEntries.findIndex((m) => m.id === lastId);
        if (firstIdx !== -1) {
          const endIdx = lastIdx !== -1 ? lastIdx + 1 : firstIdx + count;
          const albumGroup = mediaEntries.slice(firstIdx, endIdx);
          if (albumGroup.some((m) => m.id === targetId || m.serializedId === targetId)) {
            return { element: aEl, isAlbum: true, albumDataId: aDataId, albumEntries: albumGroup };
          }
        } else if (aDataId.includes(targetId)) {
          return {
            element: aEl,
            isAlbum: true,
            albumDataId: aDataId,
            albumEntries: [mediaEntries.find((m) => m.id === targetId) || mediaEntries[0]],
          };
        }
      } else if (aDataId.includes(targetId)) {
        return { element: aEl, isAlbum: true, albumDataId: aDataId };
      }
    }

    // 2. Direct message row match scoped to #main conversation view
    const sel = targetSerializedId
      ? `[data-id*="${targetId}"], [data-id*="${targetSerializedId}"], [data-testid*="${targetId}"]`
      : `[data-id*="${targetId}"], [data-testid*="${targetId}"]`;
    const el = (mainEl ? mainEl.querySelector<HTMLElement>(sel) : null) || document.querySelector<HTMLElement>(sel);
    if (el) {
      const dataId = el.getAttribute('data-id') || '';
      const isAlbum = dataId.includes('album-') || Boolean(el.querySelector('[data-id*="album-"]'));
      const albumDataId = isAlbum
        ? dataId.includes('album-')
          ? dataId
          : el.querySelector('[data-id*="album-"]')?.getAttribute('data-id') || ''
        : undefined;
      return { element: el, isAlbum, albumDataId };
    }

    return { element: null, isAlbum: false };
  };

  for (let mediaIdx = 0; mediaIdx < mediaEntries.length; mediaIdx++) {
    const isAborted = getIsCurrentJobAborted() || (await (window as any).__wallie_ipc?.isChatExportAborted?.(exportId));
    if (isAborted) break;

    await ensureChatOpen(chatJid, chatTitle);

    // Dynamically accommodate newly loaded messages
    try {
      if (activeChat?.msgs && typeof activeChat.msgs.getModelsArray === 'function') {
        const liveModels = activeChat.msgs.getModelsArray();
        if (liveModels.length > entries.length) {
          const existingIds = new Set(entries.map((e) => e.id));
          let newMsgsAdded = 0;
          for (const m of liveModels) {
            const sId = m.id?.id || (m.id?._serialized ? m.id._serialized.split('_')[2] : '');
            if (!sId || existingIds.has(sId)) continue;
            const extracted = extractMessageEntry(m, activeChat, memberLabelsMap);
            if (extracted) {
              entries.push(extracted);
              existingIds.add(extracted.id);
              newMsgsAdded++;
              if (extracted.type === 'message') {
                const t = extracted.content.type;
                if (t === 'image' || t === 'video' || t === 'audio' || t === 'document' || t === 'sticker') {
                  mediaEntries.push(extracted);
                }
              }
            }
          }
          if (newMsgsAdded > 0) {
            entries.sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());
            mediaEntries.sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());
            entryIndexMap.clear();
            entries.forEach((e, idx) => {
              entryIndexMap.set(e.id, idx);
              if ((e as any).serializedId) {
                entryIndexMap.set((e as any).serializedId, idx);
              }
            });
            showOrUpdateExportHUD({
              title: chatTitle,
              index: chatIndex,
              total: totalChats,
              statusText: `Accommodated ${newMsgsAdded} newly loaded messages...`,
              msgCount: entries.length,
              mediaCount: savedCount,
              totalMedia: mediaEntries.length,
              skippedCount,
              oldestDate: oldestDateIso,
              exportId,
            });
          }
        }
      }
    } catch (err) {
      console.warn('[wallie-exporter] Dynamic message accommodation error:', err);
    }

    const entry = mediaEntries[mediaIdx];
    const stanzaId = entry.id;
    if (handledStanzaIds.has(stanzaId)) {
      continue;
    }

    const content = entry.content;
    const serializedId = entry.serializedId || stanzaId;

    let ext = 'bin';
    let targetFileName = '';
    if (content.type === 'image') ext = 'jpeg';
    else if (content.type === 'video') ext = 'mp4';
    else if (content.type === 'audio') ext = (content as AudioContent).isVoiceNote ? 'ogg' : 'mp3';
    else if (content.type === 'sticker') ext = 'webp';
    else if (content.type === 'document') {
      targetFileName = (content as DocumentContent).fileName || 'Document';
      const match = targetFileName.match(/\.([a-zA-Z0-9]+)$/);
      ext = match ? match[1].toLowerCase() : 'bin';
    }

    const safeFileBase = targetFileName
      ? sanitizeExportFilename(targetFileName)
      : `${sanitizeExportFilename(stanzaId)}.${ext}`;
    const subPath = `media/${sanitizeExportFilename(stanzaId)}_${safeFileBase}`;

    let entrySaved = false;
    let skipRequested = false;

    const handleSkip = () => {
      skipRequested = true;
      skippedCount++;
      handledStanzaIds.add(stanzaId);
      showOrUpdateExportHUD({
        title: chatTitle,
        index: chatIndex,
        total: totalChats,
        statusText: `Skipped (${mediaIdx + 1}/${mediaEntries.length}): ${targetFileName || safeFileBase}`,
        msgCount: entries.length,
        mediaCount: savedCount,
        totalMedia: mediaEntries.length,
        skippedCount,
        oldestDate: oldestDateIso,
        exportId,
        canSkip: false,
      });
    };

    // --- STEP 1: FAST PATH (Memory Buffers & Existing Files on Disk) ---
    const captured = capturedBuffers.get(stanzaId) || capturedBuffers.get(serializedId);
    if (captured && captured.buffer.byteLength > 0 && (window as any).__wallie_ipc?.saveChatMedia) {
      try {
        const relativeSavedRef = await (window as any).__wallie_ipc.saveChatMedia(
          outputDirectory,
          filesDirName,
          subPath,
          captured.buffer
        );
        (content as any).mediaRef = relativeSavedRef;
        entrySaved = true;
        savedCount++;
        handledStanzaIds.add(stanzaId);
        onMediaSaved(savedCount);
        showOrUpdateExportHUD({
          title: chatTitle,
          index: chatIndex,
          total: totalChats,
          statusText: `Saved (${mediaIdx + 1}/${mediaEntries.length}): ${targetFileName || safeFileBase}`,
          msgCount: entries.length,
          mediaCount: savedCount,
          totalMedia: mediaEntries.length,
          skippedCount,
          oldestDate: oldestDateIso,
          exportId,
          canSkip: false,
        });
        continue;
      } catch (err) {
        console.warn(`[wallie-exporter] Failed to save captured buffer for ${stanzaId}:`, err);
      }
    }

    if (targetFileName && (window as any).__wallie_ipc?.findExistingDownload) {
      try {
        const existing = await (window as any).__wallie_ipc.findExistingDownload(
          targetFileName,
          (content as any).fileSize
        );
        if (existing && existing.found && existing.path && (window as any).__wallie_ipc?.copyFileToExport) {
          const relativeSavedRef = await (window as any).__wallie_ipc.copyFileToExport(
            outputDirectory,
            filesDirName,
            subPath,
            existing.path
          );
          (content as any).mediaRef = relativeSavedRef;
          entrySaved = true;
          savedCount++;
          handledStanzaIds.add(stanzaId);
          onMediaSaved(savedCount);
          showOrUpdateExportHUD({
            title: chatTitle,
            index: chatIndex,
            total: totalChats,
            statusText: `Saved (${mediaIdx + 1}/${mediaEntries.length}): ${targetFileName}`,
            msgCount: entries.length,
            mediaCount: savedCount,
            totalMedia: mediaEntries.length,
            skippedCount,
            oldestDate: oldestDateIso,
            exportId,
            canSkip: false,
          });
          continue;
        }
      } catch (err) {
        console.warn(`[wallie-exporter] Existing file check failed for ${targetFileName}:`, err);
      }
    }

    // --- STEP 2: LOCATE IN DOM ---
    let found = findRowOrAlbumElement(stanzaId, serializedId);
    if (!found.element && scrollContainer) {
      let liveModels: any[] = [];
      try {
        if (activeChat?.msgs?.getModelsArray) {
          liveModels = activeChat.msgs.getModelsArray();
        }
      } catch { }

      let targetModelIdx = -1;
      if (liveModels.length > 0) {
        targetModelIdx = liveModels.findIndex(
          (m) =>
            (m.id?.id && m.id.id === stanzaId) ||
            (m.id?._serialized && (m.id._serialized === stanzaId || m.id._serialized === serializedId))
        );
      }
      if (targetModelIdx === -1) {
        targetModelIdx = entryIndexMap.get(stanzaId) ?? entryIndexMap.get(serializedId) ?? -1;
      }

      for (let step = 0; step < 20; step++) {
        found = findRowOrAlbumElement(stanzaId, serializedId);
        if (found.element) break;

        const mainEl = document.querySelector<HTMLElement>('#main');
        const mounted = mainEl ? Array.from(mainEl.querySelectorAll<HTMLElement>('div[data-id]')) : [];
        let minIdx = Infinity;
        let maxIdx = -1;

        if (liveModels.length > 0) {
          for (const r of mounted) {
            const did = r.getAttribute('data-id') || '';
            const mIdx = liveModels.findIndex(
              (m) => m.id?.id === did || m.id?._serialized === did || m.id?._serialized?.includes(did)
            );
            if (mIdx !== -1) {
              if (mIdx < minIdx) minIdx = mIdx;
              if (mIdx > maxIdx) maxIdx = mIdx;
            }
          }
        } else {
          for (const r of mounted) {
            const did = r.getAttribute('data-id') || '';
            let mIdx = entryIndexMap.get(did);
            if (mIdx === undefined) {
              const parts = did.split('_');
              if (parts.length >= 3) {
                mIdx = entryIndexMap.get(parts[2]);
              }
            }
            if (mIdx !== undefined) {
              if (mIdx < minIdx) minIdx = mIdx;
              if (mIdx > maxIdx) maxIdx = mIdx;
            }
          }
        }

        const stepSize = Math.max(450, Math.floor(scrollContainer.clientHeight * 0.75));
        const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);

        if (targetModelIdx !== -1 && minIdx !== Infinity && maxIdx !== -1) {
          if (targetModelIdx > maxIdx) {
            scrollContainer.scrollTop = Math.min(maxScrollTop, scrollContainer.scrollTop + stepSize);
          } else if (targetModelIdx < minIdx) {
            scrollContainer.scrollTop = Math.max(150, scrollContainer.scrollTop - stepSize);
          } else {
            const ratio = (targetModelIdx - minIdx) / (maxIdx - minIdx || 1);
            const targetTop = scrollContainer.scrollTop + (ratio - 0.5) * scrollContainer.clientHeight;
            scrollContainer.scrollTop = Math.max(150, Math.min(maxScrollTop, targetTop));
          }
        } else {
          scrollContainer.scrollTop = Math.min(maxScrollTop, scrollContainer.scrollTop + stepSize);
        }

        scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
        await sleep(180);
        captureLiveBlobsFromDom(liveBlobs, capturedBuffers);
      }
    }

    const rowEl = found.element;
    const isAlbum = found.isAlbum;

    if (rowEl) {
      try {
        rowEl.scrollIntoView({ block: 'center', behavior: 'auto' });
        await sleep(200);
      } catch { }
    }

    // --- STEP 3: GROUPED MEDIA (ALBUMS) ---
    if (isAlbum && rowEl) {
      const albumEntries =
        found.albumEntries ||
        (() => {
          const match = found.albumDataId?.match(/album-([A-Za-z0-9]+)-([A-Za-z0-9]+)-(\d+)/);
          const firstId = match ? match[1] : '';
          const lastId = match ? match[2] : '';
          const count = match ? parseInt(match[3], 10) : 0;
          const firstIdx = firstId ? mediaEntries.findIndex((m) => m.id === firstId) : -1;
          const lastIdx = lastId ? mediaEntries.findIndex((m) => m.id === lastId) : -1;
          return firstIdx !== -1
            ? mediaEntries.slice(firstIdx, lastIdx !== -1 ? lastIdx + 1 : firstIdx + count)
            : [mediaEntries[mediaIdx]];
        })();
      const albumStanzaIds = albumEntries.map((ae) => ae.id);

      showOrUpdateExportHUD({
        title: chatTitle,
        index: chatIndex,
        total: totalChats,
        statusText: `Downloading grouped media album (${albumEntries.length} items)`,
        msgCount: entries.length,
        mediaCount: savedCount,
        totalMedia: mediaEntries.length,
        skippedCount,
        oldestDate: oldestDateIso,
        exportId,
        canSkip: true,
        onSkip: () => {
          skipRequested = true;
          skippedCount += albumEntries.length;
          for (const ae of albumEntries) handledStanzaIds.add(ae.id);
        },
      });

      let albumProcessedSuccessfully = false;

      try {
        const rect = rowEl.getBoundingClientRect();
        const cx = Math.floor(rect.left + Math.min(80, rect.width / 2));
        const cy = Math.floor(rect.top + Math.min(80, rect.height / 2));

        await (window as any).__wallie_ipc?.prepareExportDownload?.('.zip', 0);
        const dlPromise = (window as any).__wallie_ipc?.waitForDownload?.('.zip', 8000);

        if ((window as any).__wallie_ipc?.dispatchMouse) {
          await (window as any).__wallie_ipc.dispatchMouse('contextmenu', cx, cy);
        } else {
          rowEl.dispatchEvent(
            new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: cx, clientY: cy })
          );
        }

        await sleep(200);

        const menuItems = Array.from(document.querySelectorAll('li, div[role="button"], span'));
        const dlAllOption = menuItems.find((el) => {
          const txt = (el.textContent || '').trim().toLowerCase();
          return txt === 'download all' || txt.includes('download all');
        }) as HTMLElement | null;

        if (dlAllOption) {
          dlAllOption.click();
          const dlRes = await dlPromise;
          if (dlRes && dlRes.success && dlRes.savePath && (window as any).__wallie_ipc?.unzipAlbumDownload) {
            const unzipRes = await (window as any).__wallie_ipc.unzipAlbumDownload(
              outputDirectory,
              filesDirName,
              dlRes.savePath,
              albumStanzaIds
            );
            if (unzipRes && unzipRes.success && unzipRes.mapping) {
              let albumSavedCount = 0;
              for (const ae of albumEntries) {
                const mRef = unzipRes.mapping[ae.id];
                if (mRef) {
                  (ae.content as any).mediaRef = mRef;
                  albumSavedCount++;
                  handledStanzaIds.add(ae.id);
                }
              }
              if (albumSavedCount > 0) {
                savedCount += albumSavedCount;
                onMediaSaved(savedCount);
                albumProcessedSuccessfully = true;
              }
            }
          }
        } else {
          dismissContextMenuSafely();
        }
      } catch (err) {
        console.warn('[wallie-exporter] Grouped media album zip download error:', err);
      }

      if (!albumProcessedSuccessfully) {
        const tileImgs = Array.from(rowEl.querySelectorAll<HTMLImageElement | HTMLMediaElement>('img, video')).filter(
          (m) => m.src && m.src.startsWith('blob:') && !m.src.includes('data:image/gif')
        );
        let tileSavedCount = 0;
        for (let ti = 0; ti < Math.min(tileImgs.length, albumEntries.length); ti++) {
          const ae = albumEntries[ti];
          if (handledStanzaIds.has(ae.id)) continue;
          try {
            const resp = await fetch(tileImgs[ti].src);
            const buf = await resp.arrayBuffer();
            if (buf.byteLength > 0 && (window as any).__wallie_ipc?.saveChatMedia) {
              const safeStanza = sanitizeExportFilename(ae.id);
              const aSubPath = `media/${safeStanza}_${safeStanza}.jpeg`;
              const savedRef = await (window as any).__wallie_ipc.saveChatMedia(
                outputDirectory,
                filesDirName,
                aSubPath,
                buf
              );
              (ae.content as any).mediaRef = savedRef;
              handledStanzaIds.add(ae.id);
              tileSavedCount++;
            }
          } catch { }
        }
        if (tileSavedCount > 0) {
          savedCount += tileSavedCount;
          onMediaSaved(savedCount);
          albumProcessedSuccessfully = true;
        }
      }

      for (const ae of albumEntries) {
        handledStanzaIds.add(ae.id);
      }

      if (albumProcessedSuccessfully) {
        showOrUpdateExportHUD({
          title: chatTitle,
          index: chatIndex,
          total: totalChats,
          statusText: `Saved grouped media album (${albumEntries.length} items)`,
          msgCount: entries.length,
          mediaCount: savedCount,
          totalMedia: mediaEntries.length,
          skippedCount,
          oldestDate: oldestDateIso,
          exportId,
          canSkip: false,
        });
        continue;
      }
    }

    if (handledStanzaIds.has(stanzaId)) {
      continue;
    }

    // --- STEP 4: INDIVIDUAL MEDIA DOWNLOAD ---
    showOrUpdateExportHUD({
      title: chatTitle,
      index: chatIndex,
      total: totalChats,
      statusText: `Downloading (${mediaIdx + 1}/${mediaEntries.length}): ${targetFileName || safeFileBase}`,
      msgCount: entries.length,
      mediaCount: savedCount,
      totalMedia: mediaEntries.length,
      skippedCount,
      oldestDate: oldestDateIso,
      exportId,
      canSkip: true,
      onSkip: handleSkip,
    });

    if (rowEl) {
      const mediaEls = Array.from(rowEl.querySelectorAll<HTMLImageElement | HTMLMediaElement>('img, video, audio'));
      for (const m of mediaEls) {
        const buf = await extractBufferFromMediaElement(m);
        if (buf && buf.byteLength > 0 && (window as any).__wallie_ipc?.saveChatMedia) {
          try {
            const relativeSavedRef = await (window as any).__wallie_ipc.saveChatMedia(
              outputDirectory,
              filesDirName,
              subPath,
              buf
            );
            (content as any).mediaRef = relativeSavedRef;
            entrySaved = true;
            savedCount++;
            handledStanzaIds.add(stanzaId);
            onMediaSaved(savedCount);
            showOrUpdateExportHUD({
              title: chatTitle,
              index: chatIndex,
              total: totalChats,
              statusText: `Saved (${mediaIdx + 1}/${mediaEntries.length}): ${targetFileName || safeFileBase}`,
              msgCount: entries.length,
              mediaCount: savedCount,
              totalMedia: mediaEntries.length,
              skippedCount,
              oldestDate: oldestDateIso,
              exportId,
              canSkip: false,
            });
            break;
          } catch { }
        }
      }
      if (entrySaved) continue;
    }

    if (skipRequested) continue;

    try {
      const isSticker = content.type === 'sticker';
      const isDocument = content.type === 'document';
      const expectedName = !isSticker ? (targetFileName || (content.type === 'audio' ? '.ogg' : undefined)) : undefined;
      let dlPromise: Promise<{ success: boolean; savePath?: string; filename?: string } | null> | undefined;

      if (!isSticker && expectedName) {
        await (window as any).__wallie_ipc?.prepareExportDownload?.(expectedName, (content as any).fileSize);
        dlPromise = (window as any).__wallie_ipc?.waitForDownload?.(expectedName, 8000);
      }

      if (rowEl) {
        if (isSticker) {
          const dlIconBtn = (
            rowEl.querySelector<HTMLElement>(
              'span[data-icon="download"], span[data-icon="refresh"], [data-icon*="download"], [data-testid*="download"]'
            )?.closest<HTMLElement>('button, [role="button"]') ||
            rowEl.querySelector<HTMLElement>(
              '[role="button"][title*="Download" i], [role="button"][aria-label*="Download" i], button[title*="Download" i], button[aria-label*="Download" i], [data-testid="media-download"], [data-testid="button-download"]'
            )
          );

          const stickerBtn = dlIconBtn || rowEl.querySelector<HTMLElement>('div[role="button"][aria-label*="Sticker" i]') || rowEl.querySelector<HTMLElement>('div[role="button"]');

          if (stickerBtn) {
            await clickElementThoroughly(stickerBtn);
          }
        } else if (isDocument) {
          const explicitDlBtn = rowEl.querySelector<HTMLElement>(
            'span[data-icon="download"], span[data-icon="down"], [data-icon*="download"], [data-testid="audio-download"], [data-testid="document-download"]'
          )?.closest<HTMLElement>('button, [role="button"]');

          if (explicitDlBtn) {
            await clickElementThoroughly(explicitDlBtn);
          }

          const docTarget = (
            rowEl.querySelector<HTMLElement>(
              '[data-testid="document-thumb"], div[title*="."], div[class*="message-in"], div[class*="message-out"], .copyable-text'
            ) || rowEl
          );

          docTarget.scrollIntoView({ block: 'nearest', behavior: 'auto' });
          await sleep(60);
          const rect = docTarget.getBoundingClientRect();
          const cx = Math.floor(rect.left + rect.width / 2);
          const cy = Math.floor(rect.top + rect.height / 2);

          docTarget.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: cx, clientY: cy }));
          await sleep(50);

          const chevron = rowEl.querySelector<HTMLElement>(
            '[data-testid="down-context"], [data-icon="down-context"], span[data-icon="chevron-down"], div[role="button"][title*="Menu" i], [aria-label*="Context menu" i], [aria-label*="Menu" i]'
          );

          let menuOpened = false;
          if (chevron) {
            await clickElementThoroughly(chevron);
            await sleep(250);
            menuOpened = Boolean(document.querySelector('div[data-animate-context-menu="true"], ul[role="menu"]'));
          }

          if (!menuOpened) {
            if ((window as any).__wallie_ipc?.dispatchMouse && cx > 0 && cy > 0 && cx < window.innerWidth && cy < window.innerHeight) {
              await (window as any).__wallie_ipc.dispatchMouse('contextmenu', cx, cy);
            } else {
              docTarget.dispatchEvent(
                new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: cx, clientY: cy })
              );
            }
            await sleep(250);
          }

          const menuItems = Array.from(document.querySelectorAll('li, div[role="button"], span, div[tabindex="-1"]'));
          const downloadItem = menuItems.find((el) => {
            const txt = (el.textContent || '').trim().toLowerCase();
            return txt === 'download' || txt.startsWith('download');
          }) as HTMLElement | null;

          if (downloadItem) {
            await clickElementThoroughly(downloadItem);
          } else {
            dismissContextMenuSafely();
          }
        } else {
          const dlBtn = rowEl.querySelector<HTMLElement>(
            '[role="button"][title*="Download" i], [role="button"][aria-label*="Download" i], [data-testid="audio-download"], [data-testid="media-download"], [data-testid="button-download"], [data-icon*="download" i], div[title*="Download" i], button[title*="Download" i]'
          );

          if (dlBtn) {
            await clickElementThoroughly(dlBtn);
          } else {
            const mediaTarget = rowEl.querySelector<HTMLElement>(
              'img, video, audio, [data-testid="audio-player"], .copyable-text, div[class*="message-in"], div[class*="message-out"]'
            ) || rowEl;

            mediaTarget.scrollIntoView({ block: 'nearest', behavior: 'auto' });
            await sleep(60);
            const rect = mediaTarget.getBoundingClientRect();
            const cx = Math.floor(rect.left + rect.width / 2);
            const cy = Math.floor(rect.top + rect.height / 2);

            mediaTarget.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: cx, clientY: cy }));
            await sleep(50);

            const chevron = rowEl.querySelector<HTMLElement>(
              '[data-testid="down-context"], [data-icon="down-context"], span[data-icon="chevron-down"], div[role="button"][title*="Menu" i], [aria-label*="Context menu" i], [aria-label*="Menu" i]'
            );

            if (chevron) {
              await clickElementThoroughly(chevron);
            } else {
              if ((window as any).__wallie_ipc?.dispatchMouse && cx > 0 && cy > 0) {
                await (window as any).__wallie_ipc.dispatchMouse('contextmenu', cx, cy);
              } else {
                mediaTarget.dispatchEvent(
                  new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: cx, clientY: cy })
                );
              }
            }

            await sleep(300);

            const menuItems = Array.from(document.querySelectorAll('li, div[role="button"], span, div[tabindex="-1"]'));
            const downloadItem = menuItems.find((el) => {
              const txt = (el.textContent || '').trim().toLowerCase();
              return txt === 'download' || txt.startsWith('download');
            }) as HTMLElement | null;

            if (downloadItem) {
              await clickElementThoroughly(downloadItem);
            } else {
              dismissContextMenuSafely();
            }
          }
        }
      }

      const dlHolder: { result: { success: boolean; savePath?: string; filename?: string } | null } = { result: null };
      if (dlPromise) {
        dlPromise
          .then((res) => {
            dlHolder.result = res;
          })
          .catch(() => {
            dlHolder.result = { success: false };
          });
      }

      const startTimeMs = Date.now();
      const maxWaitMs = 8000;

      while (Date.now() - startTimeMs < maxWaitMs && !skipRequested && !entrySaved) {
        await sleep(150);

        if (rowEl) {
          const mediaEls = Array.from(rowEl.querySelectorAll<HTMLImageElement | HTMLMediaElement>('img, video, audio'));
          for (const m of mediaEls) {
            const buf = await extractBufferFromMediaElement(m);
            if (buf && buf.byteLength > 0 && (window as any).__wallie_ipc?.saveChatMedia) {
              try {
                const relativeSavedRef = await (window as any).__wallie_ipc.saveChatMedia(
                  outputDirectory,
                  filesDirName,
                  subPath,
                  buf
                );
                (content as any).mediaRef = relativeSavedRef;
                entrySaved = true;
                savedCount++;
                handledStanzaIds.add(stanzaId);
                onMediaSaved(savedCount);
                break;
              } catch { }
            }
          }
          if (entrySaved) break;
        }

        if (!isSticker) {
          const curResult = dlHolder.result;
          if (
            curResult &&
            curResult.success &&
            curResult.savePath &&
            (window as any).__wallie_ipc?.copyFileToExport
          ) {
            try {
              const relativeSavedRef = await (window as any).__wallie_ipc.copyFileToExport(
                outputDirectory,
                filesDirName,
                subPath,
                curResult.savePath
              );
              (content as any).mediaRef = relativeSavedRef;
              entrySaved = true;
              savedCount++;
              handledStanzaIds.add(stanzaId);
              onMediaSaved(savedCount);
              break;
            } catch { }
          }

          if (targetFileName && (window as any).__wallie_ipc?.findExistingDownload) {
            try {
              const existing = await (window as any).__wallie_ipc.findExistingDownload(
                targetFileName,
                (content as any).fileSize
              );
              if (existing && existing.found && existing.path && (window as any).__wallie_ipc?.copyFileToExport) {
                const relativeSavedRef = await (window as any).__wallie_ipc.copyFileToExport(
                  outputDirectory,
                  filesDirName,
                  subPath,
                  existing.path
                );
                (content as any).mediaRef = relativeSavedRef;
                entrySaved = true;
                savedCount++;
                handledStanzaIds.add(stanzaId);
                onMediaSaved(savedCount);
                break;
              }
            } catch { }
          }
        }
      }

      if (entrySaved) {
        showOrUpdateExportHUD({
          title: chatTitle,
          index: chatIndex,
          total: totalChats,
          statusText: `Saved (${mediaIdx + 1}/${mediaEntries.length}): ${targetFileName || safeFileBase}`,
          msgCount: entries.length,
          mediaCount: savedCount,
          totalMedia: mediaEntries.length,
          skippedCount,
          oldestDate: oldestDateIso,
          exportId,
          canSkip: false,
        });
      }
    } catch (err) {
      console.warn(`[wallie-exporter] Download error for ${stanzaId}:`, err);
    }

    if (!entrySaved) {
      handledStanzaIds.add(stanzaId);
      if ((content as any).thumbnailDataUri && (window as any).__wallie_ipc?.saveChatMedia) {
        try {
          const thumbSubPath = `media/${sanitizeExportFilename(stanzaId)}.jpeg`;
          const relativeSavedRef = await (window as any).__wallie_ipc.saveChatMedia(
            outputDirectory,
            filesDirName,
            thumbSubPath,
            (content as any).thumbnailDataUri
          );
          (content as any).mediaRef = relativeSavedRef;
        } catch { }
      } else {
        (content as any).isExpired = true;
      }
    }
  }

  // Final reconciliation pass
  const unsavedMedia = mediaEntries.filter(
    (m) => (m.content as any).isExpired || !(m.content as any).mediaRef
  );

  if (unsavedMedia.length > 0) {
    showOrUpdateExportHUD({
      title: chatTitle,
      index: chatIndex,
      total: totalChats,
      statusText: `Reconciling unsaved media (${unsavedMedia.length} items)...`,
      msgCount: entries.length,
      mediaCount: savedCount,
      totalMedia: mediaEntries.length,
      skippedCount,
      oldestDate: oldestDateIso,
      exportId,
      canSkip: false,
    });

    for (const entry of unsavedMedia) {
      const stanzaId = entry.id;
      const content = entry.content;
      let targetFileName = '';
      let ext = 'bin';
      if (content.type === 'document') {
        targetFileName = (content as DocumentContent).fileName || '';
        const match = targetFileName.match(/\.([a-zA-Z0-9]+)$/);
        ext = match ? match[1].toLowerCase() : 'bin';
      } else if (content.type === 'image') ext = 'jpeg';
      else if (content.type === 'video') ext = 'mp4';
      else if (content.type === 'audio') ext = (content as AudioContent).isVoiceNote ? 'ogg' : 'mp3';
      else if (content.type === 'sticker') ext = 'webp';

      const safeFileBase = targetFileName
        ? sanitizeExportFilename(targetFileName)
        : `${sanitizeExportFilename(stanzaId)}.${ext}`;
      const subPath = `media/${sanitizeExportFilename(stanzaId)}_${safeFileBase}`;

      if (targetFileName && (window as any).__wallie_ipc?.findExistingDownload) {
        try {
          const existing = await (window as any).__wallie_ipc.findExistingDownload(
            targetFileName,
            (content as any).fileSize
          );
          if (existing && existing.found && existing.path && (window as any).__wallie_ipc?.copyFileToExport) {
            const relativeSavedRef = await (window as any).__wallie_ipc.copyFileToExport(
              outputDirectory,
              filesDirName,
              subPath,
              existing.path
            );
            (content as any).mediaRef = relativeSavedRef;
            (content as any).isExpired = false;
            savedCount++;
            handledStanzaIds.add(stanzaId);
            onMediaSaved(savedCount);
            continue;
          }
        } catch { }
      }

      const captured = capturedBuffers.get(stanzaId) || capturedBuffers.get(entry.serializedId || stanzaId);
      if (captured && captured.buffer.byteLength > 0 && (window as any).__wallie_ipc?.saveChatMedia) {
        try {
          const relativeSavedRef = await (window as any).__wallie_ipc.saveChatMedia(
            outputDirectory,
            filesDirName,
            subPath,
            captured.buffer
          );
          (content as any).mediaRef = relativeSavedRef;
          (content as any).isExpired = false;
          savedCount++;
          handledStanzaIds.add(stanzaId);
          onMediaSaved(savedCount);
          continue;
        } catch { }
      }
    }
  }

  if (scrollContainer) {
    try {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    } catch { }
  }
}

