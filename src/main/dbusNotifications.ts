import { app } from 'electron';
import { EventEmitter } from 'node:events';
import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export interface SendDbusNotificationOptions {
  title: string;
  body: string;
  iconDataUrl?: string;
  timeoutMs?: number;
  placeholder?: string;
  canReply?: boolean;
}

const PYTHON_DAEMON_SCRIPT = `
import sys, json
from gi.repository import Gio, GLib

bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)

def on_signal(connection, sender_name, object_path, interface_name, signal_name, parameters, user_data):
    params = parameters.unpack()
    if signal_name == 'NotificationReplied':
        print(json.dumps({'event': 'replied', 'id': params[0], 'text': params[1]}), flush=True)
    elif signal_name == 'ActionInvoked':
        print(json.dumps({'event': 'actionInvoked', 'id': params[0], 'action': params[1]}), flush=True)
    elif signal_name == 'NotificationClosed':
        print(json.dumps({'event': 'closed', 'id': params[0], 'reason': params[1]}), flush=True)

bus.signal_subscribe(
    'org.freedesktop.Notifications',
    'org.freedesktop.Notifications',
    None,
    '/org/freedesktop/Notifications',
    None,
    Gio.DBusSignalFlags.NONE,
    on_signal,
    None
)

def on_stdin(channel, condition):
    line = sys.stdin.readline()
    if not line:
        sys.exit(0)
    try:
        data = json.loads(line.strip())
        cmd = data.get('cmd')
        if cmd == 'notify':
            req_id = data.get('reqId')
            title = data.get('title', '')
            body = data.get('body', '')
            icon = data.get('icon', '')
            can_reply = data.get('canReply', True)
            placeholder = data.get('placeholder', f'Reply to {title}...')
            try:
                timeout_ms = int(data.get('timeoutMs', 25000))
            except (ValueError, TypeError):
                timeout_ms = 25000

            # In KDE Plasma, 'default' enables clicking the notification body to open the chat,
            # while 'inline-reply' provides the text reply field.
            actions = ['default', 'Open Chat', 'inline-reply', 'Reply'] if can_reply else ['default', 'Open Chat']
            hints = {
                'desktop-entry': GLib.Variant('s', 'dev.ilamparithi.wallie'),
            }
            if can_reply:
                hints['x-kde-reply-placeholder-text'] = GLib.Variant('s', placeholder)

            params = GLib.Variant('(susssasa{sv}i)', (
                'WAllie',
                0,
                icon,
                title,
                body,
                actions,
                hints,
                timeout_ms
            ))

            res = bus.call_sync(
                'org.freedesktop.Notifications',
                '/org/freedesktop/Notifications',
                'org.freedesktop.Notifications',
                'Notify',
                params,
                None,
                Gio.DBusCallFlags.NONE,
                -1,
                None
            )
            nid = res.unpack()[0]
            print(json.dumps({'event': 'notifyResult', 'reqId': req_id, 'id': nid}), flush=True)
        elif cmd == 'close':
            nid = data.get('id')
            if nid:
                bus.call_sync(
                    'org.freedesktop.Notifications',
                    '/org/freedesktop/Notifications',
                    'org.freedesktop.Notifications',
                    'CloseNotification',
                    GLib.Variant('(u)', (nid,)),
                    None,
                    Gio.DBusCallFlags.NONE,
                    -1,
                    None
                )
    except Exception as e:
        print(json.dumps({'event': 'error', 'error': str(e)}), flush=True)
    return True

GLib.io_add_watch(sys.stdin.fileno(), GLib.IO_IN, on_stdin)
loop = GLib.MainLoop()
print('READY', flush=True)
loop.run()
`;

export class DbusNotificationService extends EventEmitter {
  private static instance: DbusNotificationService | null = null;
  private daemonProcess: ChildProcess | null = null;
  private isDaemonReady = false;
  private isQuitting = false;
  private nextReqId = 1;
  private pendingRequests = new Map<number, (id: number) => void>();
  private readyWaiters: Array<(ready: boolean) => void> = [];
  private availabilityChecked: boolean | null = null;

  private constructor() {
    super();

    app.on('before-quit', () => {
      this.isQuitting = true;
      this.stopDaemon();
    });
  }

  public static getInstance(): DbusNotificationService {
    if (!DbusNotificationService.instance) {
      DbusNotificationService.instance = new DbusNotificationService();
    }
    return DbusNotificationService.instance;
  }

  public async isAvailable(): Promise<boolean> {
    if (process.platform !== 'linux') {
      return false;
    }
    if (this.availabilityChecked !== null) {
      return this.availabilityChecked;
    }

    // Check if python3 and gi.repository.Gio are available
    const hasPython = await this.testPythonGio();
    if (!hasPython) {
      this.availabilityChecked = false;
      return false;
    }

    const ready = await this.ensureDaemon();
    this.availabilityChecked = ready;
    return ready;
  }

  private testPythonGio(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn('python3', ['-c', 'from gi.repository import Gio; bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)']);
      proc.on('close', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
  }

  private ensureDaemon(): Promise<boolean> {
    if (this.isDaemonReady && this.daemonProcess) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      this.readyWaiters.push(resolve);

      if (this.daemonProcess) {
        return;
      }

      try {
        this.daemonProcess = spawn('python3', ['-c', PYTHON_DAEMON_SCRIPT], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (err) {
        console.error('[dbusNotifications] Failed to start Python daemon:', err);
        this.flushReadyWaiters(false);
        return;
      }

      let buffer = '';

      this.daemonProcess.stdout?.on('data', (data: Buffer) => {
        buffer += data.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (trimmed === 'READY') {
            this.isDaemonReady = true;
            this.flushReadyWaiters(true);
            continue;
          }

          try {
            const msg = JSON.parse(trimmed);
            this.handleDaemonMessage(msg);
          } catch (e) {
            console.warn('[dbusNotifications] Malformed daemon output:', trimmed);
          }
        }
      });

      this.daemonProcess.stderr?.on('data', (d: Buffer) => {
        console.warn('[dbusNotifications daemon stderr]:', d.toString('utf8').trim());
      });

      this.daemonProcess.on('close', (code) => {
        this.daemonProcess = null;
        this.isDaemonReady = false;
        this.flushReadyWaiters(false);

        // Reject any pending requests
        for (const [reqId, resolver] of this.pendingRequests.entries()) {
          resolver(0);
        }
        this.pendingRequests.clear();

        if (!this.isQuitting) {
          console.warn(`[dbusNotifications] Daemon exited with code ${code}, will restart on demand`);
        }
      });

      this.daemonProcess.on('error', (err) => {
        console.error('[dbusNotifications] Daemon process error:', err);
        this.daemonProcess = null;
        this.isDaemonReady = false;
        this.flushReadyWaiters(false);
      });
    });
  }

  private flushReadyWaiters(success: boolean) {
    const waiters = [...this.readyWaiters];
    this.readyWaiters = [];
    for (const w of waiters) {
      w(success);
    }
  }

  private handleDaemonMessage(msg: any) {
    if (msg.event === 'notifyResult') {
      const resolver = this.pendingRequests.get(msg.reqId);
      if (resolver) {
        this.pendingRequests.delete(msg.reqId);
        resolver(msg.id || 0);
      }
    } else if (msg.event === 'replied') {
      this.emit('replied', msg.id, msg.text);
    } else if (msg.event === 'actionInvoked') {
      this.emit('actionInvoked', msg.id, msg.action);
    } else if (msg.event === 'closed') {
      this.emit('closed', msg.id, msg.reason);
    }
  }

  private stopDaemon() {
    if (this.daemonProcess) {
      try {
        this.daemonProcess.stdin?.end();
        this.daemonProcess.kill();
      } catch {}
      this.daemonProcess = null;
      this.isDaemonReady = false;
    }
  }

  private writeTempAvatar(base64Data: string): string | null {
    try {
      const match = base64Data.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
      if (!match) return null;
      const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
      const buffer = Buffer.from(match[2], 'base64');
      const tempPath = path.join(app.getPath('temp'), `wallie-avatar-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`);
      fs.writeFileSync(tempPath, buffer);

      // Clean up temp avatar after 60 seconds
      setTimeout(() => {
        fs.promises.unlink(tempPath).catch(() => {});
      }, 60000);

      return tempPath;
    } catch (err) {
      console.error('[dbusNotifications] Failed to write temp avatar:', err);
      return null;
    }
  }

  public async notify(options: SendDbusNotificationOptions): Promise<number> {
    const ready = await this.ensureDaemon();
    if (!ready || !this.daemonProcess || !this.daemonProcess.stdin) {
      return 0;
    }

    let iconPath = '';
    if (options.iconDataUrl && options.iconDataUrl.startsWith('data:image')) {
      iconPath = this.writeTempAvatar(options.iconDataUrl) || '';
    }
    if (!iconPath) {
      const defaultIcon = path.join(app.getAppPath(), 'public/icons/icon-512.png');
      if (fs.existsSync(defaultIcon)) {
        iconPath = defaultIcon;
      } else {
        iconPath = 'dev.ilamparithi.wallie';
      }
    }

    const reqId = this.nextReqId++;
    const payload = {
      cmd: 'notify',
      reqId,
      title: options.title,
      body: options.body,
      icon: iconPath,
      canReply: options.canReply !== false,
      placeholder: options.placeholder || `Reply to ${options.title}…`,
      timeoutMs: options.timeoutMs ?? 25000,
    };

    return new Promise<number>((resolve) => {
      this.pendingRequests.set(reqId, resolve);
      this.daemonProcess?.stdin?.write(JSON.stringify(payload) + '\n');

      // Safety timeout after 10s
      setTimeout(() => {
        if (this.pendingRequests.has(reqId)) {
          this.pendingRequests.delete(reqId);
          resolve(0);
        }
      }, 10000);
    });
  }

  public close(id: number) {
    if (!id || !this.isDaemonReady || !this.daemonProcess?.stdin) return;
    try {
      this.daemonProcess.stdin.write(JSON.stringify({ cmd: 'close', id }) + '\n');
    } catch {}
  }
}

export const dbusNotifications = DbusNotificationService.getInstance();
