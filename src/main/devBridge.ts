import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { app, Notification, session } from 'electron';
import { state } from './state';
import { showAppToast } from './utils';
import { switchActiveAccount } from './window';

const DEFAULT_PORT = 3888;
const PORT = Number(process.env.WALLIE_BRIDGE_PORT) || DEFAULT_PORT;
const LOCK_FILE = process.env.WALLIE_BRIDGE_LOCKFILE || '/tmp/wallie-dev-bridge.json';

let server: http.Server | null = null;
let bridgeToken: string | null = null;

// Telemetry Buffers
export interface ConsoleLogEntry {
  accountId?: string;
  url?: string;
  level: string | number;
  levelName: string;
  message: string;
  line: number;
  source: string;
  timestamp: number;
}

export interface NetworkLogEntry {
  id: number;
  partition?: string;
  url: string;
  method: string;
  statusCode?: number;
  statusLine?: string;
  resourceType: string;
  fromCache?: boolean;
  error?: string;
  durationMs?: number;
  timestamp: number;
}

const MAX_LOGS = 500;
const consoleLogs: ConsoleLogEntry[] = [];
const networkLogs: NetworkLogEntry[] = [];
const monitoredSessions = new Set<Electron.Session>();
const monitoredWebContents = new Set<number>();

function removeLockFile() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch (err) {
    console.error('[DevBridge] Error cleaning up lockfile:', err);
  }
}

function announceDevBridge(port: number, token: string) {
  // 1. Loud Terminal Banner with ANSI formatting (Red Background / Yellow Text)
  const redBg = '\x1b[1;37;41m';
  const yellowText = '\x1b[1;33m';
  const redBold = '\x1b[1;31m';
  const cyanText = '\x1b[1;36m';
  const whiteBold = '\x1b[1;37m';
  const reset = '\x1b[0m';

  console.log('\n' + redBg + '                                                                                ' + reset);
  console.log(redBg + '  🚨  CRITICAL SECURITY DANGER: WAllie DEV BRIDGE ACTIVE!                      🚨  ' + reset);
  console.log(redBg + '                                                                                ' + reset);
  console.log(`${redBold}  ⚠️  INSECURE DEBUG BUILD: Remote DOM inspection & arbitrary JS eval are ACTIVE!${reset}`);
  console.log(`${redBold}  ⚠️  DO NOT DISTRIBUTE THIS BINARY OR USE IT AS YOUR DAILY DRIVER!             ${reset}`);
  console.log(`${redBold}  ⚠️  Your logged-in WhatsApp session and private chats are fully exposed!      ${reset}`);
  console.log(`${yellowText}  ----------------------------------------------------------------------------${reset}`);
  console.log(`${yellowText}  ▸ Loopback URL:${reset} ${cyanText}http://127.0.0.1:${port}${reset}`);
  console.log(`${yellowText}  ▸ Lockfile:    ${reset} ${cyanText}${LOCK_FILE}${reset} (permissions 0600)`);
  console.log(`${yellowText}  ▸ Ephemeral:   ${reset} ${whiteBold}${token.slice(0, 8)}...${reset}`);
  console.log(`${yellowText}  ▸ CLI Helper:  ${reset} ${cyanText}node scripts/wa-bridge.mjs status${reset}`);
  console.log(redBg + '                                                                                ' + reset + '\n');

  // 2. Desktop Notification
  try {
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: '🚨 DANGER: Insecure Debug Build Active',
        body: `Dev Bridge is ACTIVE on 127.0.0.1:${port}. WhatsApp DOM & execution context are exposed. DO NOT distribute or use as daily driver!`,
        urgency: 'critical',
      });
      notification.show();
    }
  } catch (err) {
    console.warn('[DevBridge] Failed to display system notification:', err);
  }

  // 3. In-App Toast & Window Title
  setTimeout(() => {
    showAppToast(`🚨 DANGER: DEV BRIDGE ENABLED! Insecure debug build - DO NOT use as daily driver!`);
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.mainWindow.setTitle('WAllie [🚨 DANGER: INSECURE DEBUG BUILD - DEV BRIDGE ACTIVE]');
    }
  }, 2500);
}

function attachWebContentsConsole(wc: Electron.WebContents) {
  if (!wc || wc.isDestroyed() || monitoredWebContents.has(wc.id)) return;
  monitoredWebContents.add(wc.id);

  wc.on('console-message', (event) => {
    let accountId: string | undefined;
    for (const [id, v] of state.accountViews.entries()) {
      if (v.webContents.id === wc.id) {
        accountId = id;
        break;
      }
    }

    const rawLevel = (event as any).level;
    const levelStr = String(rawLevel).toLowerCase();
    const levelName = ['error', 'warning', 'info', 'verbose'].includes(levelStr)
      ? levelStr
      : (rawLevel === 3 ? 'error' : rawLevel === 2 ? 'warning' : rawLevel === 0 ? 'verbose' : 'info');

    consoleLogs.push({
      accountId,
      url: wc.getURL(),
      level: rawLevel,
      levelName,
      message: event.message,
      line: event.lineNumber,
      source: event.sourceId,
      timestamp: Date.now(),
    });

    if (consoleLogs.length > MAX_LOGS) {
      consoleLogs.shift();
    }
  });

  wc.once('destroyed', () => {
    monitoredWebContents.delete(wc.id);
  });
}

function attachSessionNetwork(sess: Electron.Session, partitionName?: string) {
  if (!sess || monitoredSessions.has(sess)) return;
  monitoredSessions.add(sess);

  const startTimes = new Map<number, number>();

  sess.webRequest.onSendHeaders((details) => {
    startTimes.set(details.id, Date.now());
  });

  sess.webRequest.onCompleted((details) => {
    const startTime = startTimes.get(details.id);
    startTimes.delete(details.id);
    const durationMs = startTime ? Date.now() - startTime : undefined;

    networkLogs.push({
      id: details.id,
      partition: partitionName,
      url: details.url,
      method: details.method,
      statusCode: details.statusCode,
      statusLine: details.statusLine,
      resourceType: details.resourceType,
      fromCache: details.fromCache,
      durationMs,
      timestamp: Date.now(),
    });

    if (networkLogs.length > MAX_LOGS) {
      networkLogs.shift();
    }
  });

  sess.webRequest.onErrorOccurred((details) => {
    const startTime = startTimes.get(details.id);
    startTimes.delete(details.id);
    const durationMs = startTime ? Date.now() - startTime : undefined;

    networkLogs.push({
      id: details.id,
      partition: partitionName,
      url: details.url,
      method: details.method,
      error: details.error,
      resourceType: details.resourceType,
      durationMs,
      timestamp: Date.now(),
    });

    if (networkLogs.length > MAX_LOGS) {
      networkLogs.shift();
    }
  });
}

function getTargetWebContents(accountId?: string) {
  const targetId = accountId || state.activeAccountId;
  const view = state.accountViews.get(targetId);
  if (!view || view.webContents.isDestroyed()) {
    return null;
  }
  return { accountId: targetId, webContents: view.webContents };
}

export function startDevBridge(): void {
  if (server) {
    return;
  }

  bridgeToken = crypto.randomUUID();

  // Attach telemetry listeners to current and future sessions and webContents
  app.on('web-contents-created', (_event, wc) => {
    attachWebContentsConsole(wc);
    attachSessionNetwork(wc.session);
  });

  if (state.mainWindow) {
    attachWebContentsConsole(state.mainWindow.webContents);
    attachSessionNetwork(state.mainWindow.webContents.session, 'main-window');
  }

  for (const acc of state.accounts) {
    const s = session.fromPartition(acc.partition);
    attachSessionNetwork(s, acc.partition);
  }
  attachSessionNetwork(session.defaultSession, 'default');

  for (const v of state.accountViews.values()) {
    attachWebContentsConsole(v.webContents);
    attachSessionNetwork(v.webContents.session);
  }

  // Write lockfile restricted to user permissions (0600)
  try {
    const lockData = {
      pid: process.pid,
      port: PORT,
      token: bridgeToken,
      startedAt: new Date().toISOString(),
    };
    fs.writeFileSync(LOCK_FILE, JSON.stringify(lockData, null, 2), { mode: 0o600 });
  } catch (err) {
    console.error(`[DevBridge] Failed to write lockfile at ${LOCK_FILE}:`, err);
  }

  server = http.createServer(async (req, res) => {
    // 1. IP Check: Strictly loopback only
    const clientIp = req.socket.remoteAddress;
    const isLoopback = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1';
    if (!isLoopback) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden: only loopback is allowed' }));
      return;
    }

    // 2. Token Check
    const authHeader = req.headers['x-bridge-token'] || (req.headers['authorization']?.startsWith('Bearer ') ? req.headers['authorization'].slice(7) : null);
    if (!bridgeToken || authHeader !== bridgeToken) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized: missing or invalid bridge token' }));
      return;
    }

    // 3. Routing
    const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
    const pathname = url.pathname;

    // Helper to read JSON body
    const readJsonBody = async <T = any>(): Promise<T> => {
      return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
          body += chunk;
          if (body.length > 50 * 1024 * 1024) {
            reject(new Error('Payload too large'));
          }
        });
        req.on('end', () => {
          if (!body) return resolve({} as T);
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error('Invalid JSON'));
          }
        });
        req.on('error', reject);
      });
    };

    try {
      if (req.method === 'GET' && (pathname === '/health' || pathname === '/status')) {
        const target = getTargetWebContents();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          bridge: {
            status: 'online',
            port: PORT,
            pid: process.pid,
            uptime: process.uptime(),
          },
          telemetry: {
            consoleLogsCount: consoleLogs.length,
            networkLogsCount: networkLogs.length,
          },
          activeAccountId: state.activeAccountId,
          accounts: state.accounts.map(a => ({
            id: a.id,
            name: a.name,
            partition: a.partition,
            isLoaded: state.accountViews.has(a.id),
          })),
          activeView: target ? {
            accountId: target.accountId,
            url: target.webContents.getURL(),
            title: target.webContents.getTitle(),
            isLoading: target.webContents.isLoading(),
          } : null,
        }, null, 2));
        return;
      }

      // Console Logs Endpoint
      if ((req.method === 'GET' || req.method === 'POST') && pathname === '/console') {
        const payload = req.method === 'POST' ? await readJsonBody() : Object.fromEntries(url.searchParams.entries());
        let results = [...consoleLogs];

        if (payload.level) {
          const l = String(payload.level).toLowerCase();
          results = results.filter(e => e.levelName === l);
        }
        if (payload.search) {
          const q = String(payload.search).toLowerCase();
          results = results.filter(e => e.message.toLowerCase().includes(q) || e.source.toLowerCase().includes(q));
        }
        if (payload.accountId) {
          results = results.filter(e => e.accountId === payload.accountId);
        }

        const limit = Math.min(Number(payload.limit) || 100, 500);
        const sliced = results.slice(-limit);

        if (payload.clear === true || payload.clear === 'true') {
          consoleLogs.length = 0;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          total: results.length,
          returned: sliced.length,
          logs: sliced,
        }, null, 2));
        return;
      }

      // Network Requests Endpoint
      if ((req.method === 'GET' || req.method === 'POST') && pathname === '/network') {
        const payload = req.method === 'POST' ? await readJsonBody() : Object.fromEntries(url.searchParams.entries());
        let results = [...networkLogs];

        if (payload.resourceType) {
          const r = String(payload.resourceType).toLowerCase();
          results = results.filter(e => e.resourceType.toLowerCase() === r);
        }
        if (payload.search) {
          const q = String(payload.search).toLowerCase();
          results = results.filter(e => e.url.toLowerCase().includes(q));
        }
        if (payload.failedOnly === true || payload.failedOnly === 'true') {
          results = results.filter(e => (e.statusCode && e.statusCode >= 400) || Boolean(e.error));
        }

        const limit = Math.min(Number(payload.limit) || 100, 500);
        const sliced = results.slice(-limit);

        if (payload.clear === true || payload.clear === 'true') {
          networkLogs.length = 0;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          total: results.length,
          returned: sliced.length,
          requests: sliced,
        }, null, 2));
        return;
      }

      if (req.method === 'POST') {
        const payload = await readJsonBody();
        const target = getTargetWebContents(payload.accountId);

        if (!target) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Account view not available or destroyed (accountId: ${payload.accountId || state.activeAccountId})` }));
          return;
        }

        const wc = target.webContents;

        if (pathname === '/query') {
          const selector = payload.selector;
          if (!selector || typeof selector !== 'string') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing or invalid "selector" parameter' }));
            return;
          }

          const limit = Math.max(1, Math.min(Number(payload.limit) || 50, 500));
          const includeHtml = Boolean(payload.includeHtml);
          const includeAttributes = payload.attributes !== false;

          const script = `
            (() => {
              try {
                const nodes = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
                const total = nodes.length;
                const matched = nodes.slice(0, ${limit}).map(el => {
                  const item = {
                    tagName: el.tagName,
                    id: el.id || undefined,
                    className: el.className || undefined,
                    testId: el.getAttribute('data-testid') || undefined,
                    role: el.getAttribute('role') || undefined,
                    ariaLabel: el.getAttribute('aria-label') || undefined,
                    innerText: el.innerText ? el.innerText.trim().slice(0, 500) : undefined,
                  };
                  if (${includeAttributes}) {
                    item.attributes = Object.fromEntries(Array.from(el.attributes).map(a => [a.name, a.value]));
                  }
                  if (${includeHtml}) {
                    item.html = el.outerHTML.slice(0, 4000);
                  }
                  return item;
                });
                return { success: true, total, matched };
              } catch (err) {
                return { success: false, error: err.message };
              }
            })()
          `;

          const result = await wc.executeJavaScript(script);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result, null, 2));
          return;
        }

        if (pathname === '/eval') {
          const code = payload.code;
          if (!code || typeof code !== 'string') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing or invalid "code" parameter' }));
            return;
          }

          const result = await wc.executeJavaScript(code);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, result }, null, 2));
          return;
        }

        if (pathname === '/dom') {
          const selector = payload.selector || 'html';
          const stripBlobs = payload.stripBlobs !== false;
          const maxChars = Number(payload.maxChars) || 500000;

          const script = `
            (() => {
              try {
                const root = ${JSON.stringify(selector)} === 'html' ? document.documentElement : document.querySelector(${JSON.stringify(selector)});
                if (!root) {
                  return { success: false, error: 'Element not found for selector: ' + ${JSON.stringify(selector)} };
                }
                let html = root.outerHTML;
                if (${stripBlobs}) {
                  html = html.replace(/src="data:[^"]+"/g, 'src="data:...[STRIPPED]"');
                  html = html.replace(/d="[MmLlHhVvCcSsQqTtAaZz0-9,\\.\\s-]{120,}"/g, 'd="[COMPACTED_PATH]"');
                }
                const truncated = html.length > ${maxChars};
                return {
                  success: true,
                  selector: ${JSON.stringify(selector)},
                  length: html.length,
                  truncated,
                  html: html.slice(0, ${maxChars}),
                };
              } catch (err) {
                return { success: false, error: err.message };
              }
            })()
          `;

          const result = await wc.executeJavaScript(script);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result, null, 2));
          return;
        }

        if (pathname === '/screenshot') {
          const image = await wc.capturePage();
          const defaultPath = path.join(app.getPath('userData'), 'wa-bridge-screenshot.png');
          const savePath = payload.savePath || defaultPath;

          fs.mkdirSync(path.dirname(savePath), { recursive: true });
          fs.writeFileSync(savePath, image.toPNG());

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            savedTo: savePath,
            size: image.getSize(),
            base64: payload.returnBase64 ? image.toDataURL() : undefined,
          }, null, 2));
          return;
        }

        // Full Chrome DevTools Protocol (CDP) command execution
        if (pathname === '/cdp') {
          const { method, params } = payload;
          if (!method || typeof method !== 'string') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing or invalid "method" parameter' }));
            return;
          }

          try {
            if (!wc.debugger.isAttached()) {
              wc.debugger.attach('1.3');
            }
            const result = await wc.debugger.sendCommand(method, params || {});
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, method, result }, null, 2));
          } catch (cdpErr: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, method, error: cdpErr.message }, null, 2));
          }
          return;
        }

        if (pathname === '/accounts/switch') {
          const newAccountId = payload.accountId;
          if (!newAccountId || typeof newAccountId !== 'string') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing or invalid "accountId"' }));
            return;
          }

          await switchActiveAccount(newAccountId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, activeAccountId: state.activeAccountId }, null, 2));
          return;
        }
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Route not found' }));
    } catch (err: any) {
      console.error('[DevBridge] Error processing request:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || 'Internal Server Error', stack: err.stack }));
    }
  });

  server.listen(PORT, '127.0.0.1', () => {
    announceDevBridge(PORT, bridgeToken!);
  });

  server.on('error', (err: any) => {
    console.error(`[DevBridge] Server error on port ${PORT}:`, err);
  });

  // Ensure clean exit and file removal
  const cleanup = () => {
    stopDevBridge();
  };

  process.once('exit', cleanup);
  process.once('SIGINT', cleanup);
  process.once('SIGTERM', cleanup);
  app.once('before-quit', cleanup);
}

export function stopDevBridge(): void {
  removeLockFile();
  if (server) {
    try {
      server.close();
    } catch (e) {
      // ignore
    }
    server = null;
    bridgeToken = null;
    console.log('[DevBridge] Stopped and lockfile cleaned up.');
  }
}
