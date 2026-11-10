/**
 * Orchestrator for single and batch chat export execution.
 */

import type {
  WhatsAppChatExport,
  ChatExportOptions,
} from '../../../shared/chatExportTypes';
import {
  getCollection,
  resolveContactName,
  sanitizeExportFilename,
} from './utils';
import {
  openChatByJid,
  scrollAndHarvestMessages,
} from './domScraper';
import {
  showOrUpdateExportHUD,
  showExportCompletionModal,
  getIsCurrentJobAborted,
} from './exportHud';
import { interleaveDateDividers } from './messageParser';
import { downloadAndAttachMedia } from './mediaExtractor';

/**
 * Executes an export run for a single chat.
 */
export async function runSingleChatExport(
  options: ChatExportOptions,
  exportId: string,
  chatIndex: number = 0,
  totalChats: number = 1
): Promise<{ success: boolean; messagesCount: number; mediaCount: number; htmlPath?: string; error?: string }> {
  (window as any).__wallie_is_exporting = true;
  try {
    showOrUpdateExportHUD({
      title: options.chatTitle || options.chatJid,
      index: chatIndex,
      total: totalChats,
      statusText: 'Opening chat conversation...',
      msgCount: 0,
      mediaCount: 0,
      exportId,
    });

    // 1. Register job
    await (window as any).__wallie_ipc?.registerChatExportJob?.(exportId, options, totalChats, chatIndex);

    // 2. Open chat
    const opened = await openChatByJid(options.chatJid, options.chatTitle);
    if (!opened) {
      throw new Error(`Failed to open chat: ${options.chatTitle || options.chatJid}`);
    }

    const ChatCollection = getCollection('WAWebChatCollection')?.ChatCollection;
    const activeChat = ChatCollection?.getActive ? ChatCollection.getActive() : null;
    if (!activeChat) {
      throw new Error('Active chat could not be retrieved from WhatsApp Web models.');
    }

    const rawTitle = activeChat.formattedTitle || activeChat.name || options.chatTitle || 'Chat';
    const safeTitle = sanitizeExportFilename(rawTitle);
    const filesDirName = `${safeTitle}_files`;

    // 3. Harvest messages
    await (window as any).__wallie_ipc?.updateChatExportProgress?.(exportId, {
      status: 'scrolling',
    });

    const { messages, liveBlobs, capturedBuffers } = await scrollAndHarvestMessages(
      activeChat,
      options.timeframeBoundary,
      exportId,
      safeTitle,
      chatIndex,
      totalChats,
      (count, oldestIso) => {
        (window as any).__wallie_ipc?.updateChatExportProgress?.(exportId, {
          messagesExported: count,
          oldestMessageDate: oldestIso,
        });
      }
    );

    // 4. Download media attachments
    await (window as any).__wallie_ipc?.updateChatExportProgress?.(exportId, {
      status: 'downloading_media',
    });

    let mediaSavedCount = 0;
    await downloadAndAttachMedia(
      messages,
      liveBlobs,
      capturedBuffers,
      activeChat,
      options.outputDirectory,
      filesDirName,
      exportId,
      safeTitle,
      chatIndex,
      totalChats,
      (count) => {
        mediaSavedCount = count;
        (window as any).__wallie_ipc?.updateChatExportProgress?.(exportId, {
          mediaFilesSaved: count,
        });
      }
    );

    // 5. Save Avatars
    showOrUpdateExportHUD({
      title: safeTitle,
      index: chatIndex,
      total: totalChats,
      statusText: 'Saving group and participant avatars...',
      msgCount: messages.length,
      mediaCount: mediaSavedCount,
      exportId,
    });

    let chatAvatarUrl: string | undefined;
    try {
      let chatAvatarData: string | ArrayBuffer | null = null;
      const thumb = activeChat.contact?.profilePicThumb || activeChat.profilePicThumb;
      if (thumb?.img && typeof thumb.img === 'string' && !thumb.img.includes('static.whatsapp.net')) {
        chatAvatarData = thumb.img;
      } else if (thumb?.eurl && typeof thumb.eurl === 'string' && !thumb.eurl.includes('static.whatsapp.net')) {
        try {
          const resp = await fetch(thumb.eurl);
          chatAvatarData = await resp.arrayBuffer();
        } catch { }
      }
      if (!chatAvatarData) {
        const headerImgs = Array.from(document.querySelectorAll('#main header img')) as HTMLImageElement[];
        const validHeaderImg = headerImgs.find((img) => {
          const src = img.src || '';
          if (!src || src.includes('static.whatsapp.net') || src.includes('rsrc.php')) return false;
          return src.includes('whatsapp.net') || src.startsWith('blob:');
        });
        if (validHeaderImg && validHeaderImg.src) {
          try {
            const resp = await fetch(validHeaderImg.src);
            chatAvatarData = await resp.arrayBuffer();
          } catch { }
        }
      }
      if (chatAvatarData && (window as any).__wallie_ipc?.saveChatMedia) {
        chatAvatarUrl = await (window as any).__wallie_ipc.saveChatMedia(
          options.outputDirectory,
          filesDirName,
          'avatars/chat_avatar.jpg',
          chatAvatarData
        );
      }
    } catch (e) {
      console.warn('[wallie-exporter] Failed to save chat avatar:', e);
    }

    // Save participant avatars for group chats
    const savedParticipantAvatars = new Map<string, string>();
    const ProfilePicThumbCollection = getCollection('WAWebProfilePicThumbCollection')?.ProfilePicThumbCollection;
    const ContactCollection = getCollection('WAWebContactCollection')?.ContactCollection;

    for (const msg of messages) {
      if (msg.type !== 'message') continue;
      if (!msg.sender?.jid || msg.direction === 'outgoing') continue;
      const senderJid = msg.sender.jid;

      if (savedParticipantAvatars.has(senderJid)) {
        msg.sender.avatarUrl = savedParticipantAvatars.get(senderJid);
        continue;
      }

      try {
        let avatarData: string | ArrayBuffer | null = null;

        // 1. Check ProfilePicThumbCollection
        const ppt = ProfilePicThumbCollection?.get ? (
          ProfilePicThumbCollection.get(senderJid) ||
          ProfilePicThumbCollection.get(`${senderJid.split('@')[0]}@c.us`) ||
          ProfilePicThumbCollection.get(`${senderJid.split('@')[0]}@lid`)
        ) : null;

        if (ppt?.img && typeof ppt.img === 'string') {
          avatarData = ppt.img;
        } else if (ppt?.eurl && typeof ppt.eurl === 'string' && !ppt.eurl.includes('static.whatsapp.net')) {
          try {
            const resp = await fetch(ppt.eurl);
            avatarData = await resp.arrayBuffer();
          } catch { }
        }

        // 2. Check ContactCollection
        if (!avatarData) {
          let contact = ContactCollection?.get ? (
            ContactCollection.get(senderJid) ||
            ContactCollection.get(`${senderJid.split('@')[0]}@c.us`) ||
            ContactCollection.get(`${senderJid.split('@')[0]}@lid`)
          ) : null;
          if (!contact && ContactCollection?.getModelsArray) {
            const list = ContactCollection.getModelsArray();
            contact = list.find((c: any) =>
              c.id?._serialized === senderJid ||
              c.lid?._serialized === senderJid ||
              c.id?.user === senderJid.split('@')[0]
            );
          }

          const msgModel = activeChat.msgs?.get?.(msg.serializedId || msg.id);
          const senderObj = contact || msgModel?.senderObj;
          const thumb = senderObj?.profilePicThumb;

          if (thumb?.img && typeof thumb.img === 'string') {
            avatarData = thumb.img;
          } else if (thumb?.eurl && typeof thumb.eurl === 'string' && !thumb.eurl.includes('static.whatsapp.net')) {
            try {
              const resp = await fetch(thumb.eurl);
              avatarData = await resp.arrayBuffer();
            } catch { }
          }
        }

        // 3. Check live DOM for participant avatar image
        if (!avatarData) {
          const rowEl = document.querySelector(`[data-id*="${msg.id}"], [data-id*="${msg.serializedId}"]`);
          const avatarImg = rowEl?.querySelector('img[src*="pps.whatsapp.net"], img[src*="blob:"]') as HTMLImageElement | null;
          if (avatarImg?.src) {
            try {
              const resp = await fetch(avatarImg.src);
              avatarData = await resp.arrayBuffer();
            } catch { }
          }
        }

        if (avatarData && (window as any).__wallie_ipc?.saveChatMedia) {
          const safeJid = sanitizeExportFilename(senderJid);
          const savedAvatarPath = await (window as any).__wallie_ipc.saveChatMedia(
            options.outputDirectory,
            filesDirName,
            `avatars/${safeJid}.jpg`,
            avatarData
          );
          savedParticipantAvatars.set(senderJid, savedAvatarPath);
          msg.sender.avatarUrl = savedAvatarPath;
        }
      } catch (e) {
        console.warn(`[wallie-exporter] Failed to save participant avatar for ${senderJid}:`, e);
      }
    }

    // Determine group chat status
    const isGroup = Boolean(
      activeChat.id?.server === 'g.us' ||
      activeChat.groupMetadata != null ||
      activeChat.isGroup === true ||
      (typeof activeChat.isGroup === 'function' && activeChat.isGroup())
    );

    let groupMetadataObj: any = undefined;
    if (isGroup) {
      const participantsList: any[] = [];
      if (activeChat.groupMetadata?.participants) {
        const rawParticipants = Array.isArray(activeChat.groupMetadata.participants)
          ? activeChat.groupMetadata.participants
          : (typeof activeChat.groupMetadata.participants.getModelsArray === 'function'
            ? activeChat.groupMetadata.participants.getModelsArray()
            : []);

        for (const p of rawParticipants) {
          const pJid = String(p.id?._serialized || p.id || '');
          const pName = resolveContactName(pJid);
          const avUrl = savedParticipantAvatars.get(pJid) ||
            savedParticipantAvatars.get(`${pJid.split('@')[0]}@c.us`) ||
            savedParticipantAvatars.get(`${pJid.split('@')[0]}@lid`);
          participantsList.push({
            jid: pJid,
            displayName: pName,
            isAdmin: Boolean(p.isAdmin),
            isSuperAdmin: Boolean(p.isSuperAdmin),
            avatarUrl: avUrl,
          });
        }
      }

      groupMetadataObj = {
        description: activeChat.groupMetadata?.desc ? String(activeChat.groupMetadata.desc) : undefined,
        participantsCount: participantsList.length || (activeChat.groupMetadata?.participants?.length || 0),
        participants: participantsList,
      };
    }

    // 6. Interleave date dividers
    const timeline = interleaveDateDividers(messages);

    // 7. Check abort status
    const isAborted = Boolean(getIsCurrentJobAborted() || (await (window as any).__wallie_ipc?.isChatExportAborted?.(exportId)));

    // 8. Build envelope
    const envelope: WhatsAppChatExport = {
      schemaVersion: '1.0.0',
      exportedAt: new Date().toISOString(),
      exporter: {
        app: 'WAllie',
        version: '1.2.0',
      },
      chat: {
        jid: String(activeChat.id?._serialized || activeChat.id),
        name: String(activeChat.formattedTitle || activeChat.name || 'WhatsApp Chat'),
        type: isGroup ? 'group' : (activeChat.isBroadcast ? 'broadcast' : 'direct'),
        avatarUrl: chatAvatarUrl,
        groupMetadata: groupMetadataObj,
      },
      exportRange: {
        requestedLimitTimestamp: options.timeframeBoundary,
        oldestMessageTimestamp: messages[0]?.timestamp || new Date().toISOString(),
        newestMessageTimestamp: messages[messages.length - 1]?.timestamp || new Date().toISOString(),
        totalMessagesCount: messages.length,
        completed: !isAborted,
      },
      timeline,
    };

    // 9. Finalize files
    showOrUpdateExportHUD({
      title: safeTitle,
      index: chatIndex,
      total: totalChats,
      statusText: 'Writing JSON envelope and standalone viewer...',
      msgCount: messages.length,
      mediaCount: mediaSavedCount,
      exportId,
    });

    await (window as any).__wallie_ipc?.updateChatExportProgress?.(exportId, {
      status: 'saving',
    });

    const finalizeRes = await (window as any).__wallie_ipc?.finalizeChatExport?.(
      options.outputDirectory,
      envelope,
      options.includeViewer ?? true
    );

    await (window as any).__wallie_ipc?.updateChatExportProgress?.(exportId, {
      status: 'completed',
      outputDirectory: options.outputDirectory,
      jsonPath: finalizeRes?.jsonPath,
      htmlPath: finalizeRes?.htmlPath,
      messagesExported: messages.length,
      mediaFilesSaved: mediaSavedCount,
    });

    await (window as any).__wallie_ipc?.completeChatExportJob?.(exportId);

    if (totalChats <= 1) {
      showExportCompletionModal({
        status: isAborted ? 'aborted' : 'completed',
        chatTitle: safeTitle,
        messagesCount: messages.length,
        mediaCount: mediaSavedCount,
        outputDirectory: options.outputDirectory,
        htmlPath: finalizeRes?.htmlPath,
      });
    }

    return {
      success: true,
      messagesCount: messages.length,
      mediaCount: mediaSavedCount,
      htmlPath: finalizeRes?.htmlPath,
    };
  } catch (err) {
    console.error('[wallie-exporter] Export failed:', err);
    await (window as any).__wallie_ipc?.updateChatExportProgress?.(exportId, {
      status: 'failed',
      error: (err as Error).message,
    });
    await (window as any).__wallie_ipc?.completeChatExportJob?.(exportId);

    if (totalChats <= 1) {
      showExportCompletionModal({
        status: 'failed',
        chatTitle: options.chatTitle || 'WhatsApp Chat',
        messagesCount: 0,
        mediaCount: 0,
        outputDirectory: options.outputDirectory,
        error: (err as Error).message,
      });
    }

    return {
      success: false,
      messagesCount: 0,
      mediaCount: 0,
      error: (err as Error).message,
    };
  } finally {
    (window as any).__wallie_is_exporting = false;
  }
}

