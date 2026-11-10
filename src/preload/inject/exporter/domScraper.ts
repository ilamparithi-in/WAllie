/**
 * DOM scraping and message harvesting operations for WhatsApp Web.
 */

import type { MessageEntry, SystemNotificationEntry } from '../../../shared/chatExportTypes';
import {
  getSearchBox,
  setSearchText,
  getSearchText,
  restoreSearchBox,
  findMatchingRow,
  clickChatRow,
  isChatOpen,
} from '../chatNavigation';
import {
  sleep,
  yieldToEventLoop,
  norm,
  getCollection,
  getMemberLabelsMap,
} from './utils';
import { extractMessageEntry } from './messageParser';
import {
  showOrUpdateExportHUD,
  getIsCurrentJobAborted,
} from './exportHud';

/**
 * Retrieves all currently loaded chats in the active account.
 */
export function getAvailableChats(): Array<{
  jid: string;
  title: string;
  isGroup: boolean;
  isCommunity: boolean;
  isBroadcast: boolean;
  unreadCount: number;
  timestamp: number;
  avatarUrl?: string;
}> {
  try {
    const ChatCollection = getCollection('WAWebChatCollection')?.ChatCollection;
    if (!ChatCollection) return [];

    const models = ChatCollection.getModelsArray ? ChatCollection.getModelsArray() : [];
    const seen = new Set<string>();
    const chats: Array<{
      jid: string;
      title: string;
      isGroup: boolean;
      isCommunity: boolean;
      isBroadcast: boolean;
      unreadCount: number;
      timestamp: number;
      avatarUrl?: string;
    }> = [];

    for (const c of models) {
      const jid = String(c.id?._serialized || c.id || '');
      if (!jid || seen.has(jid)) continue;
      seen.add(jid);
      chats.push({
        jid,
        title: String(c.formattedTitle || c.name || c.contact?.formattedName || 'Unknown'),
        isGroup: Boolean(c.isGroup || c.id?.server === 'g.us' || c.groupMetadata),
        isCommunity: Boolean(c.isParentGroup || c.isCommunity || c.parentGroup),
        isBroadcast: Boolean(c.isBroadcast || c.id?.server === 'broadcast'),
        unreadCount: Number(c.unreadCount || 0),
        timestamp: Number(c.t || 0),
        avatarUrl: c.contact?.profilePicThumb?.img || undefined,
      });
    }
    return chats;
  } catch (err) {
    console.error('[wallie-exporter] Failed to get available chats:', err);
    return [];
  }
}

/**
 * Retrieves info about the currently active open chat.
 */
export function getActiveChatInfo(): {
  jid: string;
  title: string;
  isGroup: boolean;
} | null {
  try {
    const mainEl = document.querySelector<HTMLElement>('#main');
    if (!mainEl) return null;

    const ChatCollection = getCollection('WAWebChatCollection')?.ChatCollection;
    const active = ChatCollection?.getActive ? ChatCollection.getActive() : null;
    if (!active) return null;

    return {
      jid: String(active.id?._serialized || active.id || ''),
      title: String(active.formattedTitle || active.name || 'Chat'),
      isGroup: Boolean(active.isGroup || active.id?.server === 'g.us' || active.groupMetadata),
    };
  } catch {
    return null;
  }
}

/**
 * Switches the active conversation to the target chat JID.
 */
export async function openChatByJid(targetJid: string, targetTitle?: string): Promise<boolean> {
  const current = getActiveChatInfo();
  if (current && current.jid === targetJid) {
    return true;
  }

  const ChatCollection = getCollection('WAWebChatCollection')?.ChatCollection;
  const targetChat = ChatCollection?.get ? ChatCollection.get(targetJid) : null;
  const safeTitle = targetTitle || (targetChat ? targetChat.formattedTitle || targetChat.name : '');
  const targetNorm = norm(safeTitle);

  // 1. Instant programmatic switch via WhatsApp's Cmd module
  if (targetChat) {
    try {
      const Cmd = getCollection('WAWebCmd')?.Cmd;
      if (Cmd?.openChatBottom) {
        Cmd.openChatBottom({ chat: targetChat });
        await sleep(250);
        const check = getActiveChatInfo();
        if (check && (check.jid === targetJid || check.title === safeTitle)) {
          return true;
        }
      }
      if (Cmd?.openChatFromUnread) {
        Cmd.openChatFromUnread({ chat: targetChat });
        await sleep(250);
        const check = getActiveChatInfo();
        if (check && (check.jid === targetJid || check.title === safeTitle)) {
          return true;
        }
      }
    } catch { }
  }

  // 2. Fast check if already open by title
  if (targetNorm && isChatOpen(targetNorm)) {
    return true;
  }

  // 3. Look for visible row in sidebar directly
  if (targetNorm) {
    const row = findMatchingRow(targetNorm);
    if (row) {
      clickChatRow(row);
      await sleep(300);
      if (isChatOpen(targetNorm)) return true;
    }
  }

  // 4. Search box mechanism
  if (safeTitle) {
    const sbox = getSearchBox();
    if (sbox) {
      const prevSearch = getSearchText(sbox);
      setSearchText(sbox, safeTitle);
      await sleep(350);

      for (let i = 0; i < 25; i++) {
        await sleep(100);
        const matchRow = findMatchingRow(targetNorm);
        if (matchRow) {
          clickChatRow(matchRow);
          for (let j = 0; j < 20; j++) {
            await sleep(100);
            if (isChatOpen(targetNorm)) break;
          }
          await sleep(150);
          restoreSearchBox(sbox, prevSearch);
          break;
        }
      }
    }
  }

  // Verify switch
  for (let i = 0; i < 25; i++) {
    const active = getActiveChatInfo();
    if (active && (active.jid === targetJid || (targetNorm && isChatOpen(targetNorm)))) {
      return true;
    }
    await sleep(150);
  }

  return false;
}

/**
 * Ensures the target chat remains active in the viewport.
 */
export async function ensureChatOpen(chatJid: string, chatTitle?: string): Promise<boolean> {
  try {
    const current = getActiveChatInfo();
    if (current && current.jid === chatJid) {
      return true;
    }
    console.log(`[wallie-exporter] Target chat ${chatJid} is not open (current: ${current?.jid}). Re-opening...`);
    return await openChatByJid(chatJid, chatTitle);
  } catch (err) {
    console.warn('[wallie-exporter] Failed to ensure chat open:', err);
    return false;
  }
}

/**
 * Captures live blob URLs and fetches them into ArrayBuffers
 * from rendered DOM rows before WhatsApp Web unmounts them.
 */
export function captureLiveBlobsFromDom(
  liveBlobs: Map<string, string>,
  capturedBuffers: Map<string, { buffer: ArrayBuffer; mimeType: string }>
): void {
  const rows = Array.from(document.querySelectorAll('[data-id]'));
  for (const r of rows) {
    const dataId = r.getAttribute('data-id') || '';
    const parts = dataId.split('_');
    const stanzaId = parts.length >= 3 ? parts[2] : (parts[1] || dataId);
    const mediaEls = Array.from(r.querySelectorAll('img, video, audio')) as (HTMLMediaElement | HTMLImageElement)[];
    for (const mediaEl of mediaEls) {
      if (mediaEl && mediaEl.src && mediaEl.src.startsWith('blob:') && !mediaEl.src.includes('data:image/gif')) {
        const blobUrl = mediaEl.src;
        if (stanzaId && !liveBlobs.has(stanzaId)) {
          liveBlobs.set(stanzaId, blobUrl);
        }
        if (dataId && !liveBlobs.has(dataId)) {
          liveBlobs.set(dataId, blobUrl);
        }
        if (stanzaId && !capturedBuffers.has(stanzaId)) {
          fetch(blobUrl)
            .then(async (resp) => {
              if (resp.ok) {
                const buf = await resp.arrayBuffer();
                if (buf.byteLength > 0 && !capturedBuffers.has(stanzaId)) {
                  const mime = mediaEl.tagName === 'IMG' ? 'image/jpeg' : (mediaEl.tagName === 'VIDEO' ? 'video/mp4' : 'audio/ogg');
                  capturedBuffers.set(stanzaId, { buffer: buf, mimeType: mime });
                  capturedBuffers.set(dataId, { buffer: buf, mimeType: mime });
                }
              }
            })
            .catch(() => { });
        }
      }
    }
  }
}

/**
 * Safely resolves the active chat's scroll container element in WhatsApp Web.
 */
export function getConversationScrollContainer(): HTMLElement | null {
  const panel = document.querySelector<HTMLElement>('div[data-testid="conversation-panel-messages"]');
  if (panel && panel.scrollHeight > panel.clientHeight) {
    return panel;
  }
  const main = document.querySelector<HTMLElement>('#main');
  if (main) {
    const divs = Array.from(main.querySelectorAll<HTMLElement>('div'));
    for (const d of divs) {
      try {
        const s = window.getComputedStyle(d);
        if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && d.scrollHeight > d.clientHeight) {
          return d;
        }
      } catch { }
    }
  }
  return panel || null;
}

/**
 * Finds and harvests all loaded and unmounted messages by scrolling the virtualized timeline.
 * Yields to the browser event loop during processing to keep UI responsive on large chats.
 */
export async function scrollAndHarvestMessages(
  activeChat: any,
  timeframeBoundary: string | null,
  exportId: string,
  chatTitle: string,
  chatIndex: number,
  totalChats: number,
  onProgress: (harvestedCount: number, oldestIso: string) => void
): Promise<{
  messages: (MessageEntry | SystemNotificationEntry)[];
  liveBlobs: Map<string, string>;
  capturedBuffers: Map<string, { buffer: ArrayBuffer; mimeType: string }>;
}> {
  const isGroupChat = Boolean(
    activeChat.id?.server === 'g.us' ||
    activeChat.groupMetadata != null ||
    activeChat.isGroup === true ||
    (typeof activeChat.isGroup === 'function' && activeChat.isGroup())
  );
  const chatJid = String(activeChat.id?._serialized || activeChat.id || '');
  const memberLabelsMap = isGroupChat ? getMemberLabelsMap(chatJid) : {};
  const entriesMap = new Map<string, MessageEntry | SystemNotificationEntry>();
  const liveBlobs = new Map<string, string>();
  const capturedBuffers = new Map<string, { buffer: ArrayBuffer; mimeType: string }>();

  const harvestModels = async () => {
    captureLiveBlobsFromDom(liveBlobs, capturedBuffers);

    // Source A: activeChat.msgs models
    if (activeChat.msgs) {
      const models = activeChat.msgs.getModelsArray ? activeChat.msgs.getModelsArray() : (activeChat.msgs._models || []);
      let count = 0;
      for (const m of models) {
        const entry = extractMessageEntry(m, activeChat, memberLabelsMap);
        if (entry && !entriesMap.has(entry.id)) {
          entriesMap.set(entry.id, entry);
        }
        count++;
        if (count % 150 === 0) {
          await yieldToEventLoop();
        }
      }
    }

    // Source B: WAWebMsgCollection.MsgCollection.byChat
    try {
      const MsgCol = getCollection('WAWebMsgCollection')?.MsgCollection;
      if (MsgCol?.byChat && activeChat.id) {
        const byChatView = MsgCol.byChat(activeChat.id);
        const byChatModels = byChatView?._models || (byChatView?.getModelsArray ? byChatView.getModelsArray() : []);
        let count = 0;
        for (const m of byChatModels) {
          const entry = extractMessageEntry(m, activeChat, memberLabelsMap);
          if (entry && !entriesMap.has(entry.id)) {
            entriesMap.set(entry.id, entry);
          }
          count++;
          if (count % 150 === 0) {
            await yieldToEventLoop();
          }
        }
      }

      // Source C: MsgCollection global pool filtered by remote JID
      if (MsgCol?.getModelsArray && chatJid) {
        const allModels = MsgCol.getModelsArray();
        let count = 0;
        for (const m of allModels) {
          const remoteJid = String(m.id?.remote?._serialized || m.id?.remote || '');
          if (remoteJid === chatJid) {
            const entry = extractMessageEntry(m, activeChat, memberLabelsMap);
            if (entry && !entriesMap.has(entry.id)) {
              entriesMap.set(entry.id, entry);
            }
          }
          count++;
          if (count % 250 === 0) {
            await yieldToEventLoop();
          }
        }
      }
    } catch (e) {
      console.warn('[wallie-exporter] MsgCollection secondary harvest error:', e);
    }

    // Source D: DOM-rendered system notices
    const domNotifs = Array.from(document.querySelectorAll('div[data-testid="msg-notification-container"]'));
    for (const dn of domNotifs) {
      const row = dn.closest('div[data-id]');
      const dataId = row?.getAttribute('data-id') || '';
      const text = (dn.textContent || '').replace(/View$/i, '').trim();
      if (dataId && text) {
        const parts = dataId.split('_');
        const stanzaId = parts.length >= 3 ? parts[2] : (parts[1] || dataId);
        if (!entriesMap.has(stanzaId)) {
          const isDesc = text.toLowerCase().includes('group description');
          entriesMap.set(stanzaId, {
            type: 'system_event',
            id: stanzaId,
            timestamp: new Date().toISOString(),
            subtype: isDesc ? 'group_description_change' : 'generic',
            text,
          });
        }
      }
    }
  };

  // Initial harvest
  await harvestModels();

  const scrollContainer = getConversationScrollContainer();

  const findPhoneSyncButton = (): { element: HTMLElement; isRetry: boolean } | null => {
    const mainEl = document.querySelector<HTMLElement>('#main') || scrollContainer;
    if (!mainEl) return null;

    const allButtons = Array.from(
      mainEl.querySelectorAll('button, div[role="button"], span[role="button"]')
    ).filter((b) => !b.closest('#wallie-export-hud-overlay'));

    for (const b of allButtons) {
      const txt = (b.textContent || '').toLowerCase();
      const isDisabled =
        b.hasAttribute('disabled') ||
        b.getAttribute('aria-disabled') === 'true' ||
        b.classList.contains('disabled');
      if (isDisabled) continue;

      if (
        txt.includes("couldn't get older messages") ||
        txt.includes("could not get older messages") ||
        txt.includes("unable to get older messages") ||
        txt.includes("click here to try again")
      ) {
        return { element: b as HTMLElement, isRetry: true };
      }

      if (
        txt.includes('get older messages') ||
        txt.includes('older messages from your phone') ||
        txt.includes('older messages from phone')
      ) {
        return { element: b as HTMLElement, isRetry: false };
      }
    }
    return null;
  };

  let phoneSyncRetryCount = 0;
  let phoneSyncExhausted = false;
  let previousCount = entriesMap.size;

  while (true) {
    const isAborted = getIsCurrentJobAborted() || (await (window as any).__wallie_ipc?.isChatExportAborted?.(exportId));
    if (isAborted) {
      break;
    }

    await ensureChatOpen(chatJid, chatTitle);

    let oldestDateIso: string = new Date().toISOString();
    let oldestEpoch = Infinity;
    for (const e of entriesMap.values()) {
      if (e.timestamp) {
        const ep = new Date(e.timestamp).getTime();
        if (ep < oldestEpoch) {
          oldestEpoch = ep;
          oldestDateIso = e.timestamp;
        }
      }
    }

    onProgress(entriesMap.size, oldestDateIso);
    showOrUpdateExportHUD({
      title: chatTitle,
      index: chatIndex,
      total: totalChats,
      statusText: 'Harvesting message history (scrolling up)...',
      msgCount: entriesMap.size,
      mediaCount: 0,
      oldestDate: oldestDateIso,
      exportId,
    });

    if (timeframeBoundary && oldestEpoch <= new Date(timeframeBoundary).getTime()) {
      console.log('[wallie-exporter] Reached requested timeframe boundary:', timeframeBoundary);
      break;
    }

    if (!scrollContainer) {
      break;
    }

    // Scroll to top
    if (scrollContainer.scrollTop > 0) {
      scrollContainer.scrollTop = 0;
      scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
      await sleep(150);
    } else {
      scrollContainer.scrollTop = 60;
      scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
      await sleep(60);
      scrollContainer.scrollTop = 0;
      scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
    }

    captureLiveBlobsFromDom(liveBlobs, capturedBuffers);
    await harvestModels();

    const hasCouldNotLoadOlderMessages = (): boolean => {
      const mainEl = document.querySelector<HTMLElement>('#main') || scrollContainer;
      if (!mainEl) return false;
      const txt = (mainEl.innerText || mainEl.textContent || '').toLowerCase();
      return (
        txt.includes("couldn't get older messages") ||
        txt.includes("could not get older messages") ||
        txt.includes("couldn't load older messages") ||
        txt.includes("could not load older messages") ||
        txt.includes("unable to get older messages")
      );
    };

    // Check for phone sync button
    const phoneSync = findPhoneSyncButton();

    if (phoneSync && !phoneSyncExhausted) {
      let skipSyncRequested = false;
      const handleSkipPhoneSync = () => {
        skipSyncRequested = true;
        phoneSyncExhausted = true;
        console.log('[wallie-exporter] User skipped phone sync; continuing with harvested messages.');
      };

      if (phoneSync.isRetry || hasCouldNotLoadOlderMessages()) {
        phoneSyncRetryCount++;

        if (phoneSyncRetryCount >= 3 && hasCouldNotLoadOlderMessages() && entriesMap.size === previousCount) {
          console.warn('[wallie-exporter] Retried 3 times, view shows error and no new messages loaded; concluding phone sync.');
          phoneSyncExhausted = true;
          continue;
        }

        showOrUpdateExportHUD({
          title: chatTitle,
          index: chatIndex,
          total: totalChats,
          statusText: `Couldn't get older messages from phone. Open WhatsApp on your phone (Retry ${phoneSyncRetryCount}/3 in 5s)...`,
          msgCount: entriesMap.size,
          mediaCount: 0,
          oldestDate: oldestDateIso,
          exportId,
          canSkip: true,
          skipLabel: 'Skip Phone Sync',
          onSkip: handleSkipPhoneSync,
        });

        for (let s = 0; s < 5 && !skipSyncRequested; s++) {
          const aborted = await (window as any).__wallie_ipc?.isChatExportAborted?.(exportId);
          if (aborted || getIsCurrentJobAborted()) break;
          await sleep(1000);
        }

        if (skipSyncRequested) continue;

        try {
          phoneSync.element.click();
          await sleep(1000);
        } catch { }
      } else {
        phoneSync.element.click();
        await sleep(1500);
      }

      await harvestModels();
      previousCount = entriesMap.size;
      continue;
    }

    if (entriesMap.size === previousCount) {
      // Reached top or end of loaded history
      await sleep(250);
      await harvestModels();
      if (entriesMap.size === previousCount) {
        break;
      }
    }

    previousCount = entriesMap.size;
    await yieldToEventLoop();
  }

  // Sort chronologically
  const sortedMessages = Array.from(entriesMap.values()).sort((a, b) => {
    const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tA - tB;
  });

  return {
    messages: sortedMessages,
    liveBlobs,
    capturedBuffers,
  };
}

