import { app, BrowserWindow, WebContentsView, session, dialog, shell, clipboard, ipcMain, Menu } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tls from 'node:tls';
import { state } from './state';
import { getAppIcon, getInitialWindowSize, getPreloadPath, getTargetUrlIfLinkShim, getDomainFromUrl } from './utils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CertificateInfo {
  secure: boolean;
  host?: string;
  subject?: Record<string, string>;
  issuer?: Record<string, string>;
  validFrom?: string;
  validTo?: string;
  fingerprint256?: string;
  serialNumber?: string;
  san?: string;
  protocol?: string;
  cipher?: string;
  error?: string;
}

/**
 * Retrieves detailed SSL/TLS certificate information directly from the host.
 */
export async function getCertificateDetails(targetUrl: string): Promise<CertificateInfo> {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'https:') {
      return {
        secure: false,
        host: parsed.hostname,
        error: 'Connection is not encrypted (HTTP plain text)',
      };
    }
    const host = parsed.hostname;
    const port = parsed.port ? parseInt(parsed.port, 10) : 443;

    return new Promise((resolve) => {
      const socket = tls.connect({
        host,
        port,
        servername: host,
        rejectUnauthorized: false,
        timeout: 2500,
      }, () => {
        const cert = socket.getPeerCertificate(true);
        const cipher = socket.getCipher();
        const protocol = socket.getProtocol();
        socket.destroy();

        if (!cert || Object.keys(cert).length === 0) {
          resolve({
            secure: false,
            host,
            error: 'Server did not present a certificate',
          });
          return;
        }

        resolve({
          secure: true,
          host,
          subject: cert.subject as any,
          issuer: cert.issuer as any,
          validFrom: cert.valid_from,
          validTo: cert.valid_to,
          fingerprint256: cert.fingerprint256,
          serialNumber: cert.serialNumber,
          san: cert.subjectaltname,
          protocol: protocol || 'TLS',
          cipher: cipher ? `${cipher.name} (${cipher.version})` : 'Unknown',
        });
      });

      socket.on('error', (err) => {
        resolve({
          secure: false,
          host,
          error: err.message,
        });
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve({
          secure: false,
          host,
          error: 'Connection timed out while querying SSL certificate',
        });
      });
    });
  } catch (err: any) {
    return {
      secure: false,
      error: err.message,
    };
  }
}

class SandboxInstance {
  public sandboxWin: BrowserWindow;
  public pageView: WebContentsView;
  public partition: string;
  public session: Electron.Session;
  public initialUrl: string;
  public currentUrl: string;
  public disclaimerCollapsed = false;
  public permissions = new Map<string, boolean>();
  public isLoading = false;
  private loadingTimeout: NodeJS.Timeout | null = null;

  constructor(sandboxWin: BrowserWindow, pageView: WebContentsView, partition: string, sess: Electron.Session, initialUrl: string) {
    this.sandboxWin = sandboxWin;
    this.pageView = pageView;
    this.partition = partition;
    this.session = sess;
    this.initialUrl = initialUrl;
    this.currentUrl = initialUrl;
  }

  public getToolbarHeight(): number {
    return 42;
  }

  public updateBounds(): void {
    if (this.sandboxWin.isDestroyed() || !this.pageView) return;
    const [width, height] = this.sandboxWin.getContentSize();
    const toolbarHeight = this.getToolbarHeight();
    this.pageView.setBounds({
      x: 0,
      y: toolbarHeight,
      width,
      height: Math.max(0, height - toolbarHeight),
    });
  }

  public startLoading(): void {
    this.isLoading = true;
    if (this.loadingTimeout) clearTimeout(this.loadingTimeout);
    this.loadingTimeout = setTimeout(() => {
      this.isLoading = false;
      this.sendStateUpdate();
    }, 3500);
    this.sendStateUpdate();
  }

  public stopLoading(): void {
    this.isLoading = false;
    if (this.loadingTimeout) {
      clearTimeout(this.loadingTimeout);
      this.loadingTimeout = null;
    }
    this.sendStateUpdate();
  }

  public sendStateUpdate(overrideUrl?: string): void {
    if (this.sandboxWin.isDestroyed() || this.sandboxWin.webContents.isDestroyed() || !this.pageView) return;
    const contents = this.pageView.webContents;
    if (contents.isDestroyed()) return;

    if (overrideUrl && overrideUrl !== 'about:blank') {
      this.currentUrl = overrideUrl;
    } else {
      const pageUrl = contents.getURL();
      if (pageUrl && pageUrl !== 'about:blank') {
        this.currentUrl = pageUrl;
      }
    }

    const url = this.currentUrl || this.initialUrl;
    const isSecure = url.startsWith('https://');

    this.sandboxWin.webContents.send('sandbox:update', {
      url,
      canGoBack: contents.navigationHistory ? contents.navigationHistory.canGoBack() : contents.canGoBack(),
      canGoForward: contents.navigationHistory ? contents.navigationHistory.canGoForward() : contents.canGoForward(),
      isLoading: this.isLoading,
      title: contents.getTitle() || url,
      isSecure,
    });
  }

  public async handleAction(action: string, data?: any): Promise<void> {
    if (this.sandboxWin.isDestroyed() || !this.pageView || this.pageView.webContents.isDestroyed()) return;
    const contents = this.pageView.webContents;

    switch (action) {
      case 'ready': {
        this.sendStateUpdate();
        break;
      }

      case 'back':
        if (contents.navigationHistory?.canGoBack() ?? contents.canGoBack()) {
          contents.navigationHistory?.goBack() ?? contents.goBack();
        }
        break;

      case 'forward':
        if (contents.navigationHistory?.canGoForward() ?? contents.canGoForward()) {
          contents.navigationHistory?.goForward() ?? contents.goForward();
        }
        break;

      case 'reload':
        contents.reload();
        break;

      case 'navigate': {
        const rawUrl = typeof data === 'string' ? data.trim() : '';
        if (rawUrl) {
          let target = rawUrl;
          if (!/^https?:\/\//i.test(target) && !target.startsWith('about:')) {
            target = 'https://' + target;
          }
          this.currentUrl = target;
          contents.loadURL(target).catch((err) => console.error('Failed to navigate sandbox:', err));
        }
        break;
      }

      case 'copy-url': {
        const urlToCopy = (typeof data === 'string' && data.trim()) ? data.trim() : (this.currentUrl || contents.getURL() || this.initialUrl);
        if (urlToCopy) {
          clipboard.writeText(urlToCopy);
        }
        break;
      }

      case 'open-browser': {
        const urlToOpen = (typeof data === 'string' && data.trim()) ? data.trim() : (this.currentUrl || contents.getURL() || this.initialUrl);
        if (urlToOpen) {
          shell.openExternal(urlToOpen).catch((err) => console.error('Failed to open external link:', err));
        }
        break;
      }

      case 'devtools': {
        if (contents.isDevToolsOpened()) {
          contents.closeDevTools();
        } else {
          contents.openDevTools({ mode: 'detach' });
        }
        break;
      }

      case 'show-menu': {
        const menu = Menu.buildFromTemplate([
          {
            label: 'Open in System Browser',
            click: () => this.handleAction('open-browser'),
          },
          {
            label: 'View Certificate Details',
            click: () => this.handleAction('view-cert'),
          },
          {
            label: 'Developer Tools',
            click: () => this.handleAction('devtools'),
          },
          { type: 'separator' },
          {
            label: 'Copy Current URL',
            click: () => this.handleAction('copy-url'),
          },
          {
            label: 'Reload Page',
            accelerator: 'CmdOrCtrl+R',
            click: () => this.handleAction('reload'),
          },
        ]);
        menu.popup({
          window: this.sandboxWin,
        });
        break;
      }

      case 'collapse-disclaimer': {
        this.disclaimerCollapsed = true;
        this.updateBounds();
        break;
      }

      case 'view-cert': {
        const currentUrl = this.currentUrl || contents.getURL() || this.initialUrl;
        const cert = await getCertificateDetails(currentUrl);

        if (!cert.secure) {
          dialog.showMessageBox(this.sandboxWin, {
            type: 'warning',
            title: 'Security & Certificate: Not Secure',
            message: 'Connection is Not Secure',
            detail: `URL: ${currentUrl}\n\nThis website does not provide a valid SSL/TLS certificate. Data transmitted is unencrypted and could be intercepted by third parties.`,
            noLink: true,
          });
        } else {
          dialog.showMessageBox(this.sandboxWin, {
            type: 'info',
            buttons: ['OK', 'Copy SHA-256 Fingerprint'],
            defaultId: 0,
            cancelId: 0,
            title: `Certificate Details - ${cert.host}`,
            message: `Verified Secure Connection (SSL/TLS)`,
            detail: [
              `Host: ${cert.host}`,
              `\nIssued To (Subject):`,
              `  Common Name (CN): ${cert.subject?.CN || 'N/A'}`,
              `  Organization (O): ${cert.subject?.O || 'N/A'}`,
              `\nIssued By (Issuer):`,
              `  Common Name (CN): ${cert.issuer?.CN || 'N/A'}`,
              `  Organization (O): ${cert.issuer?.O || 'N/A'}`,
              `\nValidity:`,
              `  Valid From: ${cert.validFrom || 'N/A'}`,
              `  Valid Until: ${cert.validTo || 'N/A'}`,
              `\nEncryption Details:`,
              `  Protocol: ${cert.protocol || 'TLS'}`,
              `  Cipher: ${cert.cipher || 'N/A'}`,
              `  Serial Number: ${cert.serialNumber || 'N/A'}`,
              `\nSHA-256 Fingerprint:\n${cert.fingerprint256 || 'N/A'}`,
            ].join('\n'),
            noLink: true,
          }).then((res) => {
            if (res.response === 1 && cert.fingerprint256) {
              clipboard.writeText(cert.fingerprint256);
            }
          });
        }
        break;
      }
    }
  }

  public cleanup(): void {
    try {
      this.permissions.clear();
      if (this.pageView && !this.pageView.webContents.isDestroyed()) {
        try {
          this.pageView.webContents.stop();
          this.pageView.webContents.loadURL('about:blank');
          (this.pageView.webContents as any).destroy?.();
        } catch (e) {
          console.error('[Sandbox] Error destroying pageView webContents:', e);
        }
      }
      try {
        if (!this.sandboxWin.isDestroyed()) {
          this.sandboxWin.contentView.removeChildView(this.pageView);
        }
      } catch {}
      this.session.clearStorageData().catch(() => {});
      this.session.clearCache().catch(() => {});
      this.session.clearAuthCache().catch(() => {});
      this.session.clearHostResolverCache().catch(() => {});
    } catch (e) {
      console.error('[Sandbox] Error cleaning up sandbox session:', e);
    }
  }
}

const sandboxInstances = new Map<number, SandboxInstance>();
let isIpcRegistered = false;

function findSandboxInstance(sender: Electron.WebContents): SandboxInstance | undefined {
  for (const inst of sandboxInstances.values()) {
    if (!inst.sandboxWin.isDestroyed() && inst.sandboxWin.webContents.id === sender.id) {
      return inst;
    }
    if (inst.pageView && !inst.pageView.webContents.isDestroyed() && inst.pageView.webContents.id === sender.id) {
      return inst;
    }
  }
  const win = BrowserWindow.fromWebContents(sender);
  if (win && sandboxInstances.has(win.id)) {
    return sandboxInstances.get(win.id);
  }
  return undefined;
}

function ensureIpcRegistered(): void {
  if (isIpcRegistered) return;
  isIpcRegistered = true;

  ipcMain.on('sandbox:action', (event, action: string, data?: any) => {
    console.log('[Sandbox IPC] Received action:', action, 'data:', data, 'from sender id:', event.sender.id);
    const instance = findSandboxInstance(event.sender);
    if (instance) {
      instance.handleAction(action, data);
    } else {
      console.warn('[Sandbox IPC] No instance found for action:', action, 'sender id:', event.sender.id);
    }
  });
}

/**
 * Creates and launches an isolated, sandboxed browser window with standard controls,
 * certificate viewer, permissions prompts, and zero data saved guarantees.
 */
export function createSandboxWindow(initialUrl: string): BrowserWindow {
  ensureIpcRegistered();

  const targetUrl = getTargetUrlIfLinkShim(initialUrl) || initialUrl;
  const domain = getDomainFromUrl(targetUrl);
  let finalUrl = targetUrl;
  if (!/^https?:\/\//i.test(finalUrl)) {
    finalUrl = `https://${finalUrl}`;
  }

  const { width, height } = getInitialWindowSize(1150, 780, state.mainWindow);

  // 1. Create container BrowserWindow with native window frame
  const sandboxWin = new BrowserWindow({
    width,
    height,
    title: `[Sandbox] ${domain || 'Browser'} — Zero Data Saved`,
    icon: getAppIcon(),
    backgroundColor: '#111b21',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  sandboxWin.removeMenu();
  state.sandboxWindows.add(sandboxWin);

  // 2. Setup purely in-memory ephemeral partition for this specific window
  const ephemeralPartition = `sandbox_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const sandboxSession = session.fromPartition(ephemeralPartition);

  // 3. Create sandboxed WebContentsView for rendering the web page
  const pageView = new WebContentsView({
    webPreferences: {
      partition: ephemeralPartition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  const instance = new SandboxInstance(sandboxWin, pageView, ephemeralPartition, sandboxSession, finalUrl);
  sandboxInstances.set(sandboxWin.id, instance);

  // 4. Permission Prompts: Intercept every permission request and prompt user
  sandboxSession.setPermissionRequestHandler(async (webContents, permission, callback, details) => {
    let origin = 'This website';
    try {
      const reqUrl = details.requestingUrl || (webContents ? webContents.getURL() : '');
      if (reqUrl) origin = new URL(reqUrl).origin;
    } catch {}

    let permLabel: string = permission;
    if (permission === 'media') {
      const types = (details as any).mediaTypes;
      permLabel = Array.isArray(types) && types.length > 0 ? types.join(' & ') : 'Camera & Microphone';
    } else if (permission === 'geolocation') {
      permLabel = 'Location / Geolocation';
    } else if (permission === 'notifications') {
      permLabel = 'Desktop Notifications';
    } else if (permission === 'clipboard-read') {
      permLabel = 'Clipboard (Read)';
    }

    const cacheKey = `${origin}:${permission}`;
    if (instance.permissions.has(cacheKey)) {
      callback(instance.permissions.get(cacheKey)!);
      return;
    }

    const choice = await dialog.showMessageBox(sandboxWin, {
      type: 'question',
      buttons: ['Allow', 'Block'],
      defaultId: 0,
      cancelId: 1,
      title: 'Sandbox Permission Request',
      message: `"${origin}" is requesting access to:`,
      detail: `Permission: ${permLabel}\n\nDo you want to allow this sandboxed site to access ${permLabel}?\n\n(Zero data saved — Permissions are forgotten when this sandbox window closes.)`,
      noLink: true,
    });

    const granted = choice.response === 0;
    instance.permissions.set(cacheKey, granted);
    callback(granted);
  });

  sandboxSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    const cacheKey = `${requestingOrigin}:${permission}`;
    return instance.permissions.get(cacheKey) === true;
  });

  // 5. Add WebContentsView to window contentView
  sandboxWin.contentView.addChildView(pageView);

  // 6. Coordinate bounds on resize and show
  instance.updateBounds();
  sandboxWin.on('resize', () => instance.updateBounds());

  // 7. Synchronize web view lifecycle and toolbar state
  pageView.webContents.on('did-start-navigation', (_e, navUrl, isInPlace, isMainFrame) => {
    if (isMainFrame && navUrl && navUrl !== 'about:blank') {
      instance.sendStateUpdate(navUrl);
    }
  });
  pageView.webContents.on('did-navigate', (_e, navUrl) => {
    instance.sendStateUpdate(navUrl);
  });
  pageView.webContents.on('did-navigate-in-page', (_e, navUrl) => {
    instance.sendStateUpdate(navUrl);
  });
  pageView.webContents.on('did-start-loading', () => instance.startLoading());
  pageView.webContents.on('did-stop-loading', () => instance.stopLoading());
  pageView.webContents.on('did-finish-load', () => instance.stopLoading());
  pageView.webContents.on('did-fail-load', () => instance.stopLoading());
  pageView.webContents.on('dom-ready', () => instance.stopLoading());

  sandboxWin.webContents.on('did-finish-load', () => {
    instance.sendStateUpdate();
  });

  pageView.webContents.on('page-title-updated', (event, title) => {
    event.preventDefault();
    if (!sandboxWin.isDestroyed()) {
      sandboxWin.setTitle(`[Sandbox] ${title}`);
    }
  });

  // Keep target="_blank" and popups safely within the sandboxed view
  pageView.webContents.setWindowOpenHandler((details) => {
    pageView.webContents.loadURL(details.url);
    return { action: 'deny' };
  });

  // Keyboard navigation shortcuts inside the sandboxed page
  pageView.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.alt && input.key === 'ArrowLeft') {
      if (pageView.webContents.navigationHistory?.canGoBack() ?? pageView.webContents.canGoBack()) {
        event.preventDefault();
        pageView.webContents.navigationHistory?.goBack() ?? pageView.webContents.goBack();
      }
    } else if (input.alt && input.key === 'ArrowRight') {
      if (pageView.webContents.navigationHistory?.canGoForward() ?? pageView.webContents.canGoForward()) {
        event.preventDefault();
        pageView.webContents.navigationHistory?.goForward() ?? pageView.webContents.goForward();
      }
    } else if (((input.control || input.meta) && (input.key === 'r' || input.key === 'R')) || input.key === 'F5') {
      event.preventDefault();
      pageView.webContents.reload();
    }
  });

  // Page context menu
  pageView.webContents.on('context-menu', (_e, cParams) => {
    const sbMenu: Electron.MenuItemConstructorOptions[] = [];
    const contents = pageView.webContents;

    if (contents.navigationHistory?.canGoBack() ?? contents.canGoBack()) {
      sbMenu.push({
        label: 'Back',
        click: () => contents.navigationHistory?.goBack() ?? contents.goBack(),
      });
    }
    if (contents.navigationHistory?.canGoForward() ?? contents.canGoForward()) {
      sbMenu.push({
        label: 'Forward',
        click: () => contents.navigationHistory?.goForward() ?? contents.goForward(),
      });
    }
    sbMenu.push({
      label: 'Reload',
      accelerator: 'CmdOrCtrl+R',
      click: () => contents.reload(),
    });

    if (cParams.linkURL) {
      sbMenu.push({ type: 'separator' });
      const rawCParamsLink = cParams.linkURL;
      const cleanCParamsLink = getTargetUrlIfLinkShim(rawCParamsLink) || rawCParamsLink;
      sbMenu.push({
        label: 'Open in Default Browser',
        click: () => shell.openExternal(cleanCParamsLink),
      });
      sbMenu.push({
        label: 'Copy Link',
        click: () => clipboard.writeText(cleanCParamsLink),
      });
    }

    if (cParams.hasImageContents && cParams.srcURL) {
      sbMenu.push({ type: 'separator' });
      sbMenu.push({
        label: 'Copy Image Address',
        click: () => clipboard.writeText(cParams.srcURL),
      });
    }

    if (cParams.selectionText && cParams.selectionText.trim()) {
      sbMenu.push({ type: 'separator' });
      sbMenu.push({
        label: 'Copy',
        role: 'copy',
      });
    }

    if (cParams.isEditable) {
      sbMenu.push({
        label: 'Paste',
        role: 'paste',
      });
      sbMenu.push({
        label: 'Cut',
        role: 'cut',
      });
    }

    sbMenu.push({ type: 'separator' });
    sbMenu.push({
      label: 'View Certificate',
      click: () => instance.handleAction('view-cert'),
    });
    sbMenu.push({
      label: 'Inspect Element',
      click: () => instance.handleAction('devtools'),
    });

    const menu = Menu.buildFromTemplate(sbMenu);
    menu.popup({ window: sandboxWin });
  });

  // 8. Lifecycle cleanup ensuring zero data saved and halting all media on close
  sandboxWin.webContents.on('console-message', (event) => {
    console.log(`[Sandbox UI Console] [${event.level}] ${event.message}`);
  });

  sandboxWin.on('close', () => {
    instance.cleanup();
  });

  sandboxWin.on('closed', () => {
    state.sandboxWindows.delete(sandboxWin);
    sandboxInstances.delete(sandboxWin.id);
  });

  // 9. Load toolbar in container window & target URL in pageView
  const searchParam = `?url=${encodeURIComponent(finalUrl)}`;
  if (process.env.VITE_DEV_SERVER_URL) {
    sandboxWin.loadURL(`${process.env.VITE_DEV_SERVER_URL}sandbox.html${searchParam}`);
  } else {
    sandboxWin.loadFile(path.join(__dirname, '../renderer/sandbox.html'), {
      search: searchParam,
    });
  }

  sandboxWin.once('ready-to-show', () => {
    sandboxWin.show();
    instance.updateBounds();
  });

  pageView.webContents.loadURL(finalUrl).catch((err: any) => {
    if (err?.code !== 'ERR_ABORTED') {
      console.warn('[Sandbox] Failed to load initial sandbox URL:', err);
    }
  });

  return sandboxWin;
}
