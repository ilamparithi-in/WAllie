import { app, dialog, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { state } from './state';
import { showAppToast } from './utils';
import { DownloadRecord } from '../shared/types';
import { notificationManager } from './notifications/index';
import { saveSettings } from './config';

export const LARGE_FILE_THRESHOLD = 64 * 1024 * 1024; // 64 MB

export interface FileMatchOptions {
  size?: number;
  hash?: string;
}

export type DownloadIntent = 'first-download' | 'second-click' | 'context-menu-download' | 'none';

export class DownloadManager {
  private downloadsFile: string;
  private history: DownloadRecord[] = [];
  private lastManualDownloadPath?: string;
  private lastOpenedPath?: string;
  private lastOpenedFilename?: string;
  private lastOpenedTimestamp: number = 0;
  private pendingIntent: {
    intent: DownloadIntent;
    filename?: string;
    size?: number;
    hash?: string;
    timestamp: number;
  } = { intent: 'none', timestamp: 0 };

  constructor() {
    this.downloadsFile = path.join(app.getPath('userData'), 'downloads.json');
    this.lastManualDownloadPath = state.globalSettings?.lastManualDownloadPath;
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

  public setIntent(intent: DownloadIntent | 'anchor-detected', filename?: string, size?: number, hash?: string): void {
    if (intent === 'anchor-detected') {
      if (this.pendingIntent.intent !== 'none' && Date.now() - this.pendingIntent.timestamp <= 5000) {
        if (filename && !this.pendingIntent.filename) {
          this.pendingIntent.filename = filename;
        }
        if (size !== undefined && this.pendingIntent.size === undefined) {
          this.pendingIntent.size = size;
        }
        if (hash && !this.pendingIntent.hash) {
          this.pendingIntent.hash = hash;
        }
        return;
      }
      this.pendingIntent = {
        intent: 'none',
        filename,
        size,
        hash,
        timestamp: Date.now(),
      };
      return;
    }
    this.pendingIntent = {
      intent,
      filename,
      size,
      hash,
      timestamp: Date.now(),
    };
  }

  public consumeIntent(): { intent: DownloadIntent; filename?: string; size?: number; hash?: string } {
    const now = Date.now();
    // Allow up to 5 seconds between DOM click and will-download event
    if (now - this.pendingIntent.timestamp <= 5000) {
      const result = { ...this.pendingIntent };
      this.pendingIntent = { intent: 'none', timestamp: 0 };
      return result;
    }
    return { intent: 'none' };
  }

  public doesFileMatch(
    candidatePath: string,
    candidateFilename: string,
    targetFilename: string,
    cachedSize?: number,
    cachedHash?: string,
    options?: FileMatchOptions
  ): boolean {
    if (!fs.existsSync(candidatePath)) return false;

    // 1. Filename match (case-insensitive & trimmed)
    const norm = (s: string) => s.trim().toLowerCase();
    const cleanTarget = norm(targetFilename);
    const cleanCandidateName = norm(candidateFilename);
    const cleanBase = norm(path.basename(candidatePath));

    if (cleanCandidateName !== cleanTarget && cleanBase !== cleanTarget) {
      return false;
    }

    // If no size or hash options provided, matching name & existence is sufficient
    if (!options || (options.size === undefined && !options.hash)) {
      return true;
    }

    let diskSize = cachedSize;
    if (diskSize === undefined) {
      try {
        diskSize = fs.statSync(candidatePath).size;
      } catch {
        return false;
      }
    }

    // 2. Check if it's considered a large file (> 20 MB)
    const targetSize = options.size !== undefined ? options.size : diskSize;
    const isLarge = targetSize > LARGE_FILE_THRESHOLD || diskSize > LARGE_FILE_THRESHOLD;

    if (isLarge) {
      // For large files, compare the file size alone with 5% tolerance
      if (options.size !== undefined) {
        const tolerance = Math.max(diskSize * 0.05, 1024);
        const diff = Math.abs(diskSize - options.size);
        if (diff > tolerance) {
          return false;
        }
      }
      return true;
    }

    // 3. For non-large files, match both name and hash (with fallback to size with 5% tolerance if hash not yet available)
    if (options.hash) {
      let fileHash = cachedHash;
      if (!fileHash) {
        try {
          const buf = fs.readFileSync(candidatePath);
          fileHash = crypto.createHash('sha256').update(buf).digest('hex');
        } catch (err) {
          console.error('[DownloadManager] Failed to compute hash of file on disk:', err);
        }
      }
      if (fileHash && fileHash.toLowerCase() !== options.hash.toLowerCase()) {
        return false;
      }
      return true;
    }

    if (options.size !== undefined) {
      // If we only have size, compare size with 5% tolerance
      const tolerance = Math.max(diskSize * 0.05, 2048);
      const diff = Math.abs(diskSize - options.size);
      if (diff > tolerance) {
        return false;
      }
    }

    return true;
  }

  public findExistingDownloadedFile(filename: string, options?: FileMatchOptions): DownloadRecord | undefined {
    if (!filename || typeof filename !== 'string') return undefined;

    // 1. Check history for completed records matching criteria
    const inHistory = this.history.find((rec) => {
      if (rec.state !== 'completed') return false;
      return this.doesFileMatch(rec.savePath, rec.filename, filename, rec.fileSize, rec.fileHash, options);
    });

    if (inHistory) return inHistory;

    // 2. Fallback: check default download directory
    const defaultDir = state.globalSettings?.defaultDownloadsPath || app.getPath('downloads');
    const defaultPath = path.join(defaultDir, filename.trim());
    if (this.doesFileMatch(defaultPath, filename, filename, undefined, undefined, options)) {
      let statSize: number | undefined;
      let statHash: string | undefined;
      try {
        statSize = fs.statSync(defaultPath).size;
        if (statSize <= LARGE_FILE_THRESHOLD) {
          statHash = crypto.createHash('sha256').update(fs.readFileSync(defaultPath)).digest('hex');
        }
      } catch {}
      return {
        id: Date.now(),
        filename: filename.trim(),
        savePath: defaultPath,
        fileSize: statSize,
        fileHash: statHash,
        timestamp: Date.now(),
        state: 'completed',
      };
    }

    // 3. Fallback: check last manual download directory
    const manualDir = this.lastManualDownloadPath || state.globalSettings?.lastManualDownloadPath;
    if (manualDir && manualDir !== defaultDir && fs.existsSync(manualDir)) {
      const manualPath = path.join(manualDir, filename.trim());
      if (this.doesFileMatch(manualPath, filename, filename, undefined, undefined, options)) {
        let statSize: number | undefined;
        let statHash: string | undefined;
        try {
          statSize = fs.statSync(manualPath).size;
          if (statSize <= LARGE_FILE_THRESHOLD) {
            statHash = crypto.createHash('sha256').update(fs.readFileSync(manualPath)).digest('hex');
          }
        } catch {}
        return {
          id: Date.now(),
          filename: filename.trim(),
          savePath: manualPath,
          fileSize: statSize,
          fileHash: statHash,
          timestamp: Date.now(),
          state: 'completed',
        };
      }
    }

    return undefined;
  }

  public async handleFileCardClick(filename: string, options?: FileMatchOptions): Promise<{ handled: boolean; isExisting: boolean }> {
    if (!filename || typeof filename !== 'string') return { handled: false, isExisting: false };
    const trimmed = filename.trim();

    const existing = this.findExistingDownloadedFile(trimmed, options);
    if (!existing) {
      return { handled: false, isExisting: false };
    }

    this.setIntent('second-click', trimmed, options?.size, options?.hash);

    const action = state.globalSettings?.fileSecondClickAction || 'open';
    if (action === 'open') {
      if (this.lastOpenedPath === existing.savePath && Date.now() - this.lastOpenedTimestamp < 1500) {
        return { handled: true, isExisting: true };
      }
      this.lastOpenedPath = path.resolve(existing.savePath);
      this.lastOpenedFilename = trimmed.toLowerCase();
      this.lastOpenedTimestamp = Date.now();
      console.log(`[DownloadManager] Opening file directly on card click: ${existing.savePath}`);
      await this.openDownloadedFile(existing.savePath);
      showAppToast(`Opened ${trimmed}`);
      return { handled: true, isExisting: true };
    } else if (action === 'showInFolder') {
      if (this.lastOpenedPath === existing.savePath && Date.now() - this.lastOpenedTimestamp < 1500) {
        return { handled: true, isExisting: true };
      }
      this.lastOpenedPath = existing.savePath;
      this.lastOpenedTimestamp = Date.now();
      console.log(`[DownloadManager] Revealing file in folder on card click: ${existing.savePath}`);
      this.showItemInFolder(existing.savePath);
      showAppToast(`Revealed ${trimmed} in folder.`);
      return { handled: true, isExisting: true };
    }

    return { handled: false, isExisting: true };
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
    const totalBytes = item.getTotalBytes();
    const { intent, filename: intentFilename, size: intentSize, hash: intentHash } = this.consumeIntent();

    const isContextMenu = intent === 'context-menu-download';
    const isSecondClick = intent === 'second-click';
    const askEveryTime = !!state.globalSettings?.askWhereToSaveEveryTime;
    const secondClickAction = state.globalSettings?.fileSecondClickAction || 'open';

    const matchOpts: FileMatchOptions = {
      size: intentSize !== undefined ? intentSize : (totalBytes > 0 ? totalBytes : undefined),
      hash: intentHash,
    };

    // Check if file exists matching name and hash/size
    const existing = this.findExistingDownloadedFile(fileName, matchOpts) || 
      (intentFilename ? this.findExistingDownloadedFile(intentFilename, matchOpts) : undefined);

    // If file already exists and matches on disk, handle as second click (open / showInFolder)
    // unless user explicitly selected "Download" from context menu or action is 'download'
    if (!isContextMenu && existing) {
      const isRecentlyOpened = (
        (this.lastOpenedPath && (this.lastOpenedPath === path.resolve(existing.savePath) || path.basename(this.lastOpenedPath).toLowerCase() === fileName.toLowerCase())) ||
        (this.lastOpenedFilename && (this.lastOpenedFilename === fileName.toLowerCase() || (intentFilename && this.lastOpenedFilename === intentFilename.toLowerCase())))
      ) && Date.now() - this.lastOpenedTimestamp < 5000;

      if (isRecentlyOpened) {
        console.log(`[DownloadManager] Download cancelled as file was already opened on click: ${fileName}`);
        item.cancel();
        return;
      }
      if (secondClickAction === 'open') {
        console.log(`[DownloadManager] Matching downloaded file detected for ${fileName}. Opening existing file.`);
        item.cancel();
        this.lastOpenedPath = path.resolve(existing.savePath);
        this.lastOpenedFilename = fileName.toLowerCase();
        this.lastOpenedTimestamp = Date.now();
        this.openDownloadedFile(existing.savePath);
        showAppToast(`Opened ${fileName}`);
        return;
      } else if (secondClickAction === 'showInFolder') {
        console.log(`[DownloadManager] Matching downloaded file detected for ${fileName}. Revealing in folder.`);
        item.cancel();
        this.lastOpenedPath = path.resolve(existing.savePath);
        this.lastOpenedFilename = fileName.toLowerCase();
        this.lastOpenedTimestamp = Date.now();
        this.showItemInFolder(existing.savePath);
        showAppToast(`Revealed ${fileName} in folder.`);
        return;
      }
      // If secondClickAction === 'download', fall through to download again
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

    const manualDir = this.lastManualDownloadPath || state.globalSettings?.lastManualDownloadPath;
    const promptDir = (manualDir && fs.existsSync(manualDir)) ? manualDir : defaultDir;

    if (shouldPrompt) {
      const ext = path.extname(fileName).replace(/^\./, '');
      const filters = ext ? [{ name: `${ext.toUpperCase()} File`, extensions: [ext] }, { name: 'All Files', extensions: ['*'] }] : [{ name: 'All Files', extensions: ['*'] }];
      item.setSaveDialogOptions({
        title: 'Save As',
        defaultPath: path.join(promptDir, fileName),
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

    const recordManualPath = (filePath?: string) => {
      if (shouldPrompt && filePath) {
        const dir = path.dirname(filePath);
        if (dir && fs.existsSync(dir) && dir !== this.lastManualDownloadPath) {
          this.lastManualDownloadPath = dir;
          if (state.globalSettings) {
            state.globalSettings.lastManualDownloadPath = dir;
            saveSettings(state.globalSettings);
          }
        }
      }
    };

    const initialSavePath = item.getSavePath() || path.join(promptDir, fileName);

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
      recordManualPath(item.getSavePath());
      const currentSavePath = item.getSavePath() || path.join(promptDir, fileName);
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
      const finalPath = item.getSavePath() || path.join(promptDir, fileName);
      recordManualPath(finalPath);
      if (stateName === 'completed') {
        let fileHash: string | undefined;
        const totalBytes = item.getTotalBytes();
        if (totalBytes <= LARGE_FILE_THRESHOLD && fs.existsSync(finalPath)) {
          try {
            const buf = await fs.promises.readFile(finalPath);
            fileHash = crypto.createHash('sha256').update(buf).digest('hex');
          } catch (err) {
            console.error('[DownloadManager] Failed to hash downloaded file:', err);
          }
        }

        await this.addRecord({
          id: startTime,
          filename: fileName,
          savePath: finalPath,
          fileSize: totalBytes,
          fileHash,
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
