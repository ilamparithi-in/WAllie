import { ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import AdmZip from 'adm-zip';
import { state } from '../state';
import { getActiveWebContents } from '../views';
import { downloadManager } from '../downloads';
import { chatExporterManager } from '../chatExporter';
import type { WhatsAppChatExport, ChatExportOptions } from '../../shared/chatExportTypes';
import {
  validate,
  filePathSchema,
  exportIdSchema,
} from './schemas';

export function registerChatExportHandlers(): void {
  ipcMain.handle('chat-export:prompt-directory', async (_event, defaultName?: unknown) => {
    const name = typeof defaultName === 'string' ? defaultName.trim().substring(0, 200) : undefined;
    return await chatExporterManager.promptExportDirectory(name);
  });

  ipcMain.handle('chat-export:prompt-open-file', async () => {
    return await chatExporterManager.promptOpenExportFile();
  });

  ipcMain.handle('chat-export:open-viewer', async (_event, rawFilePath: unknown) => {
    const filePath = validate(filePathSchema, rawFilePath);
    return await chatExporterManager.openExportViewerWindow(filePath);
  });

  ipcMain.handle('chat-export:stop', (_event, rawExportId?: unknown) => {
    downloadManager.setExportActive(false);
    const exportId = typeof rawExportId === 'string' && rawExportId.trim() ? validate(exportIdSchema, rawExportId) : undefined;
    return chatExporterManager.stopExport(exportId);
  });

  ipcMain.handle('chat-export:is-aborted', (_event, rawExportId: unknown) => {
    const exportId = validate(exportIdSchema, rawExportId);
    return chatExporterManager.isExportAborted(exportId);
  });

  ipcMain.handle(
    'chat-export:register-job',
    (_event, rawExportId: unknown, options: ChatExportOptions, totalChats: unknown, currentChatIndex: unknown) => {
      const exportId = validate(exportIdSchema, rawExportId);
      const total = typeof totalChats === 'number' ? totalChats : 1;
      const index = typeof currentChatIndex === 'number' ? currentChatIndex : 0;
      downloadManager.setExportActive(true);
      chatExporterManager.registerJob(exportId, options, total, index);
      return true;
    }
  );

  ipcMain.handle('chat-export:update-progress', (_event, rawExportId: unknown, partial: any) => {
    const exportId = validate(exportIdSchema, rawExportId);
    chatExporterManager.updateProgress(exportId, partial);
    return true;
  });

  ipcMain.handle('chat-export:complete-job', (_event, rawExportId: unknown) => {
    const exportId = validate(exportIdSchema, rawExportId);
    downloadManager.setExportActive(false);
    chatExporterManager.completeJob(exportId);
    return true;
  });

  ipcMain.handle(
    'chat-export:save-media',
    async (
      _event,
      rawOutputDirectory: unknown,
      rawFilesDirName: unknown,
      rawSubPath: unknown,
      data: string | Buffer
    ) => {
      const outputDirectory = validate(filePathSchema, rawOutputDirectory);
      const filesDirName = typeof rawFilesDirName === 'string' ? rawFilesDirName.replace(/[/\\?%*:|"<>]/g, '_') : 'files';
      const subPath = typeof rawSubPath === 'string' ? rawSubPath.replace(/\.\./g, '_') : 'file';
      return await chatExporterManager.saveMediaFile(outputDirectory, filesDirName, subPath, data);
    }
  );

  ipcMain.handle('chat-export:find-existing-file', async (_event, rawFilename: unknown, size?: unknown) => {
    const filename = typeof rawFilename === 'string' ? rawFilename.trim() : '';
    const validSize = typeof size === 'number' ? size : undefined;
    let existing = downloadManager.findExistingDownloadedFile(filename, { size: validSize });
    if (!existing && validSize !== undefined) {
      existing = downloadManager.findExistingDownloadedFile(filename);
    }
    if (existing && existing.savePath && fs.existsSync(existing.savePath)) {
      return { found: true, path: existing.savePath };
    }
    return { found: false };
  });

  ipcMain.handle(
    'chat-export:copy-file-to-export',
    async (_event, rawOutputDirectory: unknown, rawFilesDirName: unknown, rawSubPath: unknown, rawSourcePath: unknown) => {
      const outputDirectory = validate(filePathSchema, rawOutputDirectory);
      const sourcePath = validate(filePathSchema, rawSourcePath);
      const filesDirName = typeof rawFilesDirName === 'string' ? rawFilesDirName.replace(/[/\\?%*:|"<>]/g, '_') : 'files';
      const subPath = typeof rawSubPath === 'string' ? rawSubPath.replace(/\.\./g, '_') : 'file';

      const fullDest = path.join(outputDirectory, filesDirName, subPath);
      const destDir = path.dirname(fullDest);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      await fs.promises.copyFile(sourcePath, fullDest);

      downloadManager.markExportPathConsumed(sourcePath);

      if (downloadManager.isExportDownloadedPath(sourcePath)) {
        try {
          await fs.promises.unlink(sourcePath);
          downloadManager.removeExportDownloadedPath(sourcePath);
        } catch (e) {
          console.warn('[chat-export] Failed to clean up temporary download file:', e);
        }
      }

      return `${filesDirName}/${subPath}`;
    }
  );

  ipcMain.handle('chat-export:prepare-export-download', async (_event, filename?: unknown, size?: unknown) => {
    const safeFilename = typeof filename === 'string' ? filename.trim() : undefined;
    const safeSize = typeof size === 'number' ? size : undefined;
    downloadManager.setIntent('export-download', safeFilename, safeSize);
    return true;
  });

  ipcMain.handle('chat-export:dispatch-mouse', async (_event, rawType: unknown, rawX: unknown, rawY: unknown) => {
    try {
      const type = rawType === 'contextmenu' ? 'contextmenu' : 'click';
      const x = typeof rawX === 'number' ? rawX : 0;
      const y = typeof rawY === 'number' ? rawY : 0;
      const activeView = state.accountViews.get(state.activeAccountId);
      const activeWebContents = activeView?.webContents;
      if (!activeWebContents) return false;
      const cx = Math.floor(x);
      const cy = Math.floor(y);
      if (type === 'contextmenu') {
        activeWebContents.sendInputEvent({ type: 'mouseDown', x: cx, y: cy, button: 'right', clickCount: 1 });
        activeWebContents.sendInputEvent({ type: 'mouseUp', x: cx, y: cy, button: 'right', clickCount: 1 });
      } else {
        activeWebContents.sendInputEvent({ type: 'mouseDown', x: cx, y: cy, button: 'left', clickCount: 1 });
        activeWebContents.sendInputEvent({ type: 'mouseUp', x: cx, y: cy, button: 'left', clickCount: 1 });
      }
      return true;
    } catch (err) {
      console.warn('[chat-export] dispatch-mouse error:', err);
      return false;
    }
  });

  ipcMain.handle('chat-export:wait-for-download', async (_event, rawExpectedFilename?: unknown, rawTimeoutMs?: unknown) => {
    const expectedFilename = typeof rawExpectedFilename === 'string' ? rawExpectedFilename.trim() : undefined;
    const timeoutMs = typeof rawTimeoutMs === 'number' ? rawTimeoutMs : 8000;
    const rec = await downloadManager.waitForRecentDownload(expectedFilename, timeoutMs);
    return { success: !!rec, savePath: rec?.savePath, filename: rec?.filename };
  });

  ipcMain.handle(
    'chat-export:unzip-album-download',
    async (
      _event,
      rawOutputDirectory: unknown,
      rawFilesDirName: unknown,
      rawZipPath: unknown,
      stanzaIds: unknown
    ) => {
      try {
        const outputDirectory = validate(filePathSchema, rawOutputDirectory);
        const zipPath = validate(filePathSchema, rawZipPath);
        const filesDirName = typeof rawFilesDirName === 'string' ? rawFilesDirName.replace(/[/\\?%*:|"<>]/g, '_') : 'files';
        const safeStanzaIds = Array.isArray(stanzaIds) ? stanzaIds.map((s) => String(s)) : [];

        if (!fs.existsSync(zipPath)) {
          return { success: false, error: 'Zip file does not exist', count: 0, mapping: {} };
        }
        const zip = new AdmZip(zipPath);
        const entries = zip
          .getEntries()
          .filter((e) => !e.isDirectory && !e.entryName.includes('__MACOSX') && !path.basename(e.entryName).startsWith('.'));

        entries.sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true, sensitivity: 'base' }));

        const mediaDir = path.join(outputDirectory, filesDirName, 'media');
        await fs.promises.mkdir(mediaDir, { recursive: true });

        const mapping: Record<string, string> = {};

        for (let i = 0; i < entries.length; i++) {
          const zipEntry = entries[i];
          const stanzaId = safeStanzaIds[i] || `album_item_${i + 1}`;
          const ext = path.extname(zipEntry.entryName) || '.jpeg';
          const safeName = `${stanzaId}${ext}`;
          const destPath = path.join(mediaDir, safeName);

          await fs.promises.writeFile(destPath, zipEntry.getData());
          mapping[stanzaId] = `${filesDirName}/media/${safeName}`;
        }

        if (downloadManager.isExportDownloadedPath(zipPath)) {
          try {
            await fs.promises.unlink(zipPath);
            downloadManager.removeExportDownloadedPath(zipPath);
          } catch (e) {
            console.warn('[chat-export] Failed to clean up zip file:', e);
          }
        }

        return { success: true, count: entries.length, mapping };
      } catch (err: any) {
        console.error('[chat-export] Failed to unzip album download:', err);
        return { success: false, error: err.message, count: 0, mapping: {} };
      }
    }
  );

  ipcMain.handle(
    'chat-export:finalize',
    async (_event, rawOutputDirectory: unknown, exportData: WhatsAppChatExport, includeViewer: unknown) => {
      const outputDirectory = validate(filePathSchema, rawOutputDirectory);
      downloadManager.setExportActive(false);
      return await chatExporterManager.finalizeExport(outputDirectory, exportData, Boolean(includeViewer));
    }
  );

  ipcMain.handle('chat-export:get-chats', async () => {
    const activeContents = getActiveWebContents();
    if (!activeContents || activeContents.isDestroyed()) return [];
    try {
      return await activeContents.executeJavaScript(`
        window.__wallie_chat_exporter ? window.__wallie_chat_exporter.getAvailableChats() : []
      `);
    } catch (err) {
      console.error('[chat-export] Failed to get chats:', err);
      return [];
    }
  });

  ipcMain.handle('chat-export:get-active-chat', async () => {
    const activeContents = getActiveWebContents();
    if (!activeContents || activeContents.isDestroyed()) return null;
    try {
      return await activeContents.executeJavaScript(`
        window.__wallie_chat_exporter ? window.__wallie_chat_exporter.getActiveChatInfo() : null
      `);
    } catch {
      return null;
    }
  });

  ipcMain.handle('chat-export:start', async (_event, options: ChatExportOptions) => {
    const activeContents = getActiveWebContents();
    if (!activeContents || activeContents.isDestroyed()) {
      return { success: false, error: 'WhatsApp view not loaded' };
    }
    const exportId = `export_${Date.now()}`;
    activeContents.executeJavaScript(`
      window.postMessage({
        type: 'WALLIE_START_SINGLE_EXPORT',
        exportId: ${JSON.stringify(exportId)},
        options: ${JSON.stringify(options)}
      }, '*');
    `);
    return { success: true, exportId };
  });

  ipcMain.handle('chat-export:start-multi', async (_event, request: any) => {
    const activeContents = getActiveWebContents();
    if (!activeContents || activeContents.isDestroyed()) {
      return { success: false, error: 'WhatsApp view not loaded' };
    }
    const exportId = `multi_export_${Date.now()}`;
    activeContents.executeJavaScript(`
      window.postMessage({
        type: 'WALLIE_START_MULTI_EXPORT',
        exportId: ${JSON.stringify(exportId)},
        chats: ${JSON.stringify(request.chats)},
        outputDirectory: ${JSON.stringify(request.outputDirectory)},
        includeViewer: ${JSON.stringify(request.includeViewer)},
        timeframeBoundary: ${JSON.stringify(request.timeframeBoundary)}
      }, '*');
    `);
    return { success: true, exportId };
  });
}

