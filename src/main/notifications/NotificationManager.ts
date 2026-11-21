import { app } from 'electron';
import {
  NotificationProvider,
  NotificationPayload,
  NotificationCapabilities,
} from './types';
import { FreedesktopDbusProvider } from './providers/FreedesktopDbusProvider';
import { ElectronNativeProvider } from './providers/ElectronNativeProvider';
import { coalesceNotificationMessages } from '../../shared/notificationFormatting';

interface ActiveNotificationEntry {
  id: string | number;
  provider: NotificationProvider;
  tag?: string;
  contactName?: string;
  accountId?: string;
}

interface ConversationState {
  notificationId?: string | number;
  messages: string[];
  lastTime: number;
}

function formatSingleMessage(msg: string, maxLen = 140): string {
  const clean = msg.trim().replace(/\r?\n/g, ' ');
  if (clean.length > maxLen) {
    return clean.slice(0, maxLen - 1).trimEnd() + '…';
  }
  return clean;
}

export class NotificationManager {
  private static instance: NotificationManager | null = null;
  private providers: Map<string, NotificationProvider> = new Map();
  private activeProvider: NotificationProvider | null = null;
  private activeNotifications: Map<string, ActiveNotificationEntry> = new Map();
  private conversations: Map<string, ConversationState> = new Map();

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

  public async notify(payload: NotificationPayload): Promise<string | number | null> {
    const provider = await this.getPreferredProvider();

    // Android-style notification coalescing:
    // Append messages sequentially on the next line and truncate long individual messages with an ellipsis
    let convKey: string | null = null;
    if (payload.contactName && payload.accountId) {
      convKey = `${payload.accountId}:${payload.contactName.trim().toLowerCase()}`;
      const now = Date.now();
      const existing = this.conversations.get(convKey);
      const formattedMsg = formatSingleMessage(payload.body, 140);

      // If active conversation exists within 60s window, coalesce/append message and update in-place
      if (existing && now - existing.lastTime < 60000 && existing.notificationId) {
        existing.messages = coalesceNotificationMessages(existing.messages, formattedMsg);
        existing.lastTime = now;
        payload.body = existing.messages.join('\n');
        payload.replacesId = existing.notificationId;
      } else {
        this.conversations.set(convKey, {
          messages: [formattedMsg],
          lastTime: now,
        });
        payload.body = formattedMsg;
      }
    }

    // If a tag is provided and already active without an in-place update, close previous instance first
    if (payload.tag && !payload.replacesId) {
      await this.closeByTag(payload.tag);
    }

    const originalOnClose = payload.onClose;
    let notifKey = '';

    payload.onClose = (reason) => {
      if (notifKey) {
        this.activeNotifications.delete(notifKey);
      }
      if (convKey) {
        const conv = this.conversations.get(convKey);
        if (conv && String(conv.notificationId) === notifKey) {
          this.conversations.delete(convKey);
        }
      }
      originalOnClose?.(reason);
    };

    const originalOnReply = payload.onReply;
    payload.onReply = async (replyText) => {
      const trimmed = replyText.trim();
      if (convKey && trimmed) {
        const conv = this.conversations.get(convKey);
        if (conv) {
          conv.messages.push(`You: ${formatSingleMessage(trimmed, 140)}`);
          conv.lastTime = Date.now();
          if (conv.notificationId) {
            // Re-render the notification in-place with "You: <reply>" appended and reply box removed
            const postReplyPayload: NotificationPayload = {
              ...payload,
              body: conv.messages.join('\n'),
              replacesId: conv.notificationId,
              canReply: false,
              timeoutMs: 8000,
            };
            try {
              const updatedId = await provider.notify(postReplyPayload);
              if (updatedId) {
                conv.notificationId = updatedId;
              }
            } catch (err) {
              console.warn('[NotificationManager] Failed to update notification with reply:', err);
            }
          }
        }
      }
      originalOnReply?.(replyText);
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
      if (convKey) {
        const conv = this.conversations.get(convKey);
        if (conv) {
          conv.notificationId = id;
        }
      }
    }

    return id;
  }

  public async close(id: string | number): Promise<void> {
    const key = String(id);
    const entry = this.activeNotifications.get(key);
    this.activeNotifications.delete(key);

    for (const [cKey, conv] of this.conversations.entries()) {
      if (String(conv.notificationId) === key) {
        this.conversations.delete(cKey);
      }
    }

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
      for (const [cKey, conv] of this.conversations.entries()) {
        if (String(conv.notificationId) === String(item.id)) {
          this.conversations.delete(cKey);
        }
      }
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
    if (accountId) {
      this.conversations.delete(`${accountId}:${target}`);
    } else {
      for (const key of this.conversations.keys()) {
        if (key.endsWith(`:${target}`)) {
          this.conversations.delete(key);
        }
      }
    }
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
    for (const key of this.conversations.keys()) {
      if (key.startsWith(`${accountId}:`)) {
        this.conversations.delete(key);
      }
    }
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
    this.conversations.clear();
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
