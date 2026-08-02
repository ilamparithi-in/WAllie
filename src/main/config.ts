import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { state } from './state';
import { Account, GlobalSettings, DEFAULT_ACCOUNT_SETTINGS } from '../shared/types';

const execFileAsync = promisify(execFile);

export const CHROME_VERSION = process.versions.chrome || '132.0.0.0';

function getOsPlatformString(): string {
  if (process.platform === 'win32') {
    return 'Windows NT 10.0; Win64; x64';
  }
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
  return `X11; Linux ${arch}`;
}

export const DEFAULT_USER_AGENT =
  `Mozilla/5.0 (${getOsPlatformString()}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`;


export const ACCOUNTS_FILE = path.join(app.getPath('userData'), 'accounts.json');
export const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
export const STORAGE_CACHE_TTL = 30000;

const storageSizeCache = new Map<string, { sizes: { cache: number; localStorage: number; indexedDb: number; cookies: number }; timestamp: number }>();

export function loadSettings(): GlobalSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
      const parsed = JSON.parse(data);
      let preloadAccountIds = parsed.preloadAccountIds;
      if (!Array.isArray(preloadAccountIds)) {
        if (parsed.loadAllOnLaunch) {
          try {
            if (fs.existsSync(ACCOUNTS_FILE)) {
              const accountsData = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
              const accs = JSON.parse(accountsData);
              if (Array.isArray(accs)) {
                preloadAccountIds = accs.map((a: any) => a.id);
              }
            }
          } catch (e) {
            console.error('Failed to load accounts for settings migration:', e);
          }
        }
        if (!Array.isArray(preloadAccountIds)) {
          preloadAccountIds = ['acc_default'];
        }
      }
      return {
        closeToTray: parsed.closeToTray !== false,
        hardwareAcceleration: parsed.hardwareAcceleration !== false,
        preloadAccountIds,
        showDevToolsToggle: !!parsed.showDevToolsToggle,
        showRefreshButton: parsed.showRefreshButton !== false,
        showNotificationHistoryButton: parsed.showNotificationHistoryButton !== false,
        notificationLoggingEnabled: !!parsed.notificationLoggingEnabled,
        extensionDevMode: !!parsed.extensionDevMode,
        autoUpdateExtensions: parsed.autoUpdateExtensions !== false,
        startMinimized: !!parsed.startMinimized,
        disclaimerAccepted: !!parsed.disclaimerAccepted,
      };
    }
  } catch (error) {
    console.error('Failed to load settings configuration:', error);
  }
  return {
    closeToTray: true,
    hardwareAcceleration: true,
    preloadAccountIds: ['acc_default'],
    showDevToolsToggle: false,
    showRefreshButton: true,
    showNotificationHistoryButton: true,
    notificationLoggingEnabled: false,
    extensionDevMode: false,
    autoUpdateExtensions: true,
    startMinimized: false,
    disclaimerAccepted: false,
  };
}

export async function saveSettings(settings: GlobalSettings) {
  try {
    await fs.promises.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to save settings configuration:', error);
  }
}

export function loadAccounts(): Account[] {
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) {
      const data = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((acc: any) => ({
          ...acc,
          loggedIn: !!acc.loggedIn,
          extensions: acc.extensions || [],
          unreadCount: 0,
          settings: {
            cameraEnabled: acc.settings?.cameraEnabled !== false,
            micEnabled: acc.settings?.micEnabled !== false,
            notificationsEnabled: acc.settings?.notificationsEnabled !== false,
            geolocationEnabled: acc.settings?.geolocationEnabled === true,
            clipboardReadEnabled: acc.settings?.clipboardReadEnabled === true,
            customCss: acc.settings?.customCss || '',
            selectedTheme: acc.settings?.selectedTheme || 'none',
          },
        }));
      }
    }
  } catch (error) {
    console.error('Failed to load accounts configuration:', error);
  }
  return [
    {
      id: 'acc_default',
      name: 'Primary Account',
      partition: 'persist:account_default',
      unreadCount: 0,
      loggedIn: false,
      extensions: [],
      settings: DEFAULT_ACCOUNT_SETTINGS,
    },
  ];
}

export async function saveAccounts() {
  try {
    const dataToSave = state.accounts.map(({ id, name, partition, loggedIn, extensions, settings, emoji }) => ({
      id,
      name,
      partition,
      loggedIn,
      extensions,
      emoji: emoji || '',
      settings: settings || DEFAULT_ACCOUNT_SETTINGS,
    }));
    await fs.promises.writeFile(ACCOUNTS_FILE, JSON.stringify(dataToSave, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to save accounts configuration:', error);
  }
}

export function getPartitionDirName(partition: string): string {
  if (partition.startsWith('persist:')) {
    return partition.substring(8);
  }
  return partition;
}

export async function calculatePathSize(itemPath: string, isRoot = true): Promise<number> {
  try {
    const stats = await fs.promises.stat(itemPath);
    if (stats.isFile()) {
      return stats.size;
    }

    if (isRoot) {
      try {
        const { stdout } = await execFileAsync('du', ['-sb', itemPath]);
        const match = stdout.trim().match(/^(\d+)/);
        if (match) {
          return parseInt(match[1], 10);
        }
      } catch { }
    }

    if (stats.isDirectory()) {
      const files = await fs.promises.readdir(itemPath);
      const sizes = await Promise.all(
        files.map((file) => calculatePathSize(path.join(itemPath, file), false))
      );
      return sizes.reduce((acc, curr) => acc + curr, 0);
    }
  } catch (err) {
    // Return 0 if folder/file doesn't exist
  }
  return 0;
}

export async function getAccountStorageSizes(partition: string) {
  const cached = storageSizeCache.get(partition);
  if (cached && Date.now() - cached.timestamp < STORAGE_CACHE_TTL) {
    return cached.sizes;
  }

  const partitionDirName = getPartitionDirName(partition);
  const partitionDir = path.join(app.getPath('userData'), 'Partitions', partitionDirName);

  const cacheDirs = ['Cache', 'Code Cache', 'GPUCache', 'DawnWebGPUCache', 'DawnGraphiteCache'];
  const localStorageDirs = ['Local Storage', 'Session Storage'];
  const indexedDbDirs = ['IndexedDB'];
  const cookiesFiles = ['Cookies', 'Cookies-journal'];

  const [cacheSizes, localStorageSizes, indexedDbSizes, cookiesSizes] = await Promise.all([
    Promise.all(cacheDirs.map((dir) => calculatePathSize(path.join(partitionDir, dir)))),
    Promise.all(localStorageDirs.map((dir) => calculatePathSize(path.join(partitionDir, dir)))),
    Promise.all(indexedDbDirs.map((dir) => calculatePathSize(path.join(partitionDir, dir)))),
    Promise.all(cookiesFiles.map((file) => calculatePathSize(path.join(partitionDir, file)))),
  ]);

  const sizes = {
    cache: cacheSizes.reduce((a, b) => a + b, 0),
    localStorage: localStorageSizes.reduce((a, b) => a + b, 0),
    indexedDb: indexedDbSizes.reduce((a, b) => a + b, 0),
    cookies: cookiesSizes.reduce((a, b) => a + b, 0),
  };

  const entry = { sizes, timestamp: Date.now() };
  storageSizeCache.set(partition, entry);
  return sizes;
}

export function invalidateStorageCache(partition: string) {
  storageSizeCache.delete(partition);
}
