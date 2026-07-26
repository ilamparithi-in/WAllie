import { app, BrowserWindow, WebContentsView, ipcMain, Tray, Menu, nativeImage, session, dialog, desktopCapturer, shell, Notification } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Memory & CPU Optimization flags
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

const TITLEBAR_HEIGHT = 28;
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';

interface ExtensionInfo {
  id: string;
  name: string;
  version: string;
  path: string;
  enabled: boolean;
}

interface Account {
  id: string;
  name: string;
  partition: string;
  unreadCount: number;
  loggedIn: boolean;
  extensions: ExtensionInfo[];
  settings?: {
    cameraEnabled: boolean;
    micEnabled: boolean;
    notificationsEnabled: boolean;
    customCss?: string;
    selectedTheme?: string;
  };
}

interface GlobalSettings {
  closeToTray: boolean;
  hardwareAcceleration: boolean;
  loadAllOnLaunch: boolean;
  showDevToolsToggle?: boolean;
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// Settings & Accounts configuration files
const ACCOUNTS_FILE = path.join(app.getPath('userData'), 'accounts.json');
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

// Helper to load settings
function loadSettings(): GlobalSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
      const parsed = JSON.parse(data);
      return {
        closeToTray: parsed.closeToTray !== false,
        hardwareAcceleration: parsed.hardwareAcceleration !== false,
        loadAllOnLaunch: !!parsed.loadAllOnLaunch,
        showDevToolsToggle: !!parsed.showDevToolsToggle,
      };
    }
  } catch (error) {
    console.error('Failed to load settings configuration:', error);
  }
  return {
    closeToTray: true,
    hardwareAcceleration: true,
    loadAllOnLaunch: false,
    showDevToolsToggle: false,
  };
}

// Helper to save settings
function saveSettings(settings: GlobalSettings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
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
      settings: {
        cameraEnabled: true,
        micEnabled: true,
        notificationsEnabled: true,
        customCss: '',
        selectedTheme: 'none',
      },
    },
  ];
}

// Helper to save accounts
function saveAccounts() {
  try {
    const dataToSave = accounts.map(({ id, name, partition, loggedIn, extensions, settings }) => ({
      id,
      name,
      partition,
      loggedIn,
      extensions,
      settings: settings || {
        cameraEnabled: true,
        micEnabled: true,
        notificationsEnabled: true,
        customCss: '',
        selectedTheme: 'none',
      },
    }));
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(dataToSave, null, 2), 'utf8');
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

// Accounts state load
let accounts: Account[] = loadAccounts();
let activeAccountId = accounts[0].id;

// Map of account ID to WebContentsView
const accountViews = new Map<string, WebContentsView>();

// Keep track of which sessions have been configured to avoid duplicate handlers
const configuredSessions = new Set<string>();

async function createAccountView(account: Account): Promise<WebContentsView> {
  const accountSession = session.fromPartition(account.partition);

  // Set standard User-Agent on session headers to ensure WhatsApp Web loads smoothly
  accountSession.setUserAgent(DEFAULT_USER_AGENT);

  // Configure session-level handlers once per session partition
  if (!configuredSessions.has(account.partition)) {
    configuredSessions.add(account.partition);

    // Permission Request Handler (Camera, Mic, Notifications)
    accountSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
      const url = details.requestingUrl;
      const isWA = url.includes('whatsapp.com') || url.includes('whatsapp.net');
      if (isWA) {
        const targetAccount = accounts.find((a) => a.partition === account.partition);
        const settings = targetAccount?.settings || { cameraEnabled: true, micEnabled: true, notificationsEnabled: true };

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
        callback(true); // Auto-allow background-sync and other internal features for WhatsApp
        return;
      }
      callback(false);
    });

    // Permission Check Handler
    accountSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
      const isWA = requestingOrigin.includes('whatsapp.com') || requestingOrigin.includes('whatsapp.net');
      if (isWA) {
        const targetAccount = accounts.find((a) => a.partition === account.partition);
        const settings = targetAccount?.settings || { cameraEnabled: true, micEnabled: true, notificationsEnabled: true };

        if (permission === 'notifications') {
          return settings.notificationsEnabled;
        }
        if (permission === 'media') {
          const mediaType = details?.mediaType;
          if (mediaType === 'video') return settings.cameraEnabled;
          if (mediaType === 'audio') return settings.micEnabled;
          return settings.cameraEnabled || settings.micEnabled;
        }
        return true; // Auto-allow other standard queries (like background sync)
      }
      return false;
    });

    // Screen Sharing / Display Media Request Handler (PipeWire / X11)
    accountSession.setDisplayMediaRequestHandler((request, callback) => {
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

  // Load all enabled extensions for this account's session
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

  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      partition: account.partition,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true, // Memory & CPU optimization
      sandbox: true,
      webSecurity: true,
    },
  });

  view.webContents.setUserAgent(DEFAULT_USER_AGENT);
  view.webContents.loadURL('https://web.whatsapp.com');

  // Register zoom shortcuts
  registerZoomShortcuts(view.webContents);

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
    } catch (e) {
      shell.openExternal(url).catch((err) => console.error('Failed to open external link:', err));
      return { action: 'deny' };
    }
    return { action: 'allow' };
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

  // Also setup a light interval to catch fast scans / login actions
  const intervalId = setInterval(() => {
    if (view.webContents.isDestroyed() || account.loggedIn) {
      clearInterval(intervalId);
      return;
    }
    checkLoginStatus();
  }, 2500);

  return view;
}

let resizeTimeout: NodeJS.Timeout | null = null;

function updateActiveViewBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (resizeTimeout) {
    clearTimeout(resizeTimeout);
  }

  resizeTimeout = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    const [width, height] = mainWindow.getContentSize();
    const activeView = accountViews.get(activeAccountId);

    if (activeView) {
      const viewWidth = settingsOpen ? Math.max(0, width - DRAWER_WIDTH) : width;
      activeView.setBounds({
        x: 0,
        y: TITLEBAR_HEIGHT,
        width: Math.max(0, viewWidth),
        height: Math.max(0, height - TITLEBAR_HEIGHT),
      });
    }
    resizeTimeout = null;
  }, 50); // 50ms debounce to prevent sizing race conditions
}

async function switchActiveAccount(newAccountId: string) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const currentView = accountViews.get(activeAccountId);
  if (currentView) {
    mainWindow.contentView.removeChildView(currentView);
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
    updateActiveViewBounds();

    // Inject Custom CSS theme if applicable
    injectCustomCssForView(newAccountId, targetView.webContents);

    // Sync zoom level for the newly selected account view
    const zoomPercent = Math.round(targetView.webContents.getZoomFactor() * 100);
    mainWindow.webContents.send('zoom:changed', zoomPercent);
  }

  mainWindow.webContents.send('account:list-changed', accounts, activeAccountId);
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

  // Forward renderer console logs to main process console for debugging
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer Console] [Level ${level}] ${message} (at ${sourceId}:${line})`);
  });

  mainWindow.once('ready-to-show', async () => {
    console.log('Main window ready-to-show, activeAccountId:', activeAccountId);
    mainWindow?.show();
    // Initialize initial active view
    await switchActiveAccount(activeAccountId);

    // Preload remaining accounts in the background if configured
    if (globalSettings.loadAllOnLaunch) {
      console.log('Preloading all accounts in the background...');
      for (const account of accounts) {
        if (account.id !== activeAccountId && !accountViews.has(account.id)) {
          createAccountView(account).then((view) => {
            accountViews.set(account.id, view);
            console.log(`Preloaded account: ${account.name} (${account.id})`);
          }).catch((err) => {
            console.error(`Failed to preload account ${account.name}:`, err);
          });
        }
      }
    }
  });

  // Register zoom shortcuts on main window as well
  registerZoomShortcuts(mainWindow.webContents);

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
    // Minimize to system tray on window close
    if (mainWindow && !isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  // Simple clean SVG icon for tray
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#00a884"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;
  const icon = nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'));

  tray = new Tray(icon);
  tray.setToolTip('WhatsApp Linux');

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
        fs.rmSync(ext.path, { recursive: true, force: true });
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

  if (activeAccountId === id) {
    await switchActiveAccount(accounts[0].id);
  } else {
    mainWindow?.webContents.send('account:list-changed', accounts, activeAccountId);
  }
  return true;
}

// Register IPC handlers
ipcMain.on('window:minimize', () => {
  console.log('IPC Received: window:minimize');
  mainWindow?.minimize();
});
ipcMain.on('window:maximize', () => {
  console.log('IPC Received: window:maximize');
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on('window:close', () => {
  console.log('IPC Received: window:close');
  if (mainWindow) {
    mainWindow.hide();
  }
});
ipcMain.handle('window:isMaximized', () => {
  console.log('IPC Handle: window:isMaximized');
  return mainWindow?.isMaximized() ?? false;
});

let settingsOpen = false;
const DRAWER_WIDTH = 450;

ipcMain.on('settings:toggle', (_event, isOpen: boolean) => {
  console.log('IPC Received: settings:toggle, isOpen:', isOpen);
  settingsOpen = isOpen;
  updateActiveViewBounds();
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
      fs.rmSync(targetDir, { recursive: true, force: true });
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
        fs.rmSync(targetDir, { recursive: true, force: true });
      } catch (_) {}
    }
    dialog.showErrorBox('Extension Import Error', err.message || 'An unknown error occurred during import.');
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
    fs.rmSync(ext.path, { recursive: true, force: true });
  } catch (err) {
    console.error(`Failed to delete extension files at ${ext.path}:`, err);
  }

  // Remove metadata
  account.extensions.splice(extIndex, 1);
  saveAccounts();

  mainWindow?.webContents.send('account:list-changed', accounts, activeAccountId);
  return true;
});

app.whenReady().then(() => {
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

function registerZoomShortcuts(contents: Electron.WebContents) {
  contents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      const isControl = process.platform === 'darwin' ? input.meta : input.control;
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

async function calculatePathSize(itemPath: string): Promise<number> {
  try {
    const stats = await fs.promises.stat(itemPath);
    if (stats.isFile()) {
      return stats.size;
    }
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
  const partitionDirName = getPartitionDirName(partition);
  const partitionDir = path.join(app.getPath('userData'), 'Partitions', partitionDirName);

  const cacheDirs = ['Cache', 'Code Cache', 'GPUCache', 'DawnWebGPUCache', 'DawnGraphiteCache'];
  const localStorageDirs = ['Local Storage', 'Session Storage'];
  const indexedDbDirs = ['IndexedDB'];
  const cookiesFiles = ['Cookies', 'Cookies-journal'];

  const cachePromises = cacheDirs.map((dir) => calculatePathSize(path.join(partitionDir, dir)));
  const localStoragePromises = localStorageDirs.map((dir) => calculatePathSize(path.join(partitionDir, dir)));
  const indexedDbPromises = indexedDbDirs.map((dir) => calculatePathSize(path.join(partitionDir, dir)));
  const cookiesPromises = cookiesFiles.map((file) => calculatePathSize(path.join(partitionDir, file)));

  const [cacheSizes, localStorageSizes, indexedDbSizes, cookiesSizes] = await Promise.all([
    Promise.all(cachePromises),
    Promise.all(localStoragePromises),
    Promise.all(indexedDbPromises),
    Promise.all(cookiesPromises),
  ]);

  return {
    cache: cacheSizes.reduce((a, b) => a + b, 0),
    localStorage: localStorageSizes.reduce((a, b) => a + b, 0),
    indexedDb: indexedDbSizes.reduce((a, b) => a + b, 0),
    cookies: cookiesSizes.reduce((a, b) => a + b, 0),
  };
}

interface HistoricalNotification {
  id: string;
  accountId: string;
  accountName: string;
  title: string;
  body: string;
  icon: string;
  timestamp: number;
}

const NOTIFICATION_HISTORY_FILE = path.join(app.getPath('userData'), 'notification_history.json');
const MAX_NOTIFICATIONS = 100;

function loadNotificationHistory(): HistoricalNotification[] {
  try {
    if (fs.existsSync(NOTIFICATION_HISTORY_FILE)) {
      const data = fs.readFileSync(NOTIFICATION_HISTORY_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to load notification history:', error);
  }
  return [];
}

function saveNotificationHistory(history: HistoricalNotification[]) {
  try {
    fs.writeFileSync(NOTIFICATION_HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to save notification history:', error);
  }
}

function logNotificationToHistory(notif: HistoricalNotification) {
  const history = loadNotificationHistory();
  history.unshift(notif);
  if (history.length > MAX_NOTIFICATIONS) {
    history.splice(MAX_NOTIFICATIONS);
  }
  saveNotificationHistory(history);
  mainWindow?.webContents.send('notification:history-changed', history);
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
      await accountSession.clearStorageData({
        storages: ['indexdb', 'filesystem', 'websql'],
      });
      console.log(`Media data cleared successfully for account: ${accountId}`);
    }

    // Reload the view if it exists to refresh database connections
    const view = accountViews.get(accountId);
    if (view) {
      view.webContents.reload();
    }
    return true;
  } catch (error) {
    console.error(`Failed to clear storage for account ${accountId} (type: ${type}):`, error);
    return false;
  }
});

// IPC Handlers for Settings Management
ipcMain.handle('settings:get-global', () => globalSettings);

ipcMain.handle('settings:save-global', (_event, newSettings: GlobalSettings) => {
  globalSettings = newSettings;
  saveSettings(globalSettings);
  mainWindow?.webContents.send('settings:global-changed', globalSettings);
  return true;
});

ipcMain.handle('account:update-settings', (_event, accountId: string, settings: Account['settings']) => {
  const account = accounts.find((a) => a.id === accountId);
  if (account) {
    account.settings = settings;
    saveAccounts();

    // Reload active view to apply permissions changes immediately
    const view = accountViews.get(accountId);
    if (view) {
      view.webContents.reload();
    }
    
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
      account.settings = { cameraEnabled: true, micEnabled: true, notificationsEnabled: true };
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

// DevTools Toggling IPC handler
ipcMain.on('devtools:toggle', () => {
  console.log('IPC Received: devtools:toggle');
  const activeContents = getActiveWebContents();
  if (activeContents) {
    if (activeContents.isDevToolsOpened()) {
      activeContents.closeDevTools();
    } else {
      activeContents.openDevTools({ mode: 'detach' });
    }
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
  const brandedTitle = `[${senderAccount.name}] ${data.title}`;

  // 2. Save to local log history
  logNotificationToHistory({
    id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    accountId: senderAccount.id,
    accountName: senderAccount.name,
    title: data.title,
    body: data.body,
    icon: data.icon, // Base64 representation
    timestamp: Date.now(),
  });

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
  return loadNotificationHistory();
});

ipcMain.handle('notification:clear-history', () => {
  saveNotificationHistory([]);
  mainWindow?.webContents.send('notification:history-changed', []);
  return true;
});

