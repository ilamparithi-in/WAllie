import { app, dialog, session, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import AdmZip from 'adm-zip';
import { state } from './state';
import { saveAccounts, CHROME_VERSION, DEFAULT_USER_AGENT } from './config';
import { ExtensionInfo } from '../shared/types';
import { getAccountById } from './utils';

const EXTENSIONS_BASE = path.join(app.getPath('userData'), 'extensions');

export function safeDeleteExtensionDir(extPath: string): void {
  const resolved = path.resolve(extPath);
  if (!resolved.startsWith(EXTENSIONS_BASE + path.sep) && resolved !== EXTENSIONS_BASE) {
    console.error(`Refusing to delete path outside extensions directory: ${resolved}`);
    return;
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

export function crxToZip(crxBuffer: Buffer): Buffer {
  const magic = crxBuffer.toString('utf8', 0, 4);
  if (magic !== 'Cr24') {
    throw new Error('Not a valid CRX file (missing Cr24 magic number)');
  }
  const version = crxBuffer.readUInt32LE(4);
  let zipOffset: number;
  if (version === 2) {
    const publicKeyLength = crxBuffer.readUInt32LE(8);
    const signatureLength = crxBuffer.readUInt32LE(12);
    zipOffset = 16 + publicKeyLength + signatureLength;
  } else if (version === 3) {
    const headerLength = crxBuffer.readUInt32LE(8);
    zipOffset = 12 + headerLength;
  } else {
    throw new Error(`Unsupported CRX version: ${version}`);
  }
  return crxBuffer.subarray(zipOffset);
}

export async function showExtensionPermissionWarning(
  parentWindow: BrowserWindow,
  manifestPath: string,
  extensionName: string
): Promise<boolean> {
  try {
    const manifestContent = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestContent);
    
    const permissions: string[] = [
      ...(manifest.permissions || []),
      ...(manifest.optional_permissions || []),
    ];
    const hostPermissions: string[] = [
      ...(manifest.host_permissions || []),
    ];
    
    const contentScriptHosts: string[] = [];
    if (manifest.content_scripts) {
      for (const cs of manifest.content_scripts) {
        if (cs.matches) {
          contentScriptHosts.push(...cs.matches);
        }
      }
    }
    
    const dangerousPermissions = ['<all_urls>', 'cookies', 'webRequest', 'webRequestBlocking', 'debugger', 'proxy', 'nativeMessaging'];
    const hasDangerous = permissions.some(p => dangerousPermissions.includes(p)) ||
                         hostPermissions.some(h => h === '<all_urls>' || h === '*://*/*');
    
    let detail = '';
    if (permissions.length > 0) {
      detail += `Permissions: ${permissions.join(', ')}\n`;
    }
    if (hostPermissions.length > 0) {
      detail += `Host access: ${hostPermissions.join(', ')}\n`;
    }
    if (contentScriptHosts.length > 0) {
      detail += `Content scripts on: ${contentScriptHosts.join(', ')}\n`;
    }
    if (!detail) {
      detail = 'This extension requests no special permissions.';
    }
    
    const warningPrefix = hasDangerous
      ? '⚠️ WARNING: This extension requests powerful permissions that could access your WhatsApp data.\n\n'
      : '';
    
    const choice = await dialog.showMessageBox(parentWindow, {
      type: hasDangerous ? 'warning' : 'question',
      buttons: ['Cancel', 'Install Anyway'],
      defaultId: 0,
      cancelId: 0,
      title: 'Extension Permissions',
      message: `Install "${extensionName}"?`,
      detail: warningPrefix + detail + '\n\nOnly install extensions you trust.',
    });
    
    return choice.response === 1;
  } catch (err) {
    console.error('Failed to parse extension manifest for permissions check:', err);
    return true;
  }
}

export async function importExtension(accountId: string, importType: 'folder' | 'archive'): Promise<ExtensionInfo | null> {
  if (!state.mainWindow) return null;

  let properties: ('openFile' | 'openDirectory')[] = [];
  let filters: { name: string; extensions: string[] }[] = [];

  if (importType === 'folder') {
    properties = ['openDirectory'];
  } else {
    properties = ['openFile'];
    filters = [{ name: 'Chrome Extension Archive', extensions: ['zip', 'crx'] }];
  }

  const result = await dialog.showOpenDialog(state.mainWindow, {
    title: importType === 'folder' ? 'Import Unpacked Extension Folder' : 'Import Extension ZIP/CRX File',
    properties,
    filters
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const selectedPath = result.filePaths[0];
  const isDirectory = fs.statSync(selectedPath).isDirectory();

  if (importType === 'folder' && !isDirectory) {
    throw new Error('Selected path is not a directory.');
  }
  if (importType === 'archive' && isDirectory) {
    throw new Error('Selected path is a directory. Please select a ZIP or CRX archive.');
  }

  const extId = `ext_${Date.now()}`;
  const targetDir = path.join(app.getPath('userData'), 'extensions', accountId, extId);

  try {
    fs.mkdirSync(targetDir, { recursive: true });

    if (isDirectory) {
      fs.cpSync(selectedPath, targetDir, { recursive: true });
    } else {
      const buffer = fs.readFileSync(selectedPath);
      let zipBuffer: any = buffer;
      if (selectedPath.endsWith('.crx')) {
        zipBuffer = crxToZip(buffer);
      }
      const zip = new AdmZip(zipBuffer);
      zip.extractAllTo(targetDir, true);
    }

    const manifestPath = path.join(targetDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      safeDeleteExtensionDir(targetDir);
      throw new Error('Missing manifest.json inside the extension');
    }

    const manifestContent = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestContent);

    const newExtension: ExtensionInfo = {
      id: extId,
      name: manifest.name || 'Unnamed Extension',
      version: manifest.version || '1.0.0',
      path: targetDir,
      enabled: true,
    };

    const userApproved = await showExtensionPermissionWarning(state.mainWindow, manifestPath, newExtension.name);
    if (!userApproved) {
      safeDeleteExtensionDir(targetDir);
      return null;
    }

    const account = getAccountById(accountId);
    if (account) {
      if (!account.extensions) {
        account.extensions = [];
      }
      account.extensions.push(newExtension);
      await saveAccounts();

      const view = state.accountViews.get(accountId);
      if (view) {
        const accountSession = session.fromPartition(account.partition);
        await accountSession.loadExtension(targetDir);
      }

      state.mainWindow.webContents.send('account:list-changed', state.accounts, state.activeAccountId);
      return newExtension;
    }
  } catch (err: any) {
    console.error('Failed to import extension:', err);
    if (fs.existsSync(targetDir)) {
      try {
        safeDeleteExtensionDir(targetDir);
      } catch (_) {}
    }
    dialog.showErrorBox('Extension Import Error', err.message || 'An unknown error occurred during import.');
    throw err;
  }

  return null;
}

export async function installWebStoreExtension(accountId: string, urlOrId: string): Promise<ExtensionInfo | null> {
  const match = urlOrId.match(/([a-p]{32})/i);
  if (!match) {
    throw new Error('Invalid Chrome Web Store URL or Extension ID.');
  }
  const extensionId = match[1].toLowerCase();
  const targetDir = path.join(app.getPath('userData'), 'extensions', accountId, extensionId);

  try {
    const downloadUrl = `https://clients2.google.com/service/update2/crx?response=redirect&os=linux&arch=x86-64&os_arch=x86-64&prod=chromecrx&prodchannel=unknown&prodversion=${CHROME_VERSION}&acceptformat=crx3&x=id%3D${extensionId}%26uc`;
    
    const response = await fetch(downloadUrl, {
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        'Referer': `https://chrome.google.com/webstore/detail/${extensionId}?hl=en`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to download from Chrome Web Store (HTTP ${response.status})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const crxBuffer = Buffer.from(arrayBuffer);
    const zipBuffer = crxToZip(crxBuffer);

    if (fs.existsSync(targetDir)) {
      safeDeleteExtensionDir(targetDir);
    }
    fs.mkdirSync(targetDir, { recursive: true });

    const zip = new AdmZip(zipBuffer);
    zip.extractAllTo(targetDir, true);

    const manifestPath = path.join(targetDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      safeDeleteExtensionDir(targetDir);
      throw new Error('Manifest.json not found inside downloaded extension.');
    }

    const manifestContent = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestContent);

    const newExtension: ExtensionInfo = {
      id: extensionId,
      name: manifest.name || 'Unnamed Extension',
      version: manifest.version || '1.0.0',
      path: targetDir,
      enabled: true,
      source: 'webstore'
    };

    if (state.mainWindow) {
      const userApproved = await showExtensionPermissionWarning(state.mainWindow, manifestPath, newExtension.name);
      if (!userApproved) {
        safeDeleteExtensionDir(targetDir);
        return null;
      }
    }

    const account = getAccountById(accountId);
    if (account) {
      if (!account.extensions) {
        account.extensions = [];
      }
      account.extensions = account.extensions.filter((ext) => ext.id !== extensionId);
      account.extensions.push(newExtension);
      await saveAccounts();

      const view = state.accountViews.get(accountId);
      if (view) {
        const accountSession = session.fromPartition(account.partition);
        const loadedExts = accountSession.getAllExtensions();
        const matched = loadedExts.find((e) => e.id === extensionId || path.resolve(e.path) === path.resolve(targetDir));
        if (matched) {
          accountSession.removeExtension(matched.id);
        }
        await accountSession.loadExtension(targetDir);
      }

      state.mainWindow?.webContents.send('account:list-changed', state.accounts, state.activeAccountId);
      return newExtension;
    }
  } catch (err: any) {
    console.error(`Failed to install Chrome Web Store extension ${extensionId}:`, err);
    dialog.showErrorBox('Extension Install Error', err.message || 'An unknown error occurred during download.');
    throw err;
  }

  return null;
}

export async function toggleExtension(accountId: string, extensionId: string, enabled: boolean): Promise<boolean> {
  const account = getAccountById(accountId);
  if (!account || !account.extensions) return false;

  const ext = account.extensions.find((e) => e.id === extensionId);
  if (!ext) return false;

  ext.enabled = enabled;
  await saveAccounts();

  const view = state.accountViews.get(accountId);
  if (view) {
    const accountSession = session.fromPartition(account.partition);
    if (enabled) {
      try {
        await accountSession.loadExtension(ext.path);
      } catch (err) {
        console.error(`Failed to load extension ${ext.name}:`, err);
      }
    } else {
      const loadedExts = accountSession.getAllExtensions();
      const matched = loadedExts.find((e) => path.resolve(e.path) === path.resolve(ext.path));
      if (matched) {
        accountSession.removeExtension(matched.id);
      }
    }
  }

  state.mainWindow?.webContents.send('account:list-changed', state.accounts, state.activeAccountId);
  return true;
}

export async function removeExtension(accountId: string, extensionId: string): Promise<boolean> {
  const account = getAccountById(accountId);
  if (!account || !account.extensions) return false;

  const extIndex = account.extensions.findIndex((e) => e.id === extensionId);
  if (extIndex === -1) return false;

  const ext = account.extensions[extIndex];

  const view = state.accountViews.get(accountId);
  if (view) {
    const accountSession = session.fromPartition(account.partition);
    const loadedExts = accountSession.getAllExtensions();
    const matched = loadedExts.find((e) => path.resolve(e.path) === path.resolve(ext.path));
    if (matched) {
      accountSession.removeExtension(matched.id);
    }
  }

  try {
    safeDeleteExtensionDir(ext.path);
  } catch (err) {
    console.error(`Failed to delete extension files at ${ext.path}:`, err);
  }

  account.extensions.splice(extIndex, 1);
  await saveAccounts();

  state.mainWindow?.webContents.send('account:list-changed', state.accounts, state.activeAccountId);
  return true;
}

function isNewerVersion(currentVersion: string, fetchedVersion: string): boolean {
  const v1 = currentVersion.split('.').map(n => parseInt(n, 10) || 0);
  const v2 = fetchedVersion.split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(v1.length, v2.length);
  for (let i = 0; i < len; i++) {
    const num1 = v1[i] || 0;
    const num2 = v2[i] || 0;
    if (num2 > num1) return true;
    if (num2 < num1) return false;
  }
  return false;
}

export async function checkForWebStoreUpdates(targetAccountId?: string): Promise<{ updatedCount: number; updatedList: string[] }> {
  let updatedCount = 0;
  const updatedList: string[] = [];

  const targetAccounts = targetAccountId
    ? state.accounts.filter((a) => a.id === targetAccountId)
    : state.accounts;

  for (const account of targetAccounts) {
    if (!account.extensions || account.extensions.length === 0) continue;
    const webstoreExtensions = account.extensions.filter((ext) => ext.source === 'webstore');

    for (const ext of webstoreExtensions) {
      const extensionId = ext.id;
      const downloadUrl = `https://clients2.google.com/service/update2/crx?response=redirect&os=linux&arch=x86-64&os_arch=x86-64&prod=chromecrx&prodchannel=unknown&prodversion=${CHROME_VERSION}&acceptformat=crx3&x=id%3D${extensionId}%26uc`;
      const tmpDir = path.join(app.getPath('userData'), 'extensions', account.id, `${extensionId}_tmp`);

      try {
        const response = await fetch(downloadUrl, {
          headers: {
            'User-Agent': DEFAULT_USER_AGENT,
            'Referer': `https://chrome.google.com/webstore/detail/${extensionId}?hl=en`
          }
        });

        if (!response.ok) continue;

        const arrayBuffer = await response.arrayBuffer();
        const crxBuffer = Buffer.from(arrayBuffer);
        const zipBuffer = crxToZip(crxBuffer);

        if (fs.existsSync(tmpDir)) {
          safeDeleteExtensionDir(tmpDir);
        }
        fs.mkdirSync(tmpDir, { recursive: true });

        const zip = new AdmZip(zipBuffer);
        zip.extractAllTo(tmpDir, true);

        const manifestPath = path.join(tmpDir, 'manifest.json');
        if (!fs.existsSync(manifestPath)) {
          safeDeleteExtensionDir(tmpDir);
          continue;
        }

        const manifestContent = fs.readFileSync(manifestPath, 'utf8');
        const manifest = JSON.parse(manifestContent);
        const newVersion = manifest.version || '1.0.0';

        if (isNewerVersion(ext.version, newVersion)) {
          console.log(`Updating extension ${ext.name} (${ext.id}) from v${ext.version} to v${newVersion} for account ${account.name}`);

          if (fs.existsSync(ext.path)) {
            safeDeleteExtensionDir(ext.path);
          }
          fs.renameSync(tmpDir, ext.path);

          ext.version = newVersion;
          if (manifest.name) ext.name = manifest.name;

          const view = state.accountViews.get(account.id);
          if (view) {
            const accountSession = session.fromPartition(account.partition);
            const loadedExts = accountSession.getAllExtensions();
            const matched = loadedExts.find((e) => e.id === extensionId || path.resolve(e.path) === path.resolve(ext.path));
            if (matched) {
              accountSession.removeExtension(matched.id);
            }
            if (ext.enabled) {
              await accountSession.loadExtension(ext.path);
            }
          }

          updatedCount++;
          updatedList.push(`${ext.name} (v${newVersion})`);
        } else {
          safeDeleteExtensionDir(tmpDir);
        }
      } catch (err) {
        console.error(`Failed update check for extension ${ext.id}:`, err);
        if (fs.existsSync(tmpDir)) {
          try { safeDeleteExtensionDir(tmpDir); } catch (_) {}
        }
      }
    }
  }

  if (updatedCount > 0) {
    await saveAccounts();
    state.mainWindow?.webContents.send('account:list-changed', state.accounts, state.activeAccountId);
  }

  return { updatedCount, updatedList };
}
