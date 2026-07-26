import { app, BrowserWindow, WebContentsView, ipcMain, Tray, Menu, nativeImage, session } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// Memory & CPU Optimization flags
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

const TITLEBAR_HEIGHT = 28;
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';

interface Account {
  id: string;
  name: string;
  partition: string;
  unreadCount: number;
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// Accounts state
let accounts: Account[] = [
  { id: 'acc_default', name: 'Primary Account', partition: 'persist:whatsapp_primary', unreadCount: 0 },
];
let activeAccountId = 'acc_default';

// Map of account ID to WebContentsView
const accountViews = new Map<string, WebContentsView>();

function createAccountView(account: Account): WebContentsView {
  const accountSession = session.fromPartition(account.partition);

  // Set standard User-Agent on session headers to ensure WhatsApp Web loads smoothly
  accountSession.setUserAgent(DEFAULT_USER_AGENT);

  const view = new WebContentsView({
    webPreferences: {
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

  // Handle title & page badge updates for unread notifications count
  view.webContents.on('page-title-updated', (_event, title) => {
    const match = title.match(/\((\d+)\)/);
    const count = match ? parseInt(match[1], 10) : 0;
    account.unreadCount = count;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('account:unread-changed', account.id, count);
    }
  });

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
      activeView.setBounds({
        x: 0,
        y: TITLEBAR_HEIGHT,
        width: Math.max(0, width),
        height: Math.max(0, height - TITLEBAR_HEIGHT),
      });
    }
    resizeTimeout = null;
  }, 50); // 50ms debounce to prevent sizing race conditions
}

function switchActiveAccount(newAccountId: string) {
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
      targetView = createAccountView(acc);
      accountViews.set(newAccountId, targetView);
    }
  }

  if (targetView) {
    mainWindow.contentView.addChildView(targetView);
    updateActiveViewBounds();

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

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Forward renderer console logs to main process console for debugging
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer Console] [Level ${level}] ${message} (at ${sourceId}:${line})`);
  });

  mainWindow.once('ready-to-show', () => {
    console.log('Main window ready-to-show, activeAccountId:', activeAccountId);
    mainWindow?.show();
    // Initialize initial active view
    switchActiveAccount(activeAccountId);
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

ipcMain.on('settings:toggle', (_event, isOpen: boolean) => {
  console.log('IPC Received: settings:toggle, isOpen:', isOpen);
  const activeView = accountViews.get(activeAccountId);
  if (activeView && mainWindow && !mainWindow.isDestroyed()) {
    if (isOpen) {
      mainWindow.contentView.removeChildView(activeView);
    } else {
      mainWindow.contentView.addChildView(activeView);
      updateActiveViewBounds();
    }
  }
});

ipcMain.handle('account:get-all', () => accounts);
ipcMain.handle('account:get-active-id', () => activeAccountId);
ipcMain.on('account:switch', (_event, id: string) => switchActiveAccount(id));

ipcMain.on('zoom:reset', () => {
  const activeContents = getActiveWebContents();
  if (activeContents) {
    resetZoom(activeContents);
  }
});

ipcMain.handle('account:add', (_event, customName?: string) => {
  const newIndex = accounts.length + 1;
  const newAccount: Account = {
    id: `acc_${Date.now()}`,
    name: customName || `Account ${newIndex}`,
    partition: `persist:whatsapp_acc_${Date.now()}`,
    unreadCount: 0,
  };
  accounts.push(newAccount);
  switchActiveAccount(newAccount.id);
  return newAccount;
});

ipcMain.handle('account:remove', (_event, id: string) => {
  if (accounts.length <= 1) return false; // Don't delete last account
  accounts = accounts.filter((a) => a.id !== id);
  const view = accountViews.get(id);
  if (view) {
    if (activeAccountId === id && mainWindow) {
      mainWindow.contentView.removeChildView(view);
    }
    accountViews.delete(id);
  }
  if (activeAccountId === id) {
    switchActiveAccount(accounts[0].id);
  }
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
