import { app, BrowserWindow, WebContentsView, ipcMain, Tray, Menu, nativeImage, session, dialog, desktopCapturer, shell, Notification } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import AdmZip from 'adm-zip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Memory & CPU Optimization flags
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-features', 'TranslateUI');

let pendingProtocolUrl: string | null = null;

// Enforce single-instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();

      const protocolUrl = commandLine.find(arg => arg.startsWith('whatsapp://') || arg.startsWith('wallie://'));
      if (protocolUrl) {
        console.log(`Received protocol URL in second-instance: ${protocolUrl}`);
        mainWindow.webContents.send('protocol:received-url', protocolUrl);
      }
    } else {
      const protocolUrl = commandLine.find(arg => arg.startsWith('whatsapp://') || arg.startsWith('wallie://'));
      if (protocolUrl) {
        pendingProtocolUrl = protocolUrl;
      }
    }
  });

  const startupUrl = process.argv.find(arg => arg.startsWith('whatsapp://') || arg.startsWith('wallie://'));
  if (startupUrl) {
    pendingProtocolUrl = startupUrl;
  }
}

const TITLEBAR_HEIGHT = 28;
let disclaimerOpen = false;
let protocolPromptOpen = false;
const CHROME_VERSION = process.versions.chrome || '132.0.0.0';
const DEFAULT_USER_AGENT =
  `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`;

import { Account, GlobalSettings, ExtensionInfo, HistoricalNotification, DEFAULT_ACCOUNT_SETTINGS } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// Settings & Accounts configuration files
const ACCOUNTS_FILE = path.join(app.getPath('userData'), 'accounts.json');
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

// Safe directory deletion helper — only allows deletion within userData/extensions/
const EXTENSIONS_BASE = path.join(app.getPath('userData'), 'extensions');

function safeDeleteExtensionDir(extPath: string): void {
  const resolved = path.resolve(extPath);
  if (!resolved.startsWith(EXTENSIONS_BASE + path.sep) && resolved !== EXTENSIONS_BASE) {
    console.error(`Refusing to delete path outside extensions directory: ${resolved}`);
    return;
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

// Helper to load settings
function loadSettings(): GlobalSettings {
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
        notificationLoggingEnabled: !!parsed.notificationLoggingEnabled,
        extensionDevMode: !!parsed.extensionDevMode,
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
    notificationLoggingEnabled: false,
    extensionDevMode: false,
    startMinimized: false,
    disclaimerAccepted: false,
  };
}

// Helper to save settings
async function saveSettings(settings: GlobalSettings) {
  try {
    await fs.promises.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to save settings configuration:', error);
  }
}

let globalSettings = loadSettings();

// Disable hardware acceleration if config specifies before app gets ready
if (!globalSettings.hardwareAcceleration) {
  app.disableHardwareAcceleration();
}

// Helper to load accounts
function loadAccounts(): Account[] {
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) {
      const data = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((acc: any) => ({
          ...acc,
          loggedIn: !!acc.loggedIn,
          extensions: acc.extensions || [],
          unreadCount: 0, // Reset badge on startup
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

  // Fallback default account
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

// Helper to save accounts
async function saveAccounts() {
  try {
    const dataToSave = accounts.map(({ id, name, partition, loggedIn, extensions, settings, emoji }) => ({
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

// CRX to ZIP converter (strips CRX headers)
function crxToZip(crxBuffer: Buffer): Buffer {
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

// Display a warning dialog showing extension permissions before loading
async function showExtensionPermissionWarning(
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
    
    // Check content_scripts hosts
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
    return true; // Allow if we can't parse (already validated manifest.json exists)
  }
}

// Accounts state load
let accounts: Account[] = loadAccounts();
let activeAccountId = accounts[0].id;

// Map of account ID to WebContentsView
const accountViews = new Map<string, WebContentsView>();

// Map of account ID to custom DevTools BrowserWindow
const devtoolsWindows = new Map<string, BrowserWindow>();

// Keep track of which sessions have been configured to avoid duplicate handlers
const configuredSessions = new Set<string>();

// Map of webstore browser WebContents ID to target account ID
const webstoreWindows = new Map<number, string>();

async function createAccountView(account: Account): Promise<WebContentsView> {
  const accountSession = session.fromPartition(account.partition);

  // Set standard User-Agent on session headers to ensure WhatsApp Web loads smoothly
  accountSession.setUserAgent(DEFAULT_USER_AGENT);

  // Configure session-level handlers once per session partition
  if (!configuredSessions.has(account.partition)) {
    configuredSessions.add(account.partition);

    // Permission Request Handler (Camera, Mic, Notifications, Geolocation, Clipboard-Read)
    accountSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
      const url = details.requestingUrl;
      let isWA = false;
      try {
        const hostname = new URL(url).hostname;
        isWA = hostname === 'web.whatsapp.com' || hostname.endsWith('.whatsapp.com') || hostname.endsWith('.whatsapp.net');
      } catch {}
      if (isWA) {
        const targetAccount = accounts.find((a) => a.partition === account.partition);
        const settings = targetAccount?.settings || DEFAULT_ACCOUNT_SETTINGS;

        if (permission === 'notifications') {
          callback(settings.notificationsEnabled);
          return;
        }
        if (permission === 'media') {
          const mediaTypes = (details as any).mediaTypes || [];
          let granted = true;
          if (mediaTypes.includes('video') && !settings.cameraEnabled) {
            granted = false;
          }
          if (mediaTypes.includes('audio') && !settings.micEnabled) {
            granted = false;
          }
          callback(granted);
          return;
        }
        if (permission === 'geolocation') {
          callback(!!settings.geolocationEnabled);
          return;
        }
        if (permission === 'clipboard-read') {
          callback(!!settings.clipboardReadEnabled);
          return;
        }
        if ((permission as string) === 'background-sync' || permission === 'fullscreen') {
          callback(true); // Allow standard background-sync and fullscreen features for WhatsApp
          return;
        }
        callback(false); // Deny other permissions by default for security
        return;
      }
      callback(false);
    });

    // Permission Check Handler
    accountSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
      let isWA = false;
      try {
        const hostname = new URL(requestingOrigin).hostname;
        isWA = hostname === 'web.whatsapp.com' || hostname.endsWith('.whatsapp.com') || hostname.endsWith('.whatsapp.net');
      } catch {}
      if (isWA) {
        const targetAccount = accounts.find((a) => a.partition === account.partition);
        const settings = targetAccount?.settings || DEFAULT_ACCOUNT_SETTINGS;

        if (permission === 'notifications') {
          return settings.notificationsEnabled;
        }
        if (permission === 'media') {
          const mediaType = details?.mediaType;
          if (mediaType === 'video') return settings.cameraEnabled;
          if (mediaType === 'audio') return settings.micEnabled;
          return settings.cameraEnabled || settings.micEnabled;
        }
        if (permission === 'geolocation') {
          return !!settings.geolocationEnabled;
        }
        if (permission === 'clipboard-read') {
          return !!settings.clipboardReadEnabled;
        }
        if ((permission as string) === 'background-sync' || permission === 'fullscreen') {
          return true; // Auto-allow other standard queries (like background sync / fullscreen)
        }
        return false;
      }
      return false;
    });

    // Screen Sharing / Display Media Request Handler (PipeWire / X11)
    accountSession.setDisplayMediaRequestHandler((request, callback) => {
      const isWayland = process.platform === 'linux' && (!!process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === 'wayland');

      if (isWayland) {
        // On Wayland, desktopCapturer.getSources() triggers a PipeWire picker prematurely.
        // By passing a placeholder source, we allow Chromium's PipeWire capturer
        // to directly trigger the system picker once when capturing begins.
        callback({
          video: {
            id: 'screen:0:0',
            name: 'Entire Screen',
          } as any,
          audio: 'loopback',
        });
        return;
      }

      desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
        let selected = false;
        const menu = Menu.buildFromTemplate([
          ...sources.map((source) => ({
            label: source.name || `Source ${source.id}`,
            click: () => {
              selected = true;
              callback({ video: source, audio: 'loopback' });
            },
          })),
          { type: 'separator' },
          {
            label: 'Cancel',
            click: () => {
              // Action handled in menu dismiss callback
            },
          },
        ]);

        menu.popup({
          window: mainWindow || undefined,
          callback: () => {
            if (!selected) {
              callback({}); // Cancel the request if menu is dismissed without selection
            }
          },
        });
      }).catch((err) => {
        console.error('Failed to get screen sharing sources:', err);
        callback({}); // Fail gracefully to avoid hanging the renderer
      });
    });

    // Downloads Interception Handler
    accountSession.on('will-download', (event, item) => {
      const fileName = item.getFilename();
      const downloadsPath = app.getPath('downloads');
      const savePath = path.join(downloadsPath, fileName);

      // Generate a unique save path to avoid silent overwrites
      let uniqueSavePath = savePath;
      let counter = 1;
      const ext = path.extname(fileName);
      const base = path.basename(fileName, ext);
      while (fs.existsSync(uniqueSavePath)) {
        uniqueSavePath = path.join(downloadsPath, `${base} (${counter})${ext}`);
        counter++;
      }
      item.setSavePath(uniqueSavePath);

      const startTime = item.getStartTime();
      mainWindow?.webContents.send('download:progress', {
        id: startTime,
        filename: fileName,
        percent: 0,
        state: 'progressing',
        receivedBytes: 0,
        totalBytes: item.getTotalBytes(),
      });

      item.on('updated', (event, state) => {
        if (state === 'interrupted') {
          mainWindow?.webContents.send('download:progress', {
            id: startTime,
            filename: fileName,
            percent: 0,
            state: 'failed',
          });
        } else if (state === 'progressing') {
          if (!item.isPaused()) {
            const received = item.getReceivedBytes();
            const total = item.getTotalBytes();
            const percent = total > 0 ? Math.round((received / total) * 100) : 0;
            mainWindow?.webContents.send('download:progress', {
              id: startTime,
              filename: fileName,
              percent,
              state: 'progressing',
              receivedBytes: received,
              totalBytes: total,
            });
          }
        }
      });

      item.once('done', (event, state) => {
        if (state === 'completed') {
          mainWindow?.webContents.send('download:progress', {
            id: startTime,
            filename: fileName,
            percent: 100,
            state: 'completed',
          });

          // Show system desktop notification
          const notification = new Notification({
            title: 'Download Complete',
            body: `Successfully downloaded ${path.basename(uniqueSavePath)} to Downloads folder.`,
          });
          notification.show();
        } else {
          mainWindow?.webContents.send('download:progress', {
            id: startTime,
            filename: fileName,
            percent: 0,
            state: 'failed',
          });
        }
      });
    });
  }

  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      partition: account.partition,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true, // Memory & CPU optimization
      sandbox: true,
      webSecurity: true,
      v8CacheOptions: 'bypassHeatCheck',
      spellcheck: false,
    },
  });

  // Defer extension loading until after WhatsApp's initial DOM renders
  view.webContents.once('dom-ready', async () => {
    if (account.extensions && account.extensions.length > 0) {
      for (const ext of account.extensions) {
        if (ext.enabled) {
          try {
            console.log(`Loading extension for account ${account.id}: ${ext.name} from ${ext.path}`);
            await accountSession.loadExtension(ext.path);
          } catch (err) {
            console.error(`Failed to load extension ${ext.name} from ${ext.path}:`, err);
          }
        }
      }
    }
  });

  view.webContents.setUserAgent(DEFAULT_USER_AGENT);
  view.webContents.loadURL('https://web.whatsapp.com');

  // Register zoom shortcuts
  registerZoomShortcuts(view.webContents);

  // Register context menu
  registerContextMenu(view.webContents);

  // Link Delegation: Intercept external link clicks
  view.webContents.on('will-navigate', (event, url) => {
    try {
      const parsedUrl = new URL(url);
      const isWhatsApp = parsedUrl.hostname === 'web.whatsapp.com' || parsedUrl.hostname.endsWith('.whatsapp.com');
      if (!isWhatsApp) {
        event.preventDefault();
        shell.openExternal(url).catch((err) => console.error('Failed to open external link:', err));
      }
    } catch (err) {
      event.preventDefault();
      shell.openExternal(url).catch((err) => console.error('Failed to open external link:', err));
    }
  });

  // Link Delegation: Intercept target="_blank" window openings
  view.webContents.setWindowOpenHandler((details) => {
    const url = details.url;
    try {
      const parsedUrl = new URL(url);
      const isWhatsApp = parsedUrl.hostname === 'web.whatsapp.com' || parsedUrl.hostname.endsWith('.whatsapp.com');
      if (!isWhatsApp) {
        shell.openExternal(url).catch((err) => console.error('Failed to open external link:', err));
        return { action: 'deny' };
      }

      // Allow internal WhatsApp windows (like calling popout) to open with our custom browser options.
      // This ensures window.open returns a valid reference, preventing "Allow popups" warning.
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 900,
          height: 650,
          minWidth: 500,
          minHeight: 400,
          frame: false, // Frameless native window
          titleBarStyle: 'hidden', // Custom titlebar integration
          backgroundColor: '#111b21',
          autoHideMenuBar: true,
          webPreferences: {
            preload: path.join(__dirname, '../preload/index.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            backgroundThrottling: false, // Prevent video/audio calls lagging when blurred
          }
        }
      };
    } catch (e) {
      shell.openExternal(url).catch((err) => console.error('Failed to open external link:', err));
      return { action: 'deny' };
    }
  });

  // Style and track the created child window
  view.webContents.on('did-create-window', (childWindow, details) => {
    console.log(`Intercepted child window creation for URL: ${details.url}`);
    
    // Pause any playing media across other tabs
    pauseAllMedia();

    // Remove toolbar/menubar completely
    childWindow.setMenu(null);
    childWindow.setAutoHideMenuBar(true);
    childWindow.menuBarVisible = false;

    // Track the call window
    callWindows.add(childWindow);

    childWindow.on('closed', () => {
      callWindows.delete(childWindow);
    });
  });

  // Handle beforeunload / discard changes prompts when refreshing by always allowing reload
  view.webContents.on('will-prevent-unload', (event) => {
    event.preventDefault(); // Synchronously ignore beforeunload and allow the page to reload
  });

  // Handle title & page badge updates for unread notifications count
  view.webContents.on('page-title-updated', (_event, title) => {
    const match = title.match(/\((\d+)\)/);
    const count = match ? parseInt(match[1], 10) : 0;
    account.unreadCount = count;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('account:unread-changed', account.id, count);
    }
  });

  // Periodically detect and persist if the user is logged into WhatsApp Web
  const checkLoginStatus = async () => {
    if (account.loggedIn) return; // Already flagged as logged in

    try {
      // Execute DOM check to determine if WhatsApp Web interface has chat elements
      const isNowLoggedIn = await view.webContents.executeJavaScript(`
        (() => {
          // Check for DOM elements unique to the logged-in chat screen
          const hasChatList = !!(
            document.getElementById('pane-side') || 
            document.querySelector('[data-testid="chat-list-search"]') || 
            document.querySelector('[data-testid="menu"]') ||
            document.querySelector('[data-testid="cell-frame-title"]')
          );
          if (hasChatList) return true;

          // Check if we are still on the landing page (not logged in)
          const hasLanding = !!(
            document.querySelector('[data-testid="qrcode"]') || 
            document.querySelector('canvas') ||
            document.querySelector('.landing-wrapper')
          );
          if (hasLanding) return false;

          // Standard localStorage fallback
          const hasWid = !!(
            localStorage.getItem('last-wid') || 
            localStorage.getItem('remember-me')
          );
          return hasWid;
        })()
      `);

      if (isNowLoggedIn) {
        console.log(`Account ${account.id} successfully logged in!`);
        account.loggedIn = true;
        saveAccounts();
        mainWindow?.webContents.send('account:list-changed', accounts, activeAccountId);
      }
    } catch (e) {
      // Ignore if localStorage / DOM is not accessible (e.g., page loading)
    }
  };

  view.webContents.on('dom-ready', () => {
    checkLoginStatus();
    insertedCssKeys.delete(account.id); // Page reload clears previously inserted CSS in Chromium
    injectCustomCssForView(account.id, view.webContents);
  });
  view.webContents.on('page-title-updated', checkLoginStatus);

  const intervalId = setInterval(() => {
    if (view.webContents.isDestroyed() || account.loggedIn) {
      clearInterval(intervalId);
      return;
    }
    checkLoginStatus();
  }, 8000);

  return view;
}

const callWindows = new Set<BrowserWindow>();

function pauseAllMedia() {
  const activeView = accountViews.get(activeAccountId);
  if (activeView && !activeView.webContents.isDestroyed()) {
    try {
      activeView.webContents.executeJavaScript(`
        (() => {
          try {
            document.querySelectorAll('video, audio').forEach(el => {
              if (!el.paused) {
                el.pause();
              }
            });
          } catch (e) {}
        })()
      `).catch(() => {});
    } catch (e) {
      // Ignore errors
    }
  }
}



function solveCubicBezier(p1x: number, p1y: number, p2x: number, p2y: number) {
  const cx = 3.0 * p1x;
  const bx = 3.0 * (p2x - p1x) - cx;
  const ax = 1.0 - cx - bx;

  const cy = 3.0 * p1y;
  const by = 3.0 * (p2y - p1y) - cy;
  const ay = 1.0 - cy - by;

  function sampleCurveX(t: number) {
    return ((ax * t + bx) * t + cx) * t;
  }

  function sampleCurveY(t: number) {
    return ((ay * t + by) * t + cy) * t;
  }

  function sampleCurveDerivativeX(t: number) {
    return (3.0 * ax * t + 2.0 * bx) * t + cx;
  }

  function solveCurveX(x: number, epsilon = 1e-5) {
    let t2 = x;
    for (let i = 0; i < 8; i++) {
      const x2 = sampleCurveX(t2) - x;
      if (Math.abs(x2) < epsilon) return t2;
      const d2 = sampleCurveDerivativeX(t2);
      if (Math.abs(d2) < 1e-6) break;
      t2 = t2 - x2 / d2;
    }
    let t0 = 0.0;
    let t1 = 1.0;
    t2 = x;
    if (t2 < t0) return t0;
    if (t2 > t1) return t1;
    while (t0 < t1) {
      const x2 = sampleCurveX(t2);
      if (Math.abs(x2 - x) < epsilon) return t2;
      if (x > x2) t0 = t2;
      else t1 = t2;
      t2 = (t1 - t0) * 0.5 + t0;
    }
    return t2;
  }

  return function(x: number) {
    return sampleCurveY(solveCurveX(x));
  };
}

const win10Easing = solveCubicBezier(0.1, 0.9, 0.2, 1);

const DRAWER_WIDTH = 450;
let settingsOpen = false;
let settingsDrawerWidth = 0;
let animationInterval: NodeJS.Timeout | null = null;
let resizeTimeout: NodeJS.Timeout | null = null;

function updateActiveViewBounds(isFromAnimation = false) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (animationInterval && !isFromAnimation) {
    clearInterval(animationInterval);
    animationInterval = null;
  }

  // 1. Immediately update bounds synchronously for a live, lag-free resize experience
  const [width, height] = mainWindow.getContentSize();
  const activeView = accountViews.get(activeAccountId);

  if (activeView) {
    if (disclaimerOpen || protocolPromptOpen) {
      activeView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    } else {
      const viewWidth = width - settingsDrawerWidth;
      activeView.setBounds({
        x: 0,
        y: TITLEBAR_HEIGHT,
        width: Math.max(0, viewWidth),
        height: Math.max(0, height - TITLEBAR_HEIGHT),
      });
    }
  }

  // 2. Retain debounced update as a trailing fallback to ensure final layout settle
  if (resizeTimeout) {
    clearTimeout(resizeTimeout);
  }

  resizeTimeout = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    const [w, h] = mainWindow.getContentSize();
    const aView = accountViews.get(activeAccountId);

    if (aView) {
      if (disclaimerOpen || protocolPromptOpen) {
        aView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      } else {
        const vWidth = w - settingsDrawerWidth;
        aView.setBounds({
          x: 0,
          y: TITLEBAR_HEIGHT,
          width: Math.max(0, vWidth),
          height: Math.max(0, h - TITLEBAR_HEIGHT),
        });
      }
    }
    resizeTimeout = null;
  }, 50); // 50ms debounce to prevent sizing race conditions
}

async function switchActiveAccount(newAccountId: string) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const currentView = accountViews.get(activeAccountId);
  if (currentView) {
    mainWindow.contentView.removeChildView(currentView);
    if (!currentView.webContents.isDestroyed()) {
      currentView.webContents.setFrameRate(5);
    }
  }

  activeAccountId = newAccountId;
  let targetView = accountViews.get(newAccountId);

  if (!targetView) {
    const acc = accounts.find((a) => a.id === newAccountId);
    if (acc) {
      targetView = await createAccountView(acc);
      accountViews.set(newAccountId, targetView);
    }
  }

  if (targetView) {
    mainWindow.contentView.addChildView(targetView);
    if (!targetView.webContents.isDestroyed()) {
      targetView.webContents.setFrameRate(60);
    }
    updateActiveViewBounds();
    
    // Automatically focus the active account webview contents
    if (!targetView.webContents.isDestroyed()) {
      targetView.webContents.focus();
    }

    // Inject Custom CSS theme if applicable
    injectCustomCssForView(newAccountId, targetView.webContents);

    // Sync zoom level for the newly selected account view
    const zoomPercent = Math.round(targetView.webContents.getZoomFactor() * 100);
    mainWindow.webContents.send('zoom:changed', zoomPercent);
  }

  mainWindow.webContents.send('account:list-changed', accounts, activeAccountId);
}

// Helper to initialize and preload WhatsApp accounts
async function initializeAccountsLoad() {
  // Initialize initial active view
  await switchActiveAccount(activeAccountId);

  // Preload remaining accounts in the background if configured
  const preloadIds = globalSettings.preloadAccountIds || [];
  if (preloadIds.length > 0) {
    console.log('Preloading configured accounts in the background...', preloadIds);
    for (const account of accounts) {
      if (account.id !== activeAccountId && !accountViews.has(account.id) && preloadIds.includes(account.id)) {
        createAccountView(account).then((view) => {
          accountViews.set(account.id, view);
          if (!view.webContents.isDestroyed()) {
            view.webContents.setFrameRate(5);
          }
          console.log(`Preloaded account: ${account.name} (${account.id})`);
        }).catch((err) => {
          console.error(`Failed to preload account ${account.name}:`, err);
        });
      }
    }
  }
}

let isQuitting = false;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 700,
    minHeight: 500,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#111b21',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Register context menu
  registerContextMenu(mainWindow.webContents);

  // Forward renderer console logs to main process console for debugging
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer Console] [Level ${level}] ${message} (at ${sourceId}:${line})`);
  });

  mainWindow.once('ready-to-show', async () => {
    console.log('Main window ready-to-show, activeAccountId:', activeAccountId);
    if (!globalSettings.startMinimized) {
      mainWindow?.show();
    } else {
      setTimeout(() => {
        if (Notification.isSupported()) {
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#00a884"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;
          const icon = nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'));
          const notification = new Notification({
            title: 'WAllie',
            body: 'WAllie started minimized to the system tray.',
            icon: icon,
          });
          notification.on('click', () => {
            mainWindow?.show();
            mainWindow?.focus();
          });
          notification.show();
        }
      }, 1000);
    }
    // Only switch to active account and preload if disclaimer has been accepted
    if (globalSettings.disclaimerAccepted) {
      await initializeAccountsLoad();
    } else {
      console.log('Legal disclaimer not yet accepted. Deferring account view load.');
    }
  });

  // Automatically focus active WebContentsView when main window gets focus
  mainWindow.on('focus', () => {
    if (!disclaimerOpen && !protocolPromptOpen && !settingsOpen) {
      const activeView = accountViews.get(activeAccountId);
      if (activeView && !activeView.webContents.isDestroyed()) {
        activeView.webContents.focus();
      }
    }
  });

  // Register zoom shortcuts on main window as well
  registerZoomShortcuts(mainWindow.webContents);

  // Link Delegation for main window: open external links in default browser
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const parsedUrl = new URL(url);
      const isLocalHost = parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1';
      const isAppUrl = process.env.VITE_DEV_SERVER_URL 
        ? url.startsWith(process.env.VITE_DEV_SERVER_URL)
        : url.startsWith('file://');
      if (!isAppUrl && !isLocalHost) {
        event.preventDefault();
        shell.openExternal(url).catch((err) => console.error('Failed to open external link:', err));
      }
    } catch (err) {
      event.preventDefault();
      shell.openExternal(url).catch((err) => console.error('Failed to open external link:', err));
    }
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url).catch((err) => console.error('Failed to open external link:', err));
    return { action: 'deny' };
  });

  mainWindow.on('resize', updateActiveViewBounds);
  mainWindow.on('maximize', () => {
    console.log('Main window maximized');
    mainWindow?.webContents.send('window:maximized-changed', true);
    // Explicitly update bounds with a short delay to ensure GTK has fully transitioned layout
    setTimeout(updateActiveViewBounds, 100);
  });
  mainWindow.on('unmaximize', () => {
    console.log('Main window unmaximized');
    mainWindow?.webContents.send('window:maximized-changed', false);
    // Explicitly update bounds with a short delay to ensure GTK has fully transitioned layout
    setTimeout(updateActiveViewBounds, 100);
  });

  mainWindow.on('close', (event) => {
    if (mainWindow && !isQuitting) {
      if (globalSettings.closeToTray) {
        event.preventDefault();
        mainWindow.hide();
        if (Notification.isSupported()) {
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#00a884"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;
          const icon = nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'));
          const notification = new Notification({
            title: 'WAllie',
            body: 'WAllie minimized to the system tray and is still running.',
            icon: icon,
          });
          notification.on('click', () => {
            mainWindow?.show();
            mainWindow?.focus();
          });
          notification.show();
        }
      } else {
        isQuitting = true;
        app.quit();
      }
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '../renderer/icon.png');
  let icon = nativeImage.createFromPath(iconPath);

  if (icon.isEmpty()) {
    // Simple clean SVG icon for tray
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#00a884"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;
    icon = nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'));
  } else {
    // Resize to standard tray size
    icon = icon.resize({ width: 16, height: 16 });
  }

  tray = new Tray(icon);
  tray.setToolTip('WAllie');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show WhatsApp',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
}

// Reusable account removal helper
async function removeAccountLogic(id: string): Promise<boolean> {
  if (accounts.length <= 1) return false; // Don't delete last remaining account
  const account = accounts.find((a) => a.id === id);
  if (!account) return false;

  // Only show warning dialog if the user has logged in
  if (account.loggedIn && mainWindow) {
    const choice = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['Cancel', 'Remove'],
      defaultId: 0,
      cancelId: 0,
      title: 'Confirm Account Removal',
      message: `Are you sure you want to remove "${account.name}"?`,
      detail: 'This will log you out, clear all session cache and storage, and delete all imported extensions for this account.',
    });

    if (choice.response !== 1) {
      return false;
    }
  }

  // Delete all imported extensions from disk
  if (account.extensions && account.extensions.length > 0) {
    for (const ext of account.extensions) {
      try {
        safeDeleteExtensionDir(ext.path);
      } catch (err) {
        console.error(`Failed to delete extension directory ${ext.path}:`, err);
      }
    }
  }

  // Clear storage partition
  const accountSession = session.fromPartition(account.partition);
  try {
    await accountSession.clearStorageData();
  } catch (err) {
    console.error(`Failed to clear session storage:`, err);
  }

  accounts = accounts.filter((a) => a.id !== id);
  saveAccounts();

  const view = accountViews.get(id);
  if (view) {
    if (activeAccountId === id && mainWindow) {
      mainWindow.contentView.removeChildView(view);
    }
    accountViews.delete(id);
  }

  // Close and delete the associated DevTools window if open
  const devtoolsWin = devtoolsWindows.get(id);
  if (devtoolsWin && !devtoolsWin.isDestroyed()) {
    devtoolsWin.close();
  }
  devtoolsWindows.delete(id);

  if (activeAccountId === id) {
    await switchActiveAccount(accounts[0].id);
  } else {
    mainWindow?.webContents.send('account:list-changed', accounts, activeAccountId);
  }
  return true;
}

// Register IPC handlers
ipcMain.on('window:minimize', (event) => {
  console.log('IPC Received: window:minimize');
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.minimize();
  } else {
    mainWindow?.minimize();
  }
});
ipcMain.on('window:maximize', (event) => {
  console.log('IPC Received: window:maximize');
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  } else {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  }
});
ipcMain.on('window:close', (event) => {
  console.log('IPC Received: window:close');
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.close();
  } else if (mainWindow) {
    mainWindow.close();
  }
});
ipcMain.handle('window:isMaximized', (event) => {
  console.log('IPC Handle: window:isMaximized');
  const win = BrowserWindow.fromWebContents(event.sender);
  return win?.isMaximized() ?? false;
});
ipcMain.on('window:toggle-always-on-top', (event) => {
  console.log('IPC Received: window:toggle-always-on-top');
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    const isAlwaysOnTop = !win.isAlwaysOnTop();
    win.setAlwaysOnTop(isAlwaysOnTop, 'screen-saver');
    event.sender.send('window:always-on-top-changed', isAlwaysOnTop);
  }
});
ipcMain.handle('window:get-always-on-top', (event) => {
  console.log('IPC Handle: window:get-always-on-top');
  const win = BrowserWindow.fromWebContents(event.sender);
  return win?.isAlwaysOnTop() ?? false;
});
ipcMain.handle('account:get-name-for-session', (event) => {
  console.log('IPC Handle: account:get-name-for-session');
  for (const account of accounts) {
    const accSession = session.fromPartition(account.partition);
    if (accSession === event.sender.session) {
      return account.name;
    }
  }
  return 'WhatsApp';
});

function animateSettingsTransition(targetOpen: boolean) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (animationInterval) {
    clearInterval(animationInterval);
    animationInterval = null;
  }

  settingsOpen = targetOpen;

  const startWidth = settingsDrawerWidth;
  const endWidth = targetOpen ? DRAWER_WIDTH : 0;
  const duration = 300; // 300ms transition duration
  const startTime = Date.now();

  animationInterval = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      if (animationInterval) clearInterval(animationInterval);
      animationInterval = null;
      return;
    }

    const elapsed = Date.now() - startTime;
    const progress = Math.min(1, elapsed / duration);
    const easedProgress = win10Easing(progress);

    settingsDrawerWidth = startWidth + (endWidth - startWidth) * easedProgress;
    updateActiveViewBounds(true);

    if (progress >= 1) {
      if (animationInterval) clearInterval(animationInterval);
      animationInterval = null;
    }
  }, 8); // Run at ~120 FPS for high-refresh screens
}

ipcMain.on('settings:toggle', (_event, isOpen: boolean) => {
  console.log('IPC Received: settings:toggle, isOpen:', isOpen);
  animateSettingsTransition(isOpen);
  if (!isOpen) {
    const activeView = accountViews.get(activeAccountId);
    if (activeView && !activeView.webContents.isDestroyed()) {
      activeView.webContents.focus();
    }
  }
});

ipcMain.on('disclaimer:toggle', (_event, isOpen: boolean) => {
  console.log('IPC Received: disclaimer:toggle, isOpen:', isOpen);
  disclaimerOpen = isOpen;
  updateActiveViewBounds();
  if (!isOpen) {
    const activeView = accountViews.get(activeAccountId);
    if (activeView && !activeView.webContents.isDestroyed()) {
      activeView.webContents.focus();
    }
  }
});

ipcMain.on('protocol:toggle-prompt', (_event, isOpen: boolean) => {
  console.log('IPC Received: protocol:toggle-prompt, isOpen:', isOpen);
  protocolPromptOpen = isOpen;
  updateActiveViewBounds();
  if (!isOpen) {
    const activeView = accountViews.get(activeAccountId);
    if (activeView && !activeView.webContents.isDestroyed()) {
      activeView.webContents.focus();
    }
  }
});

ipcMain.on('devtools:toggle-wallie', () => {
  console.log('IPC Received: devtools:toggle-wallie');
  if (mainWindow) {
    if (mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools();
    } else {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  }
});

ipcMain.handle('account:get-all', () => accounts);
ipcMain.handle('account:get-active-id', () => activeAccountId);
ipcMain.on('account:switch', async (_event, id: string) => {
  await switchActiveAccount(id);
});

ipcMain.on('zoom:reset', () => {
  const activeContents = getActiveWebContents();
  if (activeContents) {
    resetZoom(activeContents);
  }
});

ipcMain.on('account:reload-active', () => {
  const activeView = accountViews.get(activeAccountId);
  if (activeView) {
    console.log(`Reloading active view for account: ${activeAccountId}`);
    activeView.webContents.reload();
  }
});

ipcMain.on('account:reload', (_event, accountId: string) => {
  const view = accountViews.get(accountId);
  if (view) {
    console.log(`Reloading view for account: ${accountId}`);
    view.webContents.reload();
  }
});

ipcMain.on('app:relaunch', () => {
  console.log('IPC Received: app:relaunch. Relaunching application.');
  app.relaunch();
  app.exit(0);
});

ipcMain.handle('account:add', async (_event, customName?: string) => {
  const newIndex = accounts.length + 1;
  const newId = `acc_${Date.now()}`;
  const newAccount: Account = {
    id: newId,
    name: customName || `Account ${newIndex}`,
    partition: `persist:account_${newId}`,
    unreadCount: 0,
    loggedIn: false,
    extensions: [],
    emoji: '',
  };
  accounts.push(newAccount);
  saveAccounts();
  await switchActiveAccount(newAccount.id);
  return newAccount;
});

ipcMain.handle('account:rename', (_event, id: string, newName: string) => {
  const account = accounts.find((a) => a.id === id);
  if (account) {
    account.name = newName;
    saveAccounts();
    mainWindow?.webContents.send('account:list-changed', accounts, activeAccountId);

    const devtoolsWin = devtoolsWindows.get(id);
    if (devtoolsWin && !devtoolsWin.isDestroyed()) {
      devtoolsWin.setTitle(`DevTools - ${newName}`);
      devtoolsWin.webContents.executeJavaScript(`
        const badgeEl = document.querySelector('.titlebar-left-badge');
        if (badgeEl) badgeEl.textContent = ${JSON.stringify(newName)};
        document.title = 'DevTools - ' + ${JSON.stringify(newName)};
        const metaEl = document.querySelector('meta[name="account-name"]');
        if (metaEl) metaEl.setAttribute('content', encodeURIComponent(${JSON.stringify(newName)}));
      `).catch((err) => console.error('Failed to update devtools window title:', err));
    }

    return true;
  }
  return false;
});

ipcMain.handle('account:update-emoji', (_event, id: string, emoji: string) => {
  const account = accounts.find((a) => a.id === id);
  if (account) {
    account.emoji = emoji;
    saveAccounts();
    mainWindow?.webContents.send('account:list-changed', accounts, activeAccountId);
    return true;
  }
  return false;
});

ipcMain.handle('account:remove', async (_event, id: string) => {
  return await removeAccountLogic(id);
});

ipcMain.on('account:context-menu', (event, accountId: string) => {
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return;

  const menu = Menu.buildFromTemplate([
    {
      label: 'Rename Account',
      click: () => {
        mainWindow?.webContents.send('account:trigger-rename', accountId);
      },
    },
    {
      label: 'Manage Account',
      click: () => {
        mainWindow?.webContents.send('settings:open-manage-accounts', accountId);
      },
    },
    { type: 'separator' },
    {
      label: 'Remove Account',
      enabled: accounts.length > 1,
      click: async () => {
        await removeAccountLogic(accountId);
      },
    },
  ]);

  const targetWindow = BrowserWindow.fromWebContents(event.sender);
  menu.popup({ window: targetWindow || undefined });
});

// Extension Engine Handlers
ipcMain.handle('extension:import', async (_event, accountId: string, importType: 'folder' | 'archive') => {
  if (!mainWindow) return null;

  let properties: ('openFile' | 'openDirectory')[] = [];
  let filters: { name: string; extensions: string[] }[] = [];

  if (importType === 'folder') {
    properties = ['openDirectory'];
  } else {
    properties = ['openFile'];
    filters = [{ name: 'Chrome Extension Archive', extensions: ['zip', 'crx'] }];
  }

  const result = await dialog.showOpenDialog(mainWindow, {
    title: importType === 'folder' ? 'Import Unpacked Extension Folder' : 'Import Extension ZIP/CRX File',
    properties,
    filters
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const selectedPath = result.filePaths[0];
  const isDirectory = fs.statSync(selectedPath).isDirectory();

  // Basic validation check
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

    // Show permission warning
    const userApproved = await showExtensionPermissionWarning(mainWindow, manifestPath, newExtension.name);
    if (!userApproved) {
      safeDeleteExtensionDir(targetDir);
      return null;
    }

    const account = accounts.find((a) => a.id === accountId);
    if (account) {
      if (!account.extensions) {
        account.extensions = [];
      }
      account.extensions.push(newExtension);
      saveAccounts();

      // Load into active session immediately if the view exists
      const view = accountViews.get(accountId);
      if (view) {
        const accountSession = session.fromPartition(account.partition);
        await accountSession.loadExtension(targetDir);
      }

      mainWindow.webContents.send('account:list-changed', accounts, activeAccountId);
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
});

// Chrome Web Store Sandboxed Window and Installer Handlers
ipcMain.on('webstore:open', (_event, accountId: string) => {
  const cwsWin = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      partition: 'persist:webstore',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  cwsWin.removeMenu();

  webstoreWindows.set(cwsWin.webContents.id, accountId);

  cwsWin.webContents.on('destroyed', () => {
    webstoreWindows.delete(cwsWin.webContents.id);
  });

  cwsWin.loadURL('https://chromewebstore.google.com/');
});

ipcMain.handle('webstore:get-target-account-id', (event) => {
  return webstoreWindows.get(event.sender.id) || null;
});

ipcMain.handle('webstore:check-installed', (_event, accountId: string, extensionId: string) => {
  const account = accounts.find((a) => a.id === accountId);
  if (!account || !account.extensions) return false;
  return account.extensions.some((ext) => ext.id === extensionId);
});

ipcMain.handle('extension:install-webstore', async (_event, accountId: string, urlOrId: string) => {
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

    // Show permission warning
    if (mainWindow) {
      const userApproved = await showExtensionPermissionWarning(mainWindow, manifestPath, newExtension.name);
      if (!userApproved) {
        safeDeleteExtensionDir(targetDir);
        return null;
      }
    }

    const account = accounts.find((a) => a.id === accountId);
    if (account) {
      if (!account.extensions) {
        account.extensions = [];
      }
      // Overwrite extension entry in array if present
      account.extensions = account.extensions.filter((ext) => ext.id !== extensionId);
      account.extensions.push(newExtension);
      saveAccounts();

      const view = accountViews.get(accountId);
      if (view) {
        const accountSession = session.fromPartition(account.partition);
        const loadedExts = accountSession.getAllExtensions();
        const matched = loadedExts.find((e) => e.id === extensionId || path.resolve(e.path) === path.resolve(targetDir));
        if (matched) {
          accountSession.removeExtension(matched.id);
        }
        await accountSession.loadExtension(targetDir);
      }

      mainWindow?.webContents.send('account:list-changed', accounts, activeAccountId);
      return newExtension;
    }
  } catch (err: any) {
    console.error(`Failed to install Chrome Web Store extension ${extensionId}:`, err);
    dialog.showErrorBox('Extension Install Error', err.message || 'An unknown error occurred during download.');
    throw err;
  }

  return null;
});

ipcMain.handle('extension:toggle', async (_event, accountId: string, extensionId: string, enabled: boolean) => {
  const account = accounts.find((a) => a.id === accountId);
  if (!account || !account.extensions) return false;

  const ext = account.extensions.find((e) => e.id === extensionId);
  if (!ext) return false;

  ext.enabled = enabled;
  saveAccounts();

  const view = accountViews.get(accountId);
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

  mainWindow?.webContents.send('account:list-changed', accounts, activeAccountId);
  return true;
});

ipcMain.handle('extension:remove', async (_event, accountId: string, extensionId: string) => {
  const account = accounts.find((a) => a.id === accountId);
  if (!account || !account.extensions) return false;

  const extIndex = account.extensions.findIndex((e) => e.id === extensionId);
  if (extIndex === -1) return false;

  const ext = account.extensions[extIndex];

  // Unload from running session
  const view = accountViews.get(accountId);
  if (view) {
    const accountSession = session.fromPartition(account.partition);
    const loadedExts = accountSession.getAllExtensions();
    const matched = loadedExts.find((e) => path.resolve(e.path) === path.resolve(ext.path));
    if (matched) {
      accountSession.removeExtension(matched.id);
    }
  }

  // Delete extension files
  try {
    safeDeleteExtensionDir(ext.path);
  } catch (err) {
    console.error(`Failed to delete extension files at ${ext.path}:`, err);
  }

  // Remove metadata
  account.extensions.splice(extIndex, 1);
  saveAccounts();

  mainWindow?.webContents.send('account:list-changed', accounts, activeAccountId);
  return true;
});

if (gotTheLock) {
  app.whenReady().then(() => {
    // Register custom protocol clients
    if (process.defaultApp) {
      if (process.argv.length >= 2) {
        const execArgs = [path.resolve(process.argv[1])];
        app.setAsDefaultProtocolClient('whatsapp', process.execPath, execArgs);
        app.setAsDefaultProtocolClient('wallie', process.execPath, execArgs);
      }
    } else {
      app.setAsDefaultProtocolClient('whatsapp');
      app.setAsDefaultProtocolClient('wallie');
    }

    // Content Security Policy for the main renderer window (React UI)
    // Only applies to defaultSession — WhatsApp partitions are unaffected
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ws://localhost:* http://localhost:*"
          ]
        }
      });
    });

    createMainWindow();
    createTray();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      } else {
        mainWindow?.show();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    // Flush notification history immediately before exit
    if (notificationHistoryCache && historyFlushTimeout) {
      clearTimeout(historyFlushTimeout);
      try {
        fs.writeFileSync(NOTIFICATION_HISTORY_FILE, JSON.stringify(notificationHistoryCache, null, 2), 'utf8');
      } catch (err) {
        console.error('Failed to flush notification history on quit:', err);
      }
    }
  });
}

// Zoom helper functions
const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0];

function changeZoom(contents: Electron.WebContents, direction: 'in' | 'out') {
  try {
    const currentFactor = contents.getZoomFactor();

    // Find closest zoom step
    let closestIndex = 4; // Default to 1.0 (index 4)
    let minDiff = Math.abs(currentFactor - ZOOM_STEPS[closestIndex]);

    for (let i = 0; i < ZOOM_STEPS.length; i++) {
      const diff = Math.abs(currentFactor - ZOOM_STEPS[i]);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    }

    let nextIndex = closestIndex;
    if (direction === 'in') {
      nextIndex = Math.min(ZOOM_STEPS.length - 1, closestIndex + 1);
    } else {
      nextIndex = Math.max(0, closestIndex - 1);
    }

    const newFactor = ZOOM_STEPS[nextIndex];
    contents.setZoomFactor(newFactor);

    const zoomPercent = Math.round(newFactor * 100);
    console.log(`Setting zoom factor to: ${newFactor} (${zoomPercent}%)`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('zoom:changed', zoomPercent);
    }
  } catch (error) {
    console.error('Error changing zoom factor:', error);
  }
}

function resetZoom(contents: Electron.WebContents) {
  try {
    contents.setZoomFactor(1.0);
    console.log('Resetting zoom factor to: 1.0 (100%)');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('zoom:changed', 100);
    }
  } catch (error) {
    console.error('Error resetting zoom factor:', error);
  }
}

function getActiveWebContents(): Electron.WebContents | null {
  const activeView = accountViews.get(activeAccountId);
  return activeView ? activeView.webContents : null;
}

function registerContextMenu(webContents: Electron.WebContents) {
  webContents.on('context-menu', (event, params) => {
    const menuItems: Electron.MenuItemConstructorOptions[] = [];

    const isEditable = params.isEditable;
    const hasSelection = !!(params.selectionText && params.selectionText.trim() !== '');
    const hasLink = !!((params.linkURL && params.linkURL.trim() !== '') || 
                    (hasSelection && /^(https?:\/\/|www\.)[^\s]+$/i.test(params.selectionText.trim())));

    // Link option
    if (hasLink) {
      const rawLink = params.linkURL || params.selectionText.trim();
      const link = rawLink.startsWith('www.') ? `https://${rawLink}` : rawLink;
      const maxLength = 40;
      const truncatedLink = link.length <= maxLength ? link : link.substring(0, maxLength) + '...';
      menuItems.push({
        label: `Open ${truncatedLink} in browser`,
        click: () => {
          shell.openExternal(link).catch((err) => console.error('Failed to open external link:', err));
        },
      });
    }

    // Search in Google option
    if (hasSelection) {
      if (menuItems.length > 0) menuItems.push({ type: 'separator' });
      menuItems.push({
        label: 'Search in Google',
        click: () => {
          const query = encodeURIComponent(params.selectionText.trim());
          shell.openExternal(`https://www.google.com/search?q=${query}`).catch((err) => console.error('Failed to open search URL:', err));
        },
      });
    }

    // Standard edit commands
    const editItems: Electron.MenuItemConstructorOptions[] = [];
    if (isEditable) {
      editItems.push({
        label: 'Cut',
        role: 'cut',
        enabled: hasSelection,
      });
      editItems.push({
        label: 'Copy',
        role: 'copy',
        enabled: hasSelection,
      });
      editItems.push({
        label: 'Paste',
        role: 'paste',
      });
    } else if (hasSelection) {
      editItems.push({
        label: 'Copy',
        role: 'copy',
      });
    }

    if (editItems.length > 0) {
      if (menuItems.length > 0) menuItems.push({ type: 'separator' });
      menuItems.push(...editItems);
    }

    // Select All
    if (menuItems.length > 0) menuItems.push({ type: 'separator' });
    menuItems.push({
      label: 'Select All',
      role: 'selectAll',
    });

    const menu = Menu.buildFromTemplate(menuItems);
    menu.popup({
      window: BrowserWindow.fromWebContents(webContents) || undefined,
    });
  });
}

function registerZoomShortcuts(contents: Electron.WebContents) {
  contents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      const isControl = process.platform === 'darwin' ? input.meta : input.control;
      const isShift = input.shift;
      const isAlt = input.alt;

      // Intercept devtools keyboard shortcut for main window (Wallie)
      const isDevToolsShortcut = 
        (isControl && isShift && (input.key === 'i' || input.key === 'I')) ||
        (process.platform === 'darwin' && input.meta && isAlt && (input.key === 'i' || input.key === 'I'));

      if (isDevToolsShortcut && mainWindow && contents === mainWindow.webContents) {
        event.preventDefault();
        if (mainWindow.webContents.isDevToolsOpened()) {
          mainWindow.webContents.closeDevTools();
        } else {
          mainWindow.webContents.openDevTools({ mode: 'detach' });
        }
        return;
      }

      if (isControl) {
        if (input.key === '=' || input.key === '+') {
          const targetContents = getActiveWebContents() || contents;
          changeZoom(targetContents, 'in');
          event.preventDefault();
        } else if (input.key === '-') {
          const targetContents = getActiveWebContents() || contents;
          changeZoom(targetContents, 'out');
          event.preventDefault();
        } else if (input.key === '0') {
          const targetContents = getActiveWebContents() || contents;
          resetZoom(targetContents);
          event.preventDefault();
        }
      }
    }
  });
}

const OLED_THEME_CSS = `
/* OLED Dark Theme overrides */
body,
body.web,
.web,
#app,
.app-wrapper,
.two,
.three {
  background-color: #000000 !important;
  background-image: none !important;
}

:root {
  --app-background: #000000 !important;
  --background-default: #000000 !important;
  --background-default-hover: #111111 !important;
  --background-default-active: #1a1a1a !important;
  --conversation-panel-background: #000000 !important;
  --panel-background: #000000 !important;
  --panel-background-deep: #050505 !important;
  --panel-background-hover: #111111 !important;
  --panel-background-colored: #080808 !important;
  --panel-header-background: #0a0a0a !important;
  --panel-header-icon: #aebac1 !important;
  --search-container-background: #050505 !important;
  --search-input-background: #111111 !important;
  --system-message-background: #111111 !important;
  --incoming-message-background: #121212 !important;
  --incoming-message-background-deeper: #1a1a1a !important;
  --outgoing-message-background: #054738 !important;
  --outgoing-message-background-deeper: #095c4a !important;
  
  --border-default: #1a1a1a !important;
  --border-panel: #1a1a1a !important;
  --border-stronger: #262626 !important;
  --border-list: #1a1a1a !important;
  
  --input-placeholder: #667781 !important;
  --primary: #00a884 !important;
  --message-primary: #e9edef !important;
}

#pane-side,
._33L3z,
[data-testid="chat-list"] {
  background-color: #000000 !important;
}

footer,
footer > div {
  background-color: #0a0a0a !important;
  border-top: 1px solid #1a1a1a !important;
}

.message-in,
.message-out,
[data-testid="msg-container"] {
  border: 1px solid #1a1a1a !important;
}
`;

const COMPACT_THEME_CSS = `
/* Compact UI Theme overrides */
:root {
  --chat-list-width: 250px !important;
}

div[data-testid="cell-frame-container"] {
  padding-top: 4px !important;
  padding-bottom: 4px !important;
  min-height: 48px !important;
}

div[data-testid="cell-frame-container"] img,
div[data-testid="cell-frame-container"] svg,
div[data-testid="cell-frame-container"] .avatar {
  width: 32px !important;
  height: 32px !important;
}

header {
  height: 44px !important;
  padding: 4px 8px !important;
}

div[data-testid="chat-list-search"] {
  padding: 4px 8px !important;
}

span[data-testid="cell-frame-title"] {
  font-size: 13px !important;
}

div[data-testid="msg-container"] {
  padding: 2px 6px !important;
}

div[data-testid="msg-container"] span {
  font-size: 12.5px !important;
}

footer {
  padding: 4px 8px !important;
  min-height: 40px !important;
}
`;

const insertedCssKeys = new Map<string, string>();

async function injectCustomCssForView(accountId: string, webContents: Electron.WebContents) {
  const account = accounts.find((a) => a.id === accountId);
  if (!account || !account.settings) return;

  const previousKey = insertedCssKeys.get(accountId);
  if (previousKey) {
    try {
      await webContents.removeInsertedCSS(previousKey);
      insertedCssKeys.delete(accountId);
    } catch (err) {
      // Ignore if key is already invalid due to page reload
    }
  }

  const { customCss = '', selectedTheme = 'none' } = account.settings;

  let themeCss = '';
  if (selectedTheme === 'oled') {
    themeCss = OLED_THEME_CSS;
  } else if (selectedTheme === 'compact') {
    themeCss = COMPACT_THEME_CSS;
  }

  const combinedCss = themeCss + '\n' + customCss;
  if (!combinedCss.trim()) return;

  try {
    const key = await webContents.insertCSS(combinedCss);
    insertedCssKeys.set(accountId, key);
  } catch (err) {
    console.error('Failed to insert CSS:', err);
  }
}

function getPartitionDirName(partition: string): string {
  if (partition.startsWith('persist:')) {
    return partition.substring(8);
  }
  return partition;
}

const execAsync = promisify(exec);

// Cache storage sizes per partition for 30 seconds
const storageSizeCache = new Map<string, { sizes: { cache: number; localStorage: number; indexedDb: number; cookies: number }; timestamp: number }>();
const STORAGE_CACHE_TTL = 30000; // 30 seconds

async function calculatePathSize(itemPath: string): Promise<number> {
  try {
    const stats = await fs.promises.stat(itemPath);
    if (stats.isFile()) {
      return stats.size;
    }
    
    // Fast path: use native du -sb on Linux
    try {
      const { stdout } = await execAsync(`du -sb "${itemPath}" 2>/dev/null`);
      const match = stdout.trim().match(/^(\d+)/);
      if (match) {
        return parseInt(match[1], 10);
      }
    } catch {}

    // Fallback path: standard walk
    if (stats.isDirectory()) {
      const files = await fs.promises.readdir(itemPath);
      const sizes = await Promise.all(
        files.map((file) => calculatePathSize(path.join(itemPath, file)))
      );
      return sizes.reduce((acc, curr) => acc + curr, 0);
    }
  } catch (err) {
    // Return 0 if folder/file doesn't exist
  }
  return 0;
}

async function getAccountStorageSizes(partition: string) {
  // Check cache first
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

  storageSizeCache.set(partition, { sizes, timestamp: Date.now() });
  return sizes;
}

const NOTIFICATION_HISTORY_FILE = path.join(app.getPath('userData'), 'notification_history.json');
const MAX_NOTIFICATIONS = 100;

// In-memory notification history with debounced disk persistence
let notificationHistoryCache: HistoricalNotification[] | null = null;
let historyFlushTimeout: NodeJS.Timeout | null = null;
const HISTORY_FLUSH_DELAY = 5000; // 5 seconds

function getNotificationHistory(): HistoricalNotification[] {
  if (notificationHistoryCache === null) {
    // Cold load from disk
    try {
      if (fs.existsSync(NOTIFICATION_HISTORY_FILE)) {
        const data = fs.readFileSync(NOTIFICATION_HISTORY_FILE, 'utf8');
        notificationHistoryCache = JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load notification history:', error);
    }
    if (!notificationHistoryCache) {
      notificationHistoryCache = [];
    }
  }
  return notificationHistoryCache;
}

function scheduleHistoryFlush() {
  if (historyFlushTimeout) {
    clearTimeout(historyFlushTimeout);
  }
  historyFlushTimeout = setTimeout(async () => {
    historyFlushTimeout = null;
    if (notificationHistoryCache) {
      try {
        await fs.promises.writeFile(NOTIFICATION_HISTORY_FILE, JSON.stringify(notificationHistoryCache, null, 2), 'utf8');
      } catch (error) {
        console.error('Failed to flush notification history to disk:', error);
      }
    }
  }, HISTORY_FLUSH_DELAY);
}

function logNotificationToHistory(notif: HistoricalNotification) {
  const history = getNotificationHistory();
  history.unshift(notif);
  if (history.length > MAX_NOTIFICATIONS) {
    history.splice(MAX_NOTIFICATIONS);
  }
  scheduleHistoryFlush();
  mainWindow?.webContents.send('notification:history-changed', history);
}

function clearNotificationHistoryCache() {
  notificationHistoryCache = [];
  scheduleHistoryFlush();
}

// IPC Handlers for Storage Management
ipcMain.handle('account:get-storage-sizes', async (_event, accountId: string) => {
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return { cache: 0, localStorage: 0, indexedDb: 0, cookies: 0 };
  return await getAccountStorageSizes(account.partition);
});

ipcMain.handle('account:clear-storage', async (_event, accountId: string, type: 'cache' | 'media') => {
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return false;

  const accountSession = session.fromPartition(account.partition);

  try {
    if (type === 'cache') {
      await accountSession.clearCache();
      await accountSession.clearStorageData({
        storages: ['shadercache', 'cachestorage'],
      });
      console.log(`Cache cleared successfully for account: ${accountId}`);
    } else if (type === 'media') {
      // Clear filesystem and websql (which don't store authentication)
      await accountSession.clearStorageData({
        storages: ['filesystem', 'websql'],
      });
      console.log(`Filesystem and WebSQL cleared for account: ${accountId}`);

      // Get or temporarily create the view to execute the IndexedDB deletion
      let view = accountViews.get(accountId);
      if (!view) {
        const acc = accounts.find((a) => a.id === accountId);
        if (acc) {
          view = await createAccountView(acc);
          accountViews.set(accountId, view);
        }
      }

      if (view) {
        const runClear = async () => {
          const clearScript = `
            (async () => {
              try {
                if (!window.indexedDB || !window.indexedDB.databases) return false;
                const dbs = await window.indexedDB.databases();
                const keptDbs = ['wawc', 'signal-storage'];
                for (const db of dbs) {
                  if (db.name && !keptDbs.includes(db.name)) {
                    window.indexedDB.deleteDatabase(db.name);
                  }
                }
                return true;
              } catch (err) {
                return false;
              }
            })()
          `;
          try {
            await view.webContents.executeJavaScript(clearScript);
          } catch (err) {
            console.error('Failed to run selective IndexedDB clear:', err);
          }
        };

        if (view.webContents.isLoading()) {
          view.webContents.once('dom-ready', runClear);
        } else {
          await runClear();
        }
      }
      console.log(`Selective IndexedDB clear initiated for account: ${accountId}`);
    }

    // Invalidate cached storage size
    storageSizeCache.delete(account.partition);

    // Note: Automatic reload removed. Handled via "Reload page" card in settings frontend.
    return true;
  } catch (error) {
    console.error(`Failed to clear storage for account ${accountId} (type: ${type}):`, error);
    return false;
  }
});

// IPC Handlers for Settings Management
ipcMain.handle('settings:get-global', () => globalSettings);

ipcMain.handle('settings:save-global', async (_event, newSettings: GlobalSettings) => {
  const disclaimerJustAccepted = newSettings.disclaimerAccepted && !globalSettings.disclaimerAccepted;
  globalSettings = newSettings;
  saveSettings(globalSettings);
  mainWindow?.webContents.send('settings:global-changed', globalSettings);
  
  if (disclaimerJustAccepted) {
    console.log('Legal disclaimer accepted. Initializing account views.');
    await initializeAccountsLoad();
  }
  return true;
});

ipcMain.handle('account:update-settings', (_event, accountId: string, settings: Account['settings']) => {
  const account = accounts.find((a) => a.id === accountId);
  if (account) {
    account.settings = settings;
    saveAccounts();

    // Note: Automatic reload removed. Handled via "Reload page" card in settings frontend.
    
    // Broadcast list changed to synchronize renderer states
    mainWindow?.webContents.send('account:list-changed', accounts, activeAccountId);
    return true;
  }
  return false;
});

// IPC Handler to save Custom CSS & Theme and apply it live
ipcMain.handle('account:save-css', (_event, accountId: string, customCss: string, selectedTheme: string) => {
  const account = accounts.find((a) => a.id === accountId);
  if (account) {
    if (!account.settings) {
      account.settings = { ...DEFAULT_ACCOUNT_SETTINGS };
    }
    account.settings.customCss = customCss;
    account.settings.selectedTheme = selectedTheme;
    saveAccounts();

    const view = accountViews.get(accountId);
    if (view) {
      injectCustomCssForView(accountId, view.webContents);
    }
    return true;
  }
  return false;
});

function toggleDevToolsForAccount(accountId: string) {
  const account = accounts.find((a) => a.id === accountId);
  const view = accountViews.get(accountId);
  if (!view || !account) return;

  const webContents = view.webContents;

  if (devtoolsWindows.has(accountId)) {
    const existingWin = devtoolsWindows.get(accountId)!;
    if (!existingWin.isDestroyed()) {
      existingWin.close();
      return;
    }
  }

  const devtoolsWindow = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 500,
    minHeight: 400,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#111b21',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      partition: account.partition,
      contextIsolation: true,
      nodeIntegration: false,
      // sandbox: false is intentional — the DevTools window loads a custom HTML page
      // with a unified titlebar that requires the preload script. Enabling sandbox
      // breaks element inspection and network request display. The attack surface is
      // minimal since only our own data:text/html content is loaded.
      sandbox: false,
    },
  });

  devtoolsWindows.set(accountId, devtoolsWindow);

  const devtoolsView = new WebContentsView({
    webPreferences: {
      partition: account.partition,
    }
  });
  devtoolsWindow.contentView.addChildView(devtoolsView);

  let resizeTimeout: NodeJS.Timeout | null = null;
  const updateBounds = () => {
    if (devtoolsWindow.isDestroyed()) return;

    // 1. Immediately update bounds synchronously
    const [width, height] = devtoolsWindow.getContentSize();
    devtoolsView.setBounds({ x: 0, y: 28, width, height: Math.max(0, height - 28) });

    // 2. Retain debounced update as a trailing fallback to ensure final layout settle
    if (resizeTimeout) {
      clearTimeout(resizeTimeout);
    }
    resizeTimeout = setTimeout(() => {
      if (devtoolsWindow.isDestroyed()) return;
      const [w, h] = devtoolsWindow.getContentSize();
      devtoolsView.setBounds({ x: 0, y: 28, width: w, height: Math.max(0, h - 28) });
      resizeTimeout = null;
    }, 50);
  };

  devtoolsWindow.on('resize', updateBounds);
  devtoolsWindow.once('ready-to-show', () => {
    devtoolsWindow.show();
    updateBounds();
  });

  devtoolsWindow.on('maximize', () => {
    devtoolsWindow.webContents.send('window:maximized-changed', true);
    setTimeout(updateBounds, 100);
  });

  devtoolsWindow.on('unmaximize', () => {
    devtoolsWindow.webContents.send('window:maximized-changed', false);
    setTimeout(updateBounds, 100);
  });

  devtoolsWindow.on('closed', () => {
    if (resizeTimeout) {
      clearTimeout(resizeTimeout);
      resizeTimeout = null;
    }
    devtoolsWindows.delete(accountId);
    try {
      if (webContents && !webContents.isDestroyed()) {
        webContents.closeDevTools();
      }
    } catch (err) {
      console.error('Error closing DevTools during window close:', err);
    }
  });

  // Attach devtools to the WebContentsView's webContents
  webContents.setDevToolsWebContents(devtoolsView.webContents);
  webContents.openDevTools({ mode: 'detach' });

  // Custom HTML loading with meta tags to tell the preload script to inject the unified titlebar
  const htmlContent = `<!DOCTYPE html><html><head><title>DevTools - ${account.name}</title><meta name="is-devtools" content="true"><meta name="account-name" content="${encodeURIComponent(account.name)}"></head><body></body></html>`;

  devtoolsWindow.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(htmlContent));
}

// DevTools Toggling IPC handler
ipcMain.on('devtools:toggle', () => {
  console.log('IPC Received: devtools:toggle');
  if (activeAccountId && accountViews.has(activeAccountId)) {
    toggleDevToolsForAccount(activeAccountId);
  } else {
    if (mainWindow?.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools();
    } else {
      mainWindow?.webContents.openDevTools({ mode: 'detach' });
    }
  }
});

// Web notification interception and native DBus libnotify creation
ipcMain.on('notification:create', async (event, data: { title: string; body: string; icon: string; tag: string }) => {
  const senderWebContents = event.sender;
  let senderAccount: Account | undefined;
  for (const [accId, view] of accountViews.entries()) {
    if (view.webContents === senderWebContents) {
      senderAccount = accounts.find((a) => a.id === accId);
      break;
    }
  }

  if (!senderAccount) return;

  // 1. Account Branding
  const brandedTitle = senderAccount.emoji ? `${senderAccount.emoji} | ${data.title}` : `| ${data.title}`;

  // 2. Save to local log history
  if (globalSettings.notificationLoggingEnabled) {
    logNotificationToHistory({
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      accountId: senderAccount.id,
      accountName: senderAccount.emoji ? `${senderAccount.emoji} ${senderAccount.name}` : senderAccount.name,
      title: data.title,
      body: data.body,
      icon: data.icon, // Base64 representation
      timestamp: Date.now(),
    });
  }

  // Check if native system notifications are muted for this account
  if (senderAccount.settings?.notificationsEnabled === false) {
    return;
  }

  // 3. Construct native notification avatar
  let iconImage: any = null;
  if (data.icon && data.icon.startsWith('data:image')) {
    try {
      iconImage = nativeImage.createFromDataURL(data.icon);
    } catch (err) {
      console.error('Failed to create NativeImage from base64 avatar:', err);
    }
  }

  // 4. Trigger native Linux notification with sound and actions
  const nativeNotif = new Notification({
    title: brandedTitle,
    body: data.body,
    icon: iconImage || undefined,
    silent: false,
    actions: [
      { type: 'button', text: 'Open Chat' }
    ]
  });

  const onSelectAction = () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
    if (senderAccount) {
      switchActiveAccount(senderAccount.id);
    }
    senderWebContents.send('notification:clicked-reply', data.tag);
  };

  nativeNotif.on('click', onSelectAction);
  nativeNotif.on('action', (event, index) => {
    if (index === 0) {
      onSelectAction();
    }
  });

  nativeNotif.show();
});

ipcMain.on('notification:create-log-entry', async (event, data: { title: string; body: string }) => {
  const senderWebContents = event.sender;
  let senderAccount: Account | undefined;
  for (const [accId, view] of accountViews.entries()) {
    if (view.webContents === senderWebContents) {
      senderAccount = accounts.find((a) => a.id === accId);
      break;
    }
  }

  if (!senderAccount) return;

  if (globalSettings.notificationLoggingEnabled) {
    logNotificationToHistory({
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      accountId: senderAccount.id,
      accountName: senderAccount.emoji ? `${senderAccount.emoji} ${senderAccount.name}` : senderAccount.name,
      title: data.title,
      body: data.body,
      icon: '',
      timestamp: Date.now(),
    });
  }
});

// Handle light dismiss closes from webview click events
ipcMain.on('webview:clicked', () => {
  if (settingsOpen && mainWindow) {
    mainWindow.webContents.send('settings:close-request');
  }
});

ipcMain.on('notification:close-request', (_event, tag: string) => {
  // Option to close native notification if trackable
});

// Notification History IPC Handlers
ipcMain.handle('notification:get-history', () => {
  return getNotificationHistory();
});

ipcMain.handle('notification:clear-history', () => {
  clearNotificationHistoryCache();
  return true;
});

// Custom Protocol URL IPC Handlers
ipcMain.on('protocol:ready', () => {
  if (pendingProtocolUrl) {
    console.log(`Sending pending protocol URL to ready renderer: ${pendingProtocolUrl}`);
    mainWindow?.webContents.send('protocol:received-url', pendingProtocolUrl);
    pendingProtocolUrl = null;
  }
});

ipcMain.on('protocol:handle-url', async (_event, accountId: string, urlStr: string) => {
  console.log(`Handling custom protocol URL for account ${accountId}: ${urlStr}`);
  try {
    const url = new URL(urlStr);
    let waPath = '/';
    if (url.hostname === 'send') {
      waPath = '/send' + url.search;
    } else if (url.pathname.startsWith('/send')) {
      waPath = url.pathname + url.search;
    }
    const targetUrl = `https://web.whatsapp.com${waPath}`;
    
    // Switch active account
    await switchActiveAccount(accountId);
    
    // Load URL
    const targetView = accountViews.get(accountId);
    if (targetView) {
      targetView.webContents.loadURL(targetUrl);
    }
  } catch (error) {
    console.error('Failed to handle custom protocol redirection:', error);
  }
});

