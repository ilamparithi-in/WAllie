import { app, dialog, session, BrowserWindow, nativeTheme, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import AdmZip from 'adm-zip';
import { state } from './state';
import { saveAccounts, CHROME_VERSION, DEFAULT_USER_AGENT } from './config';
import { ExtensionInfo, Account } from '../shared/types';
import { getAccountById, getActiveWindow, getAppIcon, getInitialWindowSize } from './utils';
import { notificationManager } from './notifications/index';
import { registerContextMenu } from './views';

const EXTENSIONS_BASE = path.join(app.getPath('userData'), 'extensions');

export function getExtensionIconPath(extDir: string, manifest: any): string | null {
  const icons = manifest?.icons || manifest?.action?.default_icon || manifest?.browser_action?.default_icon;

  let iconRel: string | null = null;
  if (typeof icons === 'string') {
    iconRel = icons;
  } else if (typeof icons === 'object' && icons !== null) {
    const preferredOrder = ['48', '32', '128', '16', '64', '256'];
    for (const size of preferredOrder) {
      if (icons[size]) {
        iconRel = icons[size];
        break;
      }
    }
    if (!iconRel) {
      const keys = Object.keys(icons);
      if (keys.length > 0) iconRel = icons[keys[0]];
    }
  }

  if (iconRel) {
    const fullPath = path.join(extDir, iconRel);
    if (fs.existsSync(fullPath)) return fullPath;
  }

  const fallbacks = [
    'icons/icon-48.png',
    'icons/icon-32.png',
    'icons/icon-16.png',
    'icons/icon-128.png',
    'icons/icon.png',
    'icons/icon.svg',
    'icon.png',
    'icon.svg',
  ];
  for (const fb of fallbacks) {
    const fullPath = path.join(extDir, fb);
    if (fs.existsSync(fullPath)) return fullPath;
  }

  return null;
}

export function getExtensionIconDataUrl(extDir: string, manifest: any): string | undefined {
  try {
    const iconPath = getExtensionIconPath(extDir, manifest);
    if (!iconPath) return undefined;

    const ext = path.extname(iconPath).toLowerCase();
    const mime = ext === '.svg' ? 'image/svg+xml' : 'image/png';
    const buffer = fs.readFileSync(iconPath);
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch {
    return undefined;
  }
}

export function getBuiltinExtensionsDir(): string {
  if (app.isPackaged) {
    const resourcesPath = path.join(process.resourcesPath, 'builtin-extensions');
    if (fs.existsSync(resourcesPath)) return resourcesPath;
  }
  const projectRootDist = path.join(app.getAppPath(), 'dist/builtin-extensions');
  if (fs.existsSync(projectRootDist)) return projectRootDist;
  const devPath = path.resolve(__dirname, '../../dist/builtin-extensions');
  if (fs.existsSync(devPath)) return devPath;
  return path.resolve(__dirname, '../builtin-extensions');
}

export function syncBuiltinExtensionsForAccount(account: Account): boolean {
  const builtinDir = getBuiltinExtensionsDir();
  if (!fs.existsSync(builtinDir)) return false;

  let modified = false;
  try {
    const entries = fs.readdirSync(builtinDir, { withFileTypes: true });
    if (!account.extensions) {
      account.extensions = [];
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const extDir = path.join(builtinDir, entry.name);
      const manifestPath = path.join(extDir, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;

      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const extId = `builtin_${entry.name}`;
        const hasPopup = Boolean(manifest.action?.default_popup || manifest.browser_action?.default_popup);
        const popupPath = manifest.action?.default_popup || manifest.browser_action?.default_popup || '';
        const iconDataUrl = getExtensionIconDataUrl(extDir, manifest);

        const existing = account.extensions.find(
          (e) => e.id === extId || path.resolve(e.path) === path.resolve(extDir)
        );

        if (existing) {
          existing.isBuiltIn = true;
          existing.source = 'builtin';
          existing.path = extDir;
          existing.name = manifest.name || existing.name;
          existing.version = manifest.version || existing.version;
          existing.hasPopup = hasPopup;
          existing.popupPath = popupPath;
          existing.iconDataUrl = iconDataUrl;
          if (existing.pinnedInTitlebar === undefined) existing.pinnedInTitlebar = true;
        } else {
          account.extensions.push({
            id: extId,
            name: manifest.name || entry.name,
            version: manifest.version || '1.0.0',
            path: extDir,
            enabled: true,
            source: 'builtin',
            isBuiltIn: true,
            hasPopup,
            popupPath,
            iconDataUrl,
            pinnedInTitlebar: true,
          });
          modified = true;
        }
      } catch (err) {
        console.warn(`[extensions] Failed to parse builtin extension in ${extDir}:`, err);
      }
    }
  } catch (err) {
    console.warn('[extensions] Failed to read builtin extensions directory:', err);
  }

  return modified;
}

export async function syncAllAccountsBuiltinExtensions(): Promise<void> {
  let anyModified = false;
  for (const account of state.accounts) {
    const mod = syncBuiltinExtensionsForAccount(account);
    if (mod) anyModified = true;
  }
  if (anyModified) {
    await saveAccounts();
    state.mainWindow?.webContents.send('account:list-changed', state.accounts, state.activeAccountId);
  }
}

export function openExtensionAuxiliaryWindow(
  url: string,
  accountId: string,
  title?: string
): BrowserWindow | null {
  const account = getAccountById(accountId);
  if (!account) return null;

  const accountSession = session.fromPartition(account.partition);
  const winKey = `ext_tab_${accountId}_${encodeURIComponent(url)}`;

  const existingWin = state.auxiliaryWindows.get(winKey);
  if (existingWin && !existingWin.isDestroyed()) {
    existingWin.show();
    existingWin.focus();
    return existingWin;
  }

  const { width: initW, height: initH } = getInitialWindowSize(880, 640, state.mainWindow);

  const newWin = new BrowserWindow({
    modal: false,
    width: initW,
    height: initH,
    minWidth: 400,
    minHeight: 320,
    resizable: true,
    title: title || 'Extension Tab',
    icon: getAppIcon(),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#111b21' : '#ffffff',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      session: accountSession, // STRICT multi-account session context isolation!
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  state.auxiliaryWindows.set(winKey, newWin);
  newWin.removeMenu();
  registerContextMenu(newWin.webContents);

  // If this extension tab opens further tabs, keep them isolated in this same accountSession
  newWin.webContents.setWindowOpenHandler((details) => {
    openExtensionAuxiliaryWindow(details.url, accountId, title);
    return { action: 'deny' };
  });

  newWin.on('closed', () => {
    state.auxiliaryWindows.delete(winKey);
  });

  newWin.once('ready-to-show', () => {
    newWin.show();
    newWin.focus();
  });

  newWin.loadURL(url).catch((err) => {
    console.warn(`[extensions] Failed to load URL ${url} in extension auxiliary window:`, err);
  });

  return newWin;
}

export async function openExtensionPopup(
  accountId: string,
  extensionId: string,
  _anchorBounds?: { x: number; y: number; width: number; height: number }
): Promise<boolean> {
  const targetAccountId = (accountId && accountId.trim()) ? accountId : state.activeAccountId;
  const account = getAccountById(targetAccountId);
  if (!account || !account.extensions) return false;

  const ext = account.extensions.find((e) => e.id === extensionId);
  if (!ext || !ext.enabled) return false;

  const accountSession = session.fromPartition(account.partition);
  const loadedExts = accountSession.getAllExtensions();
  const matched = loadedExts.find((e) => path.resolve(e.path) === path.resolve(ext.path));
  if (!matched) {
    console.warn(`Extension ${ext.name} is not loaded in session for account ${targetAccountId}`);
    return false;
  }

  const manifestPath = path.join(ext.path, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return false;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const popupRel = manifest.action?.default_popup || manifest.browser_action?.default_popup;
  if (!popupRel) {
    console.warn(`Extension ${ext.name} has no popup configured`);
    return false;
  }

  const popupUrl = `chrome-extension://${matched.id}/${popupRel}`;
  const winKey = `ext_popup_${targetAccountId}_${extensionId}`;

  const existingWin = state.auxiliaryWindows.get(winKey);
  if (existingWin && !existingWin.isDestroyed()) {
    existingWin.show();
    existingWin.focus();
    return true;
  }

  const iconPath = getExtensionIconPath(ext.path, manifest);
  let winIcon = getAppIcon();
  if (iconPath) {
    try {
      const extImg = nativeImage.createFromPath(iconPath);
      if (!extImg.isEmpty()) {
        winIcon = extImg;
      }
    } catch {}
  }

  // useContentSize ensures the popout window content area matches the extension's popup size.
  const initContentWidth = 380;
  const initContentHeight = 520;

  const parentWin = state.mainWindow && !state.mainWindow.isDestroyed() ? state.mainWindow : undefined;

  const popupWin = new BrowserWindow({
    parent: parentWin,
    modal: false,
    useContentSize: true,
    width: initContentWidth,
    height: initContentHeight,
    minWidth: 320,
    minHeight: 250,
    maxWidth: 800,
    maxHeight: 650,
    resizable: true,
    title: ext.name,
    icon: winIcon,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#111b21' : '#ffffff',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      session: accountSession,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  state.auxiliaryWindows.set(winKey, popupWin);
  popupWin.removeMenu();
  registerContextMenu(popupWin.webContents);

  // Auto-size content to fit the extension popup if the extension has custom dimensions
  popupWin.webContents.on('did-finish-load', async () => {
    try {
      if (popupWin.isDestroyed()) return;

      // Provide polyfills in the extension popup window context so chrome.tabs.create and
      // chrome.runtime.openOptionsPage spawn new windows in the same accountSession
      await popupWin.webContents.executeJavaScript(`
        if (typeof chrome !== 'undefined') {
          if (!chrome.tabs) chrome.tabs = {};
          if (!chrome.tabs.create) {
            chrome.tabs.create = function(opts, cb) {
              var u = opts && opts.url ? opts.url : 'about:blank';
              window.open(u, '_blank');
              if (typeof cb === 'function') cb({ id: 1, url: u });
              return Promise.resolve({ id: 1, url: u });
            };
          }
          if (!chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage = function(cb) {
              var m = chrome.runtime.getManifest();
              var opt = m.options_page || (m.options_ui && m.options_ui.page);
              if (opt) {
                window.open(chrome.runtime.getURL(opt), '_blank');
                if (typeof cb === 'function') cb();
                return Promise.resolve();
              }
            };
          }
        }
      `);

      // Inject sleek scrollbar styles and enforce horizontal overflow prevention across all extensions
      await popupWin.webContents.insertCSS(`
        html {
          overflow-x: hidden !important;
        }
        ::-webkit-scrollbar {
          width: 6px !important;
          height: 6px !important;
        }
        ::-webkit-scrollbar-track {
          background: transparent !important;
        }
        ::-webkit-scrollbar-thumb {
          background: rgba(134, 150, 160, 0.3) !important;
          border-radius: 3px !important;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(134, 150, 160, 0.5) !important;
        }
      `);

      const dims = await popupWin.webContents.executeJavaScript(`
        ({
          w: Math.max(
            document.documentElement ? document.documentElement.scrollWidth : 0,
            document.body ? document.body.scrollWidth : 0,
            document.documentElement ? document.documentElement.offsetWidth : 0,
            document.body ? document.body.offsetWidth : 0,
            360
          ),
          h: Math.max(
            document.documentElement ? document.documentElement.scrollHeight : 0,
            document.body ? document.body.scrollHeight : 0,
            document.documentElement ? document.documentElement.offsetHeight : 0,
            document.body ? document.body.offsetHeight : 0,
            300
          )
        })
      `);
      if (dims && dims.w && dims.h && !popupWin.isDestroyed()) {
        // Enforce Chrome's standard maximum popup dimensions (max 800w x 600h)
        const targetW = Math.min(Math.max(Math.round(dims.w), 360), 800);
        const targetH = Math.min(Math.max(Math.round(dims.h), 300), 600);
        popupWin.setContentSize(targetW, targetH);
      }
    } catch (_) {}
  });

  // Intercept any new window or tab opened from this popup
  // Spawns a dedicated auxiliary window in the SAME accountSession (no leakage)
  popupWin.webContents.setWindowOpenHandler((details) => {
    openExtensionAuxiliaryWindow(details.url, accountId, ext.name);
    return { action: 'deny' };
  });

  popupWin.on('closed', () => {
    state.auxiliaryWindows.delete(winKey);
    if (state.activeExtensionPopup === popupWin) {
      state.activeExtensionPopup = null;
    }
  });

  popupWin.once('ready-to-show', () => {
    popupWin.show();
    popupWin.focus();
  });

  await popupWin.loadURL(popupUrl);
  return true;
}

export function safeDeleteExtensionDir(extPath: string): void {
  const resolved = path.resolve(extPath);
  if (!resolved.startsWith(EXTENSIONS_BASE + path.sep) && resolved !== EXTENSIONS_BASE) {
    console.error(`Refusing to delete path outside extensions directory: ${resolved}`);
    return;
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

export function prepareExtensionForElectron(extDir: string): void {
  try {
    const manifestPath = path.join(extDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return;

    const manifestRaw = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestRaw);
    let manifestModified = false;

    // Filter out known unsupported permissions to eliminate ExtensionLoadWarning noise
    if (Array.isArray(manifest.permissions)) {
      const unsupported = ['identity', 'identity.email'];
      const filtered = manifest.permissions.filter((p: string) => !unsupported.includes(p));
      if (filtered.length !== manifest.permissions.length) {
        manifest.permissions = filtered;
        manifestModified = true;
      }
    }
    if (manifestModified) {
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    }

    const swRelPath = manifest.background?.service_worker;
    if (swRelPath) {
      const swFullPath = path.join(extDir, swRelPath);
      if (fs.existsSync(swFullPath)) {
        let swContent = fs.readFileSync(swFullPath, 'utf8');
        // Clean up any previously inserted broken shims
        if (swContent.includes('/* __wallie_ext_shim__ */')) {
          swContent = swContent.replace(/\/\* __wallie_ext_shim__ \*\/[\s\S]*?\/\* __wallie_ext_shim_end__ \*\/\n?/, '');
        }
        const shim = `/* __wallie_ext_shim__ */
if (typeof self !== 'undefined') {
  if (typeof self.chrome === 'undefined') { self.chrome = {}; }
  if (!self.chrome.windows) {
    self.chrome.windows = {
      onRemoved: { addListener: function() {}, removeListener: function() {}, hasListener: function() { return false; } },
      onCreated: { addListener: function() {}, removeListener: function() {}, hasListener: function() { return false; } },
      onFocusChanged: { addListener: function() {}, removeListener: function() {}, hasListener: function() { return false; } },
      create: function(_opts, cb) { if (typeof cb === 'function') cb(null); },
      update: function(_id, _opts, cb) { if (typeof cb === 'function') cb(null); },
      remove: function(_id, cb) { if (typeof cb === 'function') cb(); },
      get: function(_id, _opts, cb) { var c = typeof _opts === 'function' ? _opts : cb; if (typeof c === 'function') c(null); },
      getAll: function(_opts, cb) { var c = typeof _opts === 'function' ? _opts : cb; if (typeof c === 'function') c([]); },
      getCurrent: function(_opts, cb) { var c = typeof _opts === 'function' ? _opts : cb; if (typeof c === 'function') c(null); },
    };
  }
  if (!self.chrome.tabs) {
    self.chrome.tabs = {
      create: function(opts, cb) {
        if (typeof self.clients !== 'undefined' && self.clients.openWindow) {
          self.clients.openWindow(opts && opts.url ? opts.url : 'about:blank');
        }
        if (typeof cb === 'function') cb({ id: 1, url: opts && opts.url });
        return Promise.resolve({ id: 1, url: opts && opts.url });
      },
      query: function(_queryInfo, cb) { if (typeof cb === 'function') cb([]); return Promise.resolve([]); },
      get: function(_tabId, cb) { if (typeof cb === 'function') cb(null); return Promise.resolve(null); },
      update: function(_tabId, _updateProps, cb) { if (typeof cb === 'function') cb(null); return Promise.resolve(null); },
      remove: function(_tabIds, cb) { if (typeof cb === 'function') cb(); return Promise.resolve(); },
    };
  }
  if (!self.chrome.identity) {
    self.chrome.identity = {
      getProfileUserInfo: function(_opts, cb) {
        var callback = typeof _opts === 'function' ? _opts : cb;
        if (typeof callback === 'function') callback({ email: '', id: '' });
      },
      getAuthToken: function(_opts, cb) {
        var callback = typeof _opts === 'function' ? _opts : cb;
        if (typeof callback === 'function') callback('');
      },
    };
  }
}
/* __wallie_ext_shim_end__ */`;
        fs.writeFileSync(swFullPath, shim + '\n' + swContent, 'utf8');
      }
    }
  } catch (err) {
    console.error('Error preparing extension for Electron:', err);
  }
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

export async function importExtension(
  accountId: string,
  importType: 'folder' | 'archive'
): Promise<ExtensionInfo | null> {
  const targetWin = getActiveWindow();
  if (!targetWin || targetWin.isDestroyed()) return null;

  let properties: ('openFile' | 'openDirectory')[] = [];
  let filters: { name: string; extensions: string[] }[] = [];

  if (importType === 'folder') {
    properties = ['openDirectory'];
  } else {
    properties = ['openFile'];
    filters = [{ name: 'Chrome Extension Archive', extensions: ['zip', 'crx'] }];
  }

  const result = await dialog.showOpenDialog(targetWin, {
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
    const hasPopup = Boolean(manifest.action?.default_popup || manifest.browser_action?.default_popup);
    const popupPath = manifest.action?.default_popup || manifest.browser_action?.default_popup || '';
    const iconDataUrl = getExtensionIconDataUrl(targetDir, manifest);

    const newExtension: ExtensionInfo = {
      id: extId,
      name: manifest.name || 'Unnamed Extension',
      version: manifest.version || '1.0.0',
      path: targetDir,
      enabled: true,
      hasPopup,
      popupPath,
      iconDataUrl,
      pinnedInTitlebar: true,
    };

    const userApproved = await showExtensionPermissionWarning(targetWin, manifestPath, newExtension.name);
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
        prepareExtensionForElectron(targetDir);
        const accountSession = session.fromPartition(account.partition);
        if (accountSession.extensions) {
          await accountSession.extensions.loadExtension(targetDir);
        } else {
          await accountSession.loadExtension(targetDir);
        }
      }

      state.mainWindow?.webContents.send('account:list-changed', state.accounts, state.activeAccountId);
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

    safeDeleteExtensionDir(targetDir);
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
    const hasPopup = Boolean(manifest.action?.default_popup || manifest.browser_action?.default_popup);
    const popupPath = manifest.action?.default_popup || manifest.browser_action?.default_popup || '';
    const iconDataUrl = getExtensionIconDataUrl(targetDir, manifest);

    const newExtension: ExtensionInfo = {
      id: extensionId,
      name: manifest.name || 'Unnamed Extension',
      version: manifest.version || '1.0.0',
      path: targetDir,
      enabled: true,
      source: 'webstore',
      hasPopup,
      popupPath,
      iconDataUrl,
      pinnedInTitlebar: true,
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
          if (accountSession.extensions) {
            accountSession.extensions.removeExtension(matched.id);
          } else {
            accountSession.removeExtension(matched.id);
          }
        }
        prepareExtensionForElectron(targetDir);
        if (accountSession.extensions) {
          await accountSession.extensions.loadExtension(targetDir);
        } else {
          await accountSession.loadExtension(targetDir);
        }
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
        prepareExtensionForElectron(ext.path);
        if (accountSession.extensions) {
          await accountSession.extensions.loadExtension(ext.path);
        } else {
          await accountSession.loadExtension(ext.path);
        }
      } catch (err) {
        console.error(`Failed to load extension ${ext.name}:`, err);
      }
    } else {
      const loadedExts = accountSession.getAllExtensions();
      const matched = loadedExts.find((e) => path.resolve(e.path) === path.resolve(ext.path));
      if (matched) {
        if (accountSession.extensions) {
          accountSession.extensions.removeExtension(matched.id);
        } else {
          accountSession.removeExtension(matched.id);
        }
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
  if (ext.isBuiltIn) {
    console.warn(`Refusing to remove built-in extension: ${ext.name}`);
    return false;
  }

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
      const updateCheckUrl = `https://clients2.google.com/service/update2/crx?os=linux&arch=x86-64&os_arch=x86-64&prod=chromecrx&prodchannel=unknown&prodversion=${CHROME_VERSION}&acceptformat=crx3&x=id%3D${extensionId}%26v%3D${ext.version}%26uc`;
      let downloadUrl = `https://clients2.google.com/service/update2/crx?response=redirect&os=linux&arch=x86-64&os_arch=x86-64&prod=chromecrx&prodchannel=unknown&prodversion=${CHROME_VERSION}&acceptformat=crx3&x=id%3D${extensionId}%26uc`;
      const tmpDir = path.join(app.getPath('userData'), 'extensions', account.id, `${extensionId}_tmp`);

      try {
        // Check update XML first to save bandwidth
        const checkResponse = await fetch(updateCheckUrl, {
          headers: {
            'User-Agent': DEFAULT_USER_AGENT,
            'Referer': `https://chrome.google.com/webstore/detail/${extensionId}?hl=en`
          }
        });

        if (checkResponse.ok) {
          const xml = await checkResponse.text();
          const updateCheckMatch = xml.match(/<updatecheck\b([^>]*)\/?>/i);
          if (updateCheckMatch) {
            const attrs = updateCheckMatch[1];
            const statusMatch = attrs.match(/\bstatus=["']([^"']+)["']/i);
            const status = statusMatch ? statusMatch[1].toLowerCase() : null;

            if (status === 'noupdate') {
              continue; // Up to date
            }

            const versionMatch = attrs.match(/\bversion=["']([^"']+)["']/i);
            const remoteVersion = versionMatch ? versionMatch[1] : null;
            if (remoteVersion && !isNewerVersion(ext.version, remoteVersion)) {
              continue; // Skip download, already up to date
            }

            const codebaseMatch = attrs.match(/\bcodebase=["']([^"']+)["']/i);
            if (codebaseMatch && codebaseMatch[1]) {
              downloadUrl = codebaseMatch[1];
            }
          }
        }

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

          const view = state.accountViews.get(account.id);
          let accountSession: Electron.Session | null = null;
          if (view) {
            accountSession = session.fromPartition(account.partition);
            const loadedExts = accountSession.getAllExtensions();
            const matched = loadedExts.find((e) => e.id === extensionId || path.resolve(e.path) === path.resolve(ext.path));
            if (matched) {
              if (accountSession.extensions) {
                accountSession.extensions.removeExtension(matched.id);
              } else {
                accountSession.removeExtension(matched.id);
              }
            }
          }

          if (fs.existsSync(ext.path)) {
            safeDeleteExtensionDir(ext.path);
          }
          fs.renameSync(tmpDir, ext.path);

          ext.version = newVersion;
          if (manifest.name) ext.name = manifest.name;

          if (view && accountSession && ext.enabled) {
            prepareExtensionForElectron(ext.path);
            if (accountSession.extensions) {
              await accountSession.extensions.loadExtension(ext.path);
            } else {
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
    try {
      await notificationManager.notify({
        title: 'Extensions Updated',
        body: `Updated ${updatedCount} extension${updatedCount > 1 ? 's' : ''}: ${updatedList.join(', ')}`,
      });
    } catch (notifErr) {
      console.warn('Failed to send extension update notification:', notifErr);
    }
  }

  return { updatedCount, updatedList };
}
