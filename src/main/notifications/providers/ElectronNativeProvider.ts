import { Notification, nativeImage } from 'electron';
import {
  NotificationProvider,
  NotificationPayload,
  NotificationCapabilities,
} from '../types';

export class ElectronNativeProvider implements NotificationProvider {
  public readonly name = 'electron-native';
  private nextId = 1;
  private activeNotifications = new Map<string, { notif: Notification; timer?: NodeJS.Timeout }>();

  public async isAvailable(): Promise<boolean> {
    return Notification.isSupported();
  }

  public getCapabilities(): NotificationCapabilities {
    const isMac = process.platform === 'darwin';
    return {
      actions: isMac || process.platform === 'win32',
      inlineReply: isMac,
      customIcons: true,
    };
  }

  public async notify(payload: NotificationPayload): Promise<string | null> {
    if (!Notification.isSupported()) {
      return null;
    }

    const notifId = `electron_${this.nextId++}_${Date.now()}`;

    let iconImage: Electron.NativeImage | undefined;
    if (payload.icon && payload.icon.startsWith('data:image/')) {
      try {
        iconImage = nativeImage.createFromDataURL(payload.icon);
      } catch (err) {
        console.warn('[ElectronNativeProvider] Failed to parse icon data URL:', err);
      }
    } else if (payload.icon) {
      try {
        iconImage = nativeImage.createFromPath(payload.icon);
      } catch (err) {
        console.warn('[ElectronNativeProvider] Failed to load icon from path:', err);
      }
    }

    const nonDefaultActions = (payload.actions || []).filter((a) => a.id !== 'default');
    const electronActions: Electron.NotificationAction[] = nonDefaultActions.map((a) => ({
      type: 'button',
      text: a.label,
    }));

    const notif = new Notification({
      title: payload.title,
      body: payload.body,
      icon: iconImage,
      silent: false,
      actions: electronActions.length > 0 ? electronActions : undefined,
      hasReply: !!payload.canReply && process.platform === 'darwin',
      replyPlaceholder: payload.replyPlaceholder,
    });

    const cleanup = () => {
      const entry = this.activeNotifications.get(notifId);
      if (entry) {
        if (entry.timer) clearTimeout(entry.timer);
        this.activeNotifications.delete(notifId);
      }
    };

    notif.on('click', () => {
      cleanup();
      try {
        payload.onAction?.('default');
      } catch (err) {
        console.error('[ElectronNativeProvider] Error in onAction click:', err);
      }
    });

    notif.on('action', (_event, index) => {
      cleanup();
      const action = nonDefaultActions[index];
      if (action) {
        try {
          payload.onAction?.(action.id);
        } catch (err) {
          console.error('[ElectronNativeProvider] Error in onAction button:', err);
        }
      }
    });

    (notif as any).on('reply', (_event: any, replyText: string) => {
      cleanup();
      try {
        payload.onReply?.(replyText);
      } catch (err) {
        console.error('[ElectronNativeProvider] Error in onReply:', err);
      }
    });

    notif.on('close', () => {
      cleanup();
      try {
        payload.onClose?.();
      } catch (err) {
        console.error('[ElectronNativeProvider] Error in onClose:', err);
      }
    });

    let timer: NodeJS.Timeout | undefined;
    if (typeof payload.timeoutMs === 'number' && payload.timeoutMs > 0) {
      timer = setTimeout(() => {
        try {
          notif.close();
        } catch {}
        cleanup();
      }, payload.timeoutMs);
    }

    this.activeNotifications.set(notifId, { notif, timer });
    notif.show();

    return notifId;
  }

  public async close(id: string | number): Promise<void> {
    const key = String(id);
    const entry = this.activeNotifications.get(key);
    if (entry) {
      if (entry.timer) clearTimeout(entry.timer);
      this.activeNotifications.delete(key);
      try {
        entry.notif.close();
      } catch {}
    }
  }

  public async dispose(): Promise<void> {
    for (const [key, entry] of this.activeNotifications.entries()) {
      if (entry.timer) clearTimeout(entry.timer);
      try {
        entry.notif.close();
      } catch {}
    }
    this.activeNotifications.clear();
  }
}
