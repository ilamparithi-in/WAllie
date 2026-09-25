import { app, dialog, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { state } from './state';
import { showAppToast } from './utils';
import { DownloadRecord } from '../shared/types';
import { notificationManager } from './notifications/index';

export type DownloadIntent = 'first-download' | 'second-click' | 'context-menu-download' | 'none';

export class DownloadManager {
  private downloadsFile: string;
  private history: DownloadRecord[] = [];
  private pendingIntent: {
    intent: DownloadIntent;
    filename?: string;
    timestamp: number;
  } = { intent: 'none', timestamp: 0 };

  constructor() {
    this.downloadsFile = path.join(app.getPath('userData'), 'downloads.json');
    this.loadHistory();
  }

  private loadHistory(): void {
    try {
      if (fs.existsSync(this.downloadsFile)) {
        const data = fs.readFileSync(this.downloadsFile, 'utf8');
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          this.history = parsed;
        }
      }
    } catch (err) {
      console.error('Failed to load download history:', err);
      this.history = [];
    }
  }

  private async saveHistory(): Promise<void> {
    try {
      // Keep up to 200 recent records
      if (this.history.length > 200) {
        this.history = this.history.slice(0, 200);
      }
      await fs.promises.writeFile(this.downloadsFile, JSON.stringify(this.history, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to save download history:', err);
    }
  }

  public getHistory(): DownloadRecord[] {
    return [...this.history];
  }

  public async clearHistory(): Promise<boolean> {
    this.history = [];
    await this.saveHistory();
    return true;
  }

  public async addRecord(record: DownloadRecord): Promise<void> {
    // Add to beginning of history
    this.history.unshift(record);
    await this.saveHistory();
  }

  public setIntent(intent: DownloadIntent | 'anchor-detected', filename?: string): void {
    if (intent === 'anchor-detected') {
      if (this.pendingIntent.intent !== 'none' && Date.now() - this.pendingIntent.timestamp <= 5000) {
        if (filename && !this.pendingIntent.filename) {
          this.pendingIntent.filename = filename;
        }
        return;
      }
      return;
    }
    this.pendingIntent = {
      intent,
      filename,
      timestamp: Date.now(),
    };
  }

  public consumeIntent(): { intent: DownloadIntent; filename?: string } {
    const now = Date.now();
    // Allow up to 5 seconds between DOM click and will-download event
    if (now - this.pendingIntent.timestamp <= 5000) {
      const result = { ...this.pendingIntent };
      this.pendingIntent = { intent: 'none', timestamp: 0 };
      return result;
    }
    return { intent: 'none' };
  }

  public findExistingDownloadedFile(filename: string): DownloadRecord | undefined {
    // Check from newest to oldest for a record matching filename where file exists on disk
    return this.history.find(
      (rec) => rec.filename === filename && rec.state === 'completed' && fs.existsSync(rec.savePath)
    );
  }

  public async openDownloadedFile(filePath: string): Promise<boolean> {
    try {
      if (!filePath || typeof filePath !== 'string') {
        return false;
      }
      const resolved = path.resolve(filePath);
      if (!fs.existsSync(resolved)) {
        return false;
      }
      const error = await shell.openPath(resolved);
      return !error;
    } catch (err) {
      console.error('Failed to open downloaded file:', err);
      return false;
    }
  }

  public showItemInFolder(filePath: string): boolean {
    try {
      if (!filePath || typeof filePath !== 'string') {
        return false;
      }
      const resolved = path.resolve(filePath);
      if (!fs.existsSync(resolved)) {
        return false;
      }
      shell.showItemInFolder(resolved);
      return true;
    } catch (err) {
      console.error('Failed to show item in folder:', err);
      return false;
    }
  }

  public async chooseDownloadsFolder(): Promise<string | null> {
    const current = state.globalSettings?.defaultDownloadsPath || app.getPath('downloads');
    const result = await dialog.showOpenDialog(state.mainWindow || undefined as any, {
      title: 'Select Default Downloads Folder',
      defaultPath: current,
      properties: ['openDirectory', 'createDirectory'],
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  }

  public handleWillDownload(
    item: Electron.DownloadItem,
    webContents: Electron.WebContents,
    accountId: string
  ): void {
    const fileName = item.getFilename();
    const startTime = item.getStartTime();
    const { intent } = this.consumeIntent();

    const isContextMenu = intent === 'context-menu-download';
    const isSecondClick = intent === 'second-click';
    const askEveryTime = !!state.globalSettings?.askWhereToSaveEveryTime;
    const secondClickAction = state.globalSettings?.fileSecondClickAction || 'open';

    // Handle second click on an already downloaded file (bypass if user explicitly uses context menu download)
    if (isSecondClick && !isContextMenu) {
      const existing = this.findExistingDownloadedFile(fileName);
      if (existing) {
        if (secondClickAction === 'open') {
          console.log(`[DownloadManager] Second click detected for ${fileName}. Opening existing file.`);
          item.cancel();
          this.openDownloadedFile(existing.savePath);
          showAppToast(`Opening ${fileName}...`);
          return;
        } else if (secondClickAction === 'showInFolder') {
          console.log(`[DownloadManager] Second click detected for ${fileName}. Revealing in folder.`);
          item.cancel();
          this.showItemInFolder(existing.savePath);
          showAppToast(`Revealed ${fileName} in folder.`);
          return;
        }
        // If secondClickAction === 'download', fall through to download again
      } else {
        console.log(`[DownloadManager] Second click detected for ${fileName}, but file was moved/deleted. Re-downloading.`);
      }
    }

    const shouldPrompt = isContextMenu || askEveryTime || (isSecondClick && secondClickAction === 'saveAs');
    const defaultDir = state.globalSettings?.defaultDownloadsPath || app.getPath('downloads');

    if (!fs.existsSync(defaultDir)) {
      try {
        fs.mkdirSync(defaultDir, { recursive: true });
      } catch (err) {
        console.error('Failed to create default downloads directory:', err);
      }
    }

    if (shouldPrompt) {
      const ext = path.extname(fileName).replace(/^\./, '');
      const filters = ext ? [{ name: `${ext.toUpperCase()} File`, extensions: [ext] }, { name: 'All Files', extensions: ['*'] }] : [{ name: 'All Files', extensions: ['*'] }];
      item.setSaveDialogOptions({
        title: 'Save As',
        defaultPath: path.join(defaultDir, fileName),
        filters,
      });
    } else {
      const savePath = path.join(defaultDir, fileName);
      let uniqueSavePath = savePath;
      let counter = 1;
      const ext = path.extname(fileName);
      const base = path.basename(fileName, ext);
      while (fs.existsSync(uniqueSavePath)) {
        uniqueSavePath = path.join(defaultDir, `${base} (${counter})${ext}`);
        counter++;
      }
      item.setSavePath(uniqueSavePath);
    }

    const initialSavePath = item.getSavePath() || path.join(defaultDir, fileName);

    state.mainWindow?.webContents.send('download:progress', {
      id: startTime,
      filename: fileName,
      savePath: initialSavePath,
      percent: 0,
      state: 'progressing',
      receivedBytes: 0,
      totalBytes: item.getTotalBytes(),
    });

    item.on('updated', (_event, stateName) => {
      const currentSavePath = item.getSavePath() || path.join(defaultDir, fileName);
      if (stateName === 'interrupted') {
        state.mainWindow?.webContents.send('download:progress', {
          id: startTime,
          filename: fileName,
          savePath: currentSavePath,
          percent: 0,
          state: 'failed',
        });
      } else if (stateName === 'progressing') {
        if (!item.isPaused()) {
          const received = item.getReceivedBytes();
          const total = item.getTotalBytes();
          const percent = total > 0 ? Math.round((received / total) * 100) : 0;
          state.mainWindow?.webContents.send('download:progress', {
            id: startTime,
            filename: fileName,
            savePath: currentSavePath,
            percent,
            state: 'progressing',
            receivedBytes: received,
            totalBytes: total,
          });
        }
      }
    });

    item.once('done', async (_event, stateName) => {
      const finalPath = item.getSavePath() || path.join(defaultDir, fileName);
      if (stateName === 'completed') {
        await this.addRecord({
          id: startTime,
          filename: fileName,
          savePath: finalPath,
          fileSize: item.getTotalBytes(),
          mimeType: item.getMimeType(),
          timestamp: Date.now(),
          accountId,
          state: 'completed',
        });

        state.mainWindow?.webContents.send('download:progress', {
          id: startTime,
          filename: fileName,
          savePath: finalPath,
          percent: 100,
          state: 'completed',
        });

        if (state.globalSettings?.downloadNotificationsEnabled !== false) {
          const dismissalTimeSec = typeof state.globalSettings?.notificationDismissalTime === 'number'
            ? state.globalSettings.notificationDismissalTime
            : 10;
          const timeoutMs = dismissalTimeSec === -1 ? -1 : (dismissalTimeSec === 0 ? 0 : dismissalTimeSec * 1000);

          await notificationManager.notify({
            title: 'Download Complete',
            body: `Successfully downloaded ${path.basename(finalPath)}`,
            icon: 'document-save',
            timeoutMs,
            actions: [
              { id: 'default', label: 'Open' },
              { id: 'open', label: 'Open' },
              { id: 'show_in_folder', label: 'Show in Folder' },
            ],
            onAction: (actionId) => {
              if (actionId === 'default' || actionId === 'open') {
                this.openDownloadedFile(finalPath);
              } else if (actionId === 'show_in_folder') {
                this.showItemInFolder(finalPath);
              }
            },
          });
        }
      } else if (stateName === 'cancelled') {
        state.mainWindow?.webContents.send('download:progress', {
          id: startTime,
          filename: fileName,
          savePath: finalPath,
          percent: 0,
          state: 'cancelled',
        });
      } else {
        state.mainWindow?.webContents.send('download:progress', {
          id: startTime,
          filename: fileName,
          savePath: finalPath,
          percent: 0,
          state: 'failed',
        });
      }
    });
  }
}

export const downloadManager = new DownloadManager();
