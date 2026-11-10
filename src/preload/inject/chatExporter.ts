/**
 * WAllie Chat Exporter - Main Entry Point & IPC Event Listener.
 */

import './types';
export {
  getAvailableChats,
  getActiveChatInfo,
  openChatByJid,
} from './exporter/domScraper';
export { runSingleChatExport } from './exporter/exportRunner';

import {
  getAvailableChats,
  getActiveChatInfo,
  openChatByJid,
} from './exporter/domScraper';
import { runSingleChatExport } from './exporter/exportRunner';
import {
  showExportCompletionModal,
  setIsCurrentJobAborted,
  getIsCurrentJobAborted,
} from './exporter/exportHud';

/**
 * Initializes the Chat Exporter module in WhatsApp Web Main World.
 */
export function initChatExporter(): void {
  // Expose global helper interface on window
  (window as any).__wallie_chat_exporter = {
    getAvailableChats,
    getActiveChatInfo,
    openChatByJid,
    runSingleChatExport,
  };

  // Listen for export requests dispatched via window.postMessage
  window.addEventListener('message', async (event) => {
    if (!event.data || typeof event.data !== 'object') return;

    if (event.data.type === 'WALLIE_START_SINGLE_EXPORT') {
      setIsCurrentJobAborted(false);
      const { options, exportId } = event.data;
      const res = await runSingleChatExport(options, exportId, 0, 1);
      window.postMessage({ type: 'WALLIE_EXPORT_COMPLETED', exportId, result: res }, '*');
    }

    if (event.data.type === 'WALLIE_START_MULTI_EXPORT') {
      setIsCurrentJobAborted(false);
      const { chats, outputDirectory, includeViewer, timeframeBoundary, exportId } = event.data;
      const results = [];
      let totalMsgs = 0;
      let totalMedia = 0;
      let firstHtmlPath: string | undefined;

      for (let i = 0; i < chats.length; i++) {
        const isAborted = getIsCurrentJobAborted() || (await (window as any).__wallie_ipc?.isChatExportAborted?.(exportId));
        if (isAborted) break;

        const chat = chats[i];
        const res = await runSingleChatExport(
          {
            accountId: '',
            chatJid: chat.jid,
            chatTitle: chat.title,
            outputDirectory,
            includeViewer,
            timeframeBoundary,
          },
          exportId,
          i,
          chats.length
        );
        results.push(res);
        totalMsgs += res.messagesCount;
        totalMedia += res.mediaCount;
        if (!firstHtmlPath && res.htmlPath) {
          firstHtmlPath = res.htmlPath;
        }

        if (getIsCurrentJobAborted() || (await (window as any).__wallie_ipc?.isChatExportAborted?.(exportId))) {
          break;
        }
      }

      const isAborted = getIsCurrentJobAborted() || (await (window as any).__wallie_ipc?.isChatExportAborted?.(exportId));
      showExportCompletionModal({
        status: isAborted ? 'aborted' : 'completed',
        chatTitle: `${chats.length} Chats`,
        messagesCount: totalMsgs,
        mediaCount: totalMedia,
        outputDirectory,
        htmlPath: firstHtmlPath,
      });

      window.postMessage({ type: 'WALLIE_MULTI_EXPORT_COMPLETED', exportId, results }, '*');
    }
  });
}
