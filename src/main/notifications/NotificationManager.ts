import { app } from 'electron';
import {
  NotificationProvider,
  NotificationPayload,
  NotificationCapabilities,
} from './types';
import { FreedesktopDbusProvider } from './providers/FreedesktopDbusProvider';
import { ElectronNativeProvider } from './providers/ElectronNativeProvider';

interface ActiveNotificationEntry {
  id: string | number;
  provider: NotificationProvider;
  tag?: string;
  contactName?: string;
  accountId?: string;
}

export class NotificationManager {
  private static instance: NotificationManager | null = null;
  private providers: Map<string, NotificationProvider> = new Map();
  private activeProvider: NotificationProvider | null = null;
  private activeNotifications: Map<string, ActiveNotificationEntry> = new Map();

  private constructor() {
    this.registerProvider(new FreedesktopDbusProvider());
    this.registerProvider(new ElectronNativeProvider());

    app.on('before-quit', () => {
      this.dispose().catch(() => {});
    });
  }

  public static getInstance(): NotificationManager {
    if (!NotificationManager.instance) {
      NotificationManager.instance = new NotificationManager();
    }
    return NotificationManager.instance;
  }

  public registerProvider(provider: NotificationProvider): void {
    this.providers.set(provider.name, provider);
  }

  public async getPreferredProvider(): Promise<NotificationProvider> {
    if (this.activeProvider) {
      return this.activeProvider;
    }

    if (process.platform === 'linux') {
      const dbus = this.providers.get('freedesktop-dbus');
      if (dbus && (await dbus.isAvailable())) {
        this.activeProvider = dbus;
        return dbus;
      }
    }

    const electron = this.providers.get('electron-native');
    if (electron && (await electron.isAvailable())) {
      this.activeProvider = electron;
      return electron;
    }

    // Default fallback to electron provider
    this.activeProvider = electron || Array.from(this.providers.values())[0];
    return this.activeProvider;
  }

  public async getCapabilities(): Promise<NotificationCapabilities> {
    const provider = await this.getPreferredProvider();
    return provider.getCapabilities();
  }

  public async notify(payload: NotificationPayload): Promise<string | number | null> {
    const provider = await this.getPreferredProvider();

    // If a tag is provided and already active, close previous instance first
    if (payload.tag) {
      await this.closeByTag(payload.tag);
    }

    const originalOnClose = payload.onClose;
    let notifKey = '';

    payload.onClose = (reason) => {
      if (notifKey) {
        this.activeNotifications.delete(notifKey);
      }
      originalOnClose?.(reason);
    };

    const id = await provider.notify(payload);

    if (id !== null && id !== undefined && id !== 0) {
      notifKey = String(id);
      this.activeNotifications.set(notifKey, {
        id,
        provider,
        tag: payload.tag,
        contactName: payload.contactName,
        accountId: payload.accountId,
      });
    }

    return id;
  }

  public async close(id: string | number): Promise<void> {
    const key = String(id);
    const entry = this.activeNotifications.get(key);
    this.activeNotifications.delete(key);

    if (entry) {
      try {
        await entry.provider.close(entry.id);
      } catch (err) {
        console.warn(`[NotificationManager] Failed to close notification ${id}:`, err);
      }
      return;
    }

    const provider = await this.getPreferredProvider();
    await provider.close(id);
  }

  public async closeByTag(tag: string): Promise<void> {
    if (!tag) return;
    const toClose: ActiveNotificationEntry[] = [];

    for (const [key, entry] of this.activeNotifications.entries()) {
      if (entry.tag === tag) {
        toClose.push(entry);
        this.activeNotifications.delete(key);
      }
    }

    for (const item of toClose) {
      try {
        await item.provider.close(item.id);
      } catch (err) {
        console.warn(`[NotificationManager] Failed to close notification by tag ${tag}:`, err);
      }
    }
  }

  public async closeByContact(contactName: string, accountId?: string): Promise<void> {
    if (!contactName) return;
    const target = contactName.trim().toLowerCase();
    const toClose: ActiveNotificationEntry[] = [];

    for (const [key, entry] of this.activeNotifications.entries()) {
      const matchAccount = !accountId || !entry.accountId || entry.accountId === accountId;
      const matchContact = entry.contactName && entry.contactName.trim().toLowerCase() === target;
      if (matchAccount && matchContact) {
        toClose.push(entry);
        this.activeNotifications.delete(key);
      }
    }

    for (const item of toClose) {
      try {
        await item.provider.close(item.id);
      } catch (err) {
        console.warn(`[NotificationManager] Failed to close notification for contact ${contactName}:`, err);
      }
    }
  }

  public async closeAllForAccount(accountId: string): Promise<void> {
    if (!accountId) return;
    const toClose: ActiveNotificationEntry[] = [];

    for (const [key, entry] of this.activeNotifications.entries()) {
      if (entry.accountId === accountId) {
        toClose.push(entry);
        this.activeNotifications.delete(key);
      }
    }

    for (const item of toClose) {
      try {
        await item.provider.close(item.id);
      } catch (err) {
        console.warn(`[NotificationManager] Failed to close notification for account ${accountId}:`, err);
      }
    }
  }

  public async dispose(): Promise<void> {
    const entries = Array.from(this.activeNotifications.values());
    this.activeNotifications.clear();

    for (const item of entries) {
      try {
        await item.provider.close(item.id);
      } catch {}
    }

    for (const provider of this.providers.values()) {
      if (provider.dispose) {
        try {
          await provider.dispose();
        } catch {}
      }
    }
    this.activeProvider = null;
  }
}

export const notificationManager = NotificationManager.getInstance();
