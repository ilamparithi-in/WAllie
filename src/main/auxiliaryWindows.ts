import { BrowserWindow, nativeTheme } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { state } from './state';
import { getAppIcon, getPreloadPath, getInitialWindowSize } from './utils';
import { registerContextMenu } from './views';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface AuxiliaryWindowOptions {
  id: string;
  title: string;
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  resizable?: boolean;
  params?: Record<string, string>;
  onNavigate?: (win: BrowserWindow, params: Record<string, string>) => void;
}

/**
 * Common window creator for all auxiliary and modal dialog windows (Settings, Add Account,
 * Legal Disclaimer, Protocol URL Prompt, Avatar Zoom).
 *
 * Windows are created as non-modal windows so the main window remains interactable always.
 */
export function openAuxiliaryWindow(options: AuxiliaryWindowOptions): BrowserWindow {
  const existingWin = state.auxiliaryWindows.get(options.id);
  if (existingWin && !existingWin.isDestroyed()) {
    if (options.params && options.onNavigate) {
      options.onNavigate(existingWin, options.params);
    }
    existingWin.show();
    existingWin.focus();
    return existingWin;
  }

  const { width: initW, height: initH } = getInitialWindowSize(
    options.width,
    options.height,
    state.mainWindow
  );

  const parentWin = state.mainWindow && !state.mainWindow.isDestroyed() ? state.mainWindow : undefined;

  const win = new BrowserWindow({
    parent: parentWin,
    modal: false, // Ensure main window remains interactable always
    width: Math.min(initW, options.maxWidth || 2000),
    height: Math.min(initH, options.maxHeight || 2000),
    minWidth: options.minWidth || 360,
    minHeight: options.minHeight || 360,
    maxWidth: options.maxWidth,
    maxHeight: options.maxHeight,
    resizable: options.resizable !== false,
    title: options.title,
    icon: getAppIcon(),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#111b21' : '#ffffff',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    } as any,
  });

  win.on('page-title-updated', (e) => {
    e.preventDefault();
  });

  win.removeMenu();
  registerContextMenu(win.webContents);

  const queryParams = new URLSearchParams();
  queryParams.set('window', options.id);
  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined && value !== null) {
        queryParams.set(key, String(value));
      }
    }
  }

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(`${process.env.VITE_DEV_SERVER_URL}?${queryParams.toString()}`);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'), {
      search: queryParams.toString(),
    });
  }

  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) {
      win.show();
      win.focus();
    }
  });

  win.on('closed', () => {
    state.auxiliaryWindows.delete(options.id);
    if (options.id === 'settings') {
      state.settingsWindow = null;
      if (state.mainWindow && !state.mainWindow.isDestroyed()) {
        state.mainWindow.webContents.send('settings:detached-closed');
      }
    }
  });

  state.auxiliaryWindows.set(options.id, win);
  if (options.id === 'settings') {
    state.settingsWindow = win;
  }

  return win;
}

export function closeAuxiliaryWindow(id: string): void {
  const win = state.auxiliaryWindows.get(id);
  if (win && !win.isDestroyed()) {
    win.close();
  }
  state.auxiliaryWindows.delete(id);
  if (id === 'settings') {
    state.settingsWindow = null;
  }
}

/**
 * Open Settings in its own dedicated window using the common window creator.
 */
export function openSettingsWindow(page?: string, accountId?: string): BrowserWindow {
  if (state.settingsOpen) {
    state.mainWindow?.webContents.send('settings:close-drawer');
  }

  return openAuxiliaryWindow({
    id: 'settings',
    title: 'Configure WAllie',
    width: 540,
    height: 720,
    minWidth: 420,
    minHeight: 480,
    params: {
      ...(page ? { page } : {}),
      ...(accountId ? { accountId } : {}),
    },
    onNavigate: (w, params) => {
      if (params.page) {
        w.webContents.send('settings:navigate', { page: params.page, accountId: params.accountId });
      }
    },
  });
}

/**
 * Open Add Account in its own dedicated window using the common window creator.
 */
export function openAddAccountWindow(): BrowserWindow {
  return openAuxiliaryWindow({
    id: 'add-account',
    title: 'Add WhatsApp Account',
    width: 480,
    height: 580,
    minWidth: 420,
    minHeight: 480,
    resizable: true,
  });
}

/**
 * Open Legal Disclaimer in its own dedicated window using the common window creator.
 */
export function openDisclaimerWindow(firstLaunch = false): BrowserWindow {
  return openAuxiliaryWindow({
    id: 'disclaimer',
    title: 'Legal Disclaimer - WAllie',
    width: 640,
    height: 700,
    minWidth: 480,
    minHeight: 520,
    params: {
      firstLaunch: firstLaunch ? 'true' : 'false',
    },
  });
}

/**
 * Open Protocol URL Link Prompt in its own dedicated window using the common window creator.
 */
export function openProtocolPromptWindow(url: string): BrowserWindow {
  return openAuxiliaryWindow({
    id: 'protocol-prompt',
    title: 'Open WhatsApp Link',
    width: 560,
    height: 640,
    minWidth: 480,
    minHeight: 500,
    params: {
      url,
    },
    onNavigate: (w, params) => {
      if (params.url) {
        w.webContents.send('protocol:pending-url', params.url);
      }
    },
  });
}

/**
 * Open Avatar Zoom display in its own dedicated window using the common window creator.
 */
export function openAvatarZoomWindow(url: string, title?: string): BrowserWindow {
  return openAuxiliaryWindow({
    id: 'avatar-zoom',
    title: title || 'Display Picture',
    width: 600,
    height: 600,
    minWidth: 400,
    minHeight: 400,
    params: {
      url,
      ...(title ? { title } : {}),
    },
  });
}
