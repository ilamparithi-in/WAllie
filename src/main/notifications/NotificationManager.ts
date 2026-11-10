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

interface ContactBurstState {
  lastTime: number;
  count: number;
}

export class NotificationManager {
  private static instance: NotificationManager | null = null;
  private providers: Map<string, NotificationProvider> = new Map();
  private activeProvider: NotificationProvider | null = null;
  private activeNotifications: Map<string, ActiveNotificationEntry> = new Map();

  // Burst rate limiting & message coalescing
  private static readonly BURST_WINDOW_MS = 2000;
  private static readonly MAX_BURST_COUNT = 8;
  private recentTimestamps: number[] = [];
  private recentContactBursts: Map<string, ContactBurstState> = new Map();

  private constructor() {
    this.registerProvider(new FreedesktopDbusProvider());
    this.registerProvider(new ElectronNativeProvider());

    app.on('before-quit', () => {
      this.dispose().catch(() => { });
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

  private cleanRecentDispatches(now: number): void {
    const cutoff = now - NotificationManager.BURST_WINDOW_MS;
    this.recentTimestamps = this.recentTimestamps.filter((t) => t > cutoff);

    // Evict stale contact burst records older than 10 seconds
    const staleContactCutoff = now - 10000;
    for (const [key, state] of this.recentContactBursts.entries()) {
      if (state.lastTime < staleContactCutoff) {
        this.recentContactBursts.delete(key);
      }
    }
  }

  public async notify(payload: NotificationPayload): Promise<string | number | null> {
    const provider = await this.getPreferredProvider();
    const now = Date.now();

    // 1. Sliding window burst rate limiter across the application
    this.cleanRecentDispatches(now);
    if (this.recentTimestamps.length >= NotificationManager.MAX_BURST_COUNT) {
      const earliest = this.recentTimestamps[0];
      const waitTime = Math.max(50, NotificationManager.BURST_WINDOW_MS - (now - earliest));
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    this.recentTimestamps.push(Date.now());

    // 2. Per-contact coalescing within the burst window
    if (payload.contactName && payload.accountId) {
      const contactKey = `${payload.accountId}:${payload.contactName.trim().toLowerCase()}`;
      const existingBurst = this.recentContactBursts.get(contactKey);

      if (existingBurst && now - existingBurst.lastTime < NotificationManager.BURST_WINDOW_MS) {
        existingBurst.count++;
        existingBurst.lastTime = now;
        // Close previous notification from this contact so desktop daemon doesn't stack alerts
        await this.closeByContact(payload.contactName, payload.accountId);
        payload.body = `(${existingBurst.count} messages)\n${payload.body}`;
      } else {
        this.recentContactBursts.set(contactKey, { lastTime: now, count: 1 });
      }
    }

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
      } catch { }
    }

    for (const provider of this.providers.values()) {
      if (provider.dispose) {
        try {
          await provider.dispose();
        } catch { }
      }
    }
    this.activeProvider = null;
  }
}

export const notificationManager = NotificationManager.getInstance();
