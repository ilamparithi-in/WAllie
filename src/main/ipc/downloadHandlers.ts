import { ipcMain } from 'electron';
import { downloadManager } from '../downloads';
import {
  validate,
  filePathSchema,
  downloadIntentSchema,
  downloadFailureSchema,
  fileCardClickSchema,
} from './schemas';

export function registerDownloadHandlers(): void {
  ipcMain.handle('downloads:choose-folder', async () => {
    return downloadManager.chooseDownloadsFolder();
  });

  ipcMain.handle('downloads:open-file', async (_event, rawFilePath: unknown) => {
    const filePath = validate(filePathSchema, rawFilePath);
    return downloadManager.openDownloadedFile(filePath);
  });

  ipcMain.handle('downloads:show-in-folder', (_event, rawFilePath: unknown) => {
    const filePath = validate(filePathSchema, rawFilePath);
    return downloadManager.showItemInFolder(filePath);
  });

  ipcMain.handle('downloads:get-history', () => {
    return downloadManager.getHistory();
  });

  ipcMain.handle('downloads:clear-history', async () => {
    return downloadManager.clearHistory();
  });

  ipcMain.on('download:set-intent', (_event, rawData: unknown) => {
    const data = validate(downloadIntentSchema, rawData);
    downloadManager.setIntent(data.intent, data.filename, data.size, data.hash, data.autoOpen);
  });

  ipcMain.on('download:failure-detected', (_event, rawData: unknown) => {
    const data = validate(downloadFailureSchema, rawData);
    downloadManager.handleDownloadFailure(data.text, data.filename);
  });

  ipcMain.handle('downloads:file-card-clicked', async (_event, rawPayload: unknown) => {
    if (downloadManager.getIsExportActive()) {
      return { handled: false, isExisting: false };
    }
    const payload = validate(fileCardClickSchema, rawPayload);
    const filename = typeof payload === 'string' ? payload : payload.filename;
    const opts = typeof payload === 'object' ? { size: payload.size, hash: payload.hash } : undefined;
    return downloadManager.handleFileCardClick(filename, opts);
  });
}

