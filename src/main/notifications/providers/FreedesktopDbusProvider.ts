import { app } from 'electron';
import dbus from 'dbus-next';
import path from 'node:path';
import fs from 'node:fs';
import {
  NotificationProvider,
  NotificationPayload,
  NotificationCapabilities,
} from '../types';

interface TrackedNotification {
  payload: NotificationPayload;
  tempAvatarPath?: string;
  ttlTimer?: NodeJS.Timeout;
}

export class FreedesktopDbusProvider implements NotificationProvider {
  public readonly name = 'freedesktop-dbus';

  private bus: dbus.MessageBus | null = null;
  private iface: dbus.ClientInterface | null = null;
  private isConnected = false;
  private availabilityChecked: boolean | null = null;
  private activeNotifications = new Map<number, TrackedNotification>();
  private avatarCacheDir: string;

  constructor() {
    this.avatarCacheDir = path.join(app.getPath('userData'), 'cache', 'avatars');
    this.initAvatarCache();

    app.on('before-quit', () => {
      this.dispose().catch(() => {});
    });
  }

  private initAvatarCache(): void {
    try {
      if (!fs.existsSync(this.avatarCacheDir)) {
        fs.mkdirSync(this.avatarCacheDir, { recursive: true, mode: 0o700 });
      } else {
        // Clean up leftover avatar files from previous sessions
        fs.promises.readdir(this.avatarCacheDir).then((files) => {
          for (const file of files) {
            fs.promises.unlink(path.join(this.avatarCacheDir, file)).catch(() => {});
          }
        }).catch(() => {});
      }
    } catch (err) {
      console.error('[FreedesktopDbusProvider] Failed to initialize avatar cache directory:', err);
    }
  }

  public async isAvailable(): Promise<boolean> {
    if (process.platform !== 'linux') {
      return false;
    }
    if (this.availabilityChecked !== null && this.isConnected) {
      return this.availabilityChecked;
    }

    try {
      const iface = await this.ensureInterface();
      this.availabilityChecked = !!iface;
      return this.availabilityChecked;
    } catch {
      this.availabilityChecked = false;
      return false;
    }
  }

  public getCapabilities(): NotificationCapabilities {
    return {
      actions: true,
      inlineReply: true,
      customIcons: true,
    };
  }

  private async ensureInterface(): Promise<dbus.ClientInterface | null> {
    if (this.iface && this.isConnected) {
      return this.iface;
    }

    try {
      if (!this.bus) {
        this.bus = dbus.sessionBus();
        this.bus.on('error', (err) => {
          console.warn('[FreedesktopDbusProvider] D-Bus session bus error:', err);
          this.cleanupBus();
        });
      }

      const proxyObj = await this.bus.getProxyObject('org.freedesktop.Notifications', '/org/freedesktop/Notifications');
      const iface = proxyObj.getInterface('org.freedesktop.Notifications');

      // Bind signals
      iface.on('ActionInvoked', (id: number, actionKey: string) => {
        const tracked = this.activeNotifications.get(id);
        if (!tracked) return;

        this.cleanupTracked(id);
        try {
          tracked.payload.onAction?.(actionKey);
        } catch (err) {
          console.error('[FreedesktopDbusProvider] Error in onAction callback:', err);
        }
      });

      iface.on('NotificationReplied', (id: number, replyText: string) => {
        const tracked = this.activeNotifications.get(id);
        if (!tracked) return;

        this.cleanupTracked(id);
        try {
          tracked.payload.onReply?.(replyText);
        } catch (err) {
          console.error('[FreedesktopDbusProvider] Error in onReply callback:', err);
        }
      });

      iface.on('NotificationClosed', (id: number, reason: number) => {
        const tracked = this.activeNotifications.get(id);
        if (!tracked) return;

        this.cleanupTracked(id);
        try {
          tracked.payload.onClose?.(reason);
        } catch (err) {
          console.error('[FreedesktopDbusProvider] Error in onClose callback:', err);
        }
      });

      this.iface = iface;
      this.isConnected = true;
      return this.iface;
    } catch (err) {
      console.warn('[FreedesktopDbusProvider] Could not connect to org.freedesktop.Notifications:', err);
      this.cleanupBus();
      return null;
    }
  }

  private cleanupBus(): void {
    this.isConnected = false;
    this.iface = null;
    if (this.bus) {
      try {
        this.bus.disconnect();
      } catch {}
      this.bus = null;
    }
  }

  private cleanupTracked(id: number): void {
    const tracked = this.activeNotifications.get(id);
    if (!tracked) return;

    this.activeNotifications.delete(id);

    if (tracked.ttlTimer) {
      clearTimeout(tracked.ttlTimer);
    }

    if (tracked.tempAvatarPath) {
      fs.promises.unlink(tracked.tempAvatarPath).catch(() => {});
    }
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private sanitizeString(str: string, maxLength: number): string {
    if (!str) return '';
    const trimmed = str.trim().slice(0, maxLength);
    return this.escapeXml(trimmed);
  }

  private writeTempAvatar(dataUrl: string): string | null {
    try {
      const match = dataUrl.match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/);
      if (!match) return null;

      const rawExt = match[1].toLowerCase();
      const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
      const buffer = Buffer.from(match[2], 'base64');

      const filename = `avatar-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
      const fullPath = path.join(this.avatarCacheDir, filename);

      fs.writeFileSync(fullPath, buffer, { mode: 0o600 });
      return fullPath;
    } catch (err) {
      console.error('[FreedesktopDbusProvider] Failed to cache avatar:', err);
      return null;
    }
  }

  public async notify(payload: NotificationPayload): Promise<number | null> {
    const iface = await this.ensureInterface();
    if (!iface) {
      return null;
    }

    const title = this.sanitizeString(payload.title, 256);
    const body = this.sanitizeString(payload.body, 4096);

    let iconPath = '';
    let tempAvatarPath: string | undefined;

    if (payload.icon && payload.icon.startsWith('data:image/')) {
      const cached = this.writeTempAvatar(payload.icon);
      if (cached) {
        iconPath = cached;
        tempAvatarPath = cached;
      }
    } else if (payload.icon) {
      // Local path or system icon name
      iconPath = payload.icon;
    }

    if (!iconPath) {
      const defaultIcon = path.join(app.getAppPath(), 'public/icons/icon-512.png');
      if (fs.existsSync(defaultIcon)) {
        iconPath = defaultIcon;
      } else {
        iconPath = 'dev.ilamparithi.wallie';
      }
    }

    // Build action list: [action_id, label, ...]
    const actionsList: string[] = [];
    if (payload.actions && payload.actions.length > 0) {
      for (const action of payload.actions) {
        actionsList.push(action.id, action.label);
      }
    }

    if (payload.canReply) {
      if (!actionsList.includes('inline-reply')) {
        actionsList.push('inline-reply', 'Reply');
      }
    }

    if (actionsList.length === 0) {
      actionsList.push('default', 'Open');
    }

    const hints: Record<string, dbus.Variant> = {
      'desktop-entry': new dbus.Variant('s', 'dev.ilamparithi.wallie'),
    };

    if (payload.canReply) {
      const placeholder = payload.replyPlaceholder || `Reply to ${payload.title}…`;
      hints['x-kde-reply-placeholder-text'] = new dbus.Variant('s', placeholder);
    }

    // Timeout: -1 = server default, 0 = never expire, >0 = ms
    let expireTimeout = 10000;
    if (typeof payload.timeoutMs === 'number') {
      expireTimeout = payload.timeoutMs;
    }

    try {
      const nid = await iface.Notify(
        'WAllie',
        0,
        iconPath,
        title,
        body,
        actionsList,
        hints,
        expireTimeout
      ) as number;

      if (nid > 0) {
        // Track notification for lifecycle callbacks & memory TTL cleanup
        const ttlMs = expireTimeout > 0 ? expireTimeout + 15000 : 120000;
        const ttlTimer = setTimeout(() => {
          this.cleanupTracked(nid);
        }, ttlMs);

        this.activeNotifications.set(nid, {
          payload,
          tempAvatarPath,
          ttlTimer,
        });

        return nid;
      }

      // If notification was not accepted, clean up any temp avatar
      if (tempAvatarPath) {
        fs.promises.unlink(tempAvatarPath).catch(() => {});
      }
      return null;
    } catch (err) {
      console.error('[FreedesktopDbusProvider] Notify failed:', err);
      if (tempAvatarPath) {
        fs.promises.unlink(tempAvatarPath).catch(() => {});
      }
      return null;
    }
  }

  public async close(id: number | string): Promise<void> {
    const numId = typeof id === 'number' ? id : parseInt(id, 10);
    if (!numId) return;

    if (this.iface && this.isConnected) {
      try {
        await this.iface.CloseNotification(numId);
      } catch (err) {
        console.warn(`[FreedesktopDbusProvider] CloseNotification failed for id ${numId}:`, err);
      }
    }

    this.cleanupTracked(numId);
  }

  public async dispose(): Promise<void> {
    for (const id of Array.from(this.activeNotifications.keys())) {
      this.cleanupTracked(id);
    }
    this.cleanupBus();
  }
}
