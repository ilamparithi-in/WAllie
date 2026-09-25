import { EventEmitter } from 'node:events';
import { notificationManager } from './notifications/index';

export interface SendDbusNotificationOptions {
  title: string;
  body: string;
  iconDataUrl?: string;
  timeoutMs?: number;
  placeholder?: string;
  canReply?: boolean;
}

/**
 * Backward compatibility wrapper around notificationManager.
 * Zero Python dependencies.
 */
export class DbusNotificationService extends EventEmitter {
  private static instance: DbusNotificationService | null = null;

  public static getInstance(): DbusNotificationService {
    if (!DbusNotificationService.instance) {
      DbusNotificationService.instance = new DbusNotificationService();
    }
    return DbusNotificationService.instance;
  }

  public async isAvailable(): Promise<boolean> {
    const caps = await notificationManager.getCapabilities();
    return caps.actions;
  }

  public async notify(options: SendDbusNotificationOptions): Promise<number> {
    const id = await notificationManager.notify({
      title: options.title,
      body: options.body,
      icon: options.iconDataUrl,
      timeoutMs: options.timeoutMs,
      canReply: options.canReply,
      replyPlaceholder: options.placeholder,
      onAction: (actionId) => {
        this.emit('actionInvoked', id, actionId);
      },
      onReply: (text) => {
        this.emit('replied', id, text);
      },
      onClose: (reason) => {
        this.emit('closed', id, reason);
      },
    });

    return typeof id === 'number' ? id : (id ? parseInt(id, 10) || 1 : 0);
  }

  public async close(id: number): Promise<void> {
    await notificationManager.close(id);
  }
}

export const dbusNotifications = DbusNotificationService.getInstance();
