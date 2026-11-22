import { app } from 'electron';
import {
  NotificationProvider,
  NotificationPayload,
  NotificationCapabilities,
} from './types';
import { FreedesktopDbusProvider } from './providers/FreedesktopDbusProvider';
import { ElectronNativeProvider } from './providers/ElectronNativeProvider';
import {
  coalesceNotificationMessages,
  formatCoalescedNotificationTitle,
  isSameNotificationMessage,
  normalizeNotificationText,
  getFocusedOrFirstInListAccount,
} from '../../shared/notificationFormatting';
import { state } from '../state';
import { switchActiveAccount } from '../window';

export interface ActiveNotificationAccount {
  accountId: string;
  emoji?: string;
  name?: string;
  tag?: string;
  onAction?: (actionId: string) => void;
  onReply?: (replyText: string) => void;
  onClose?: (reason?: number | string) => void;
}

interface ActiveNotificationEntry {
  id: string | number;
  provider: NotificationProvider;
  tag?: string;
  contactName?: string;
  accountId?: string;
  accounts: ActiveNotificationAccount[];
  body: string;
  lastMessageText: string;
  lastTime: number;
  convKeys: Set<string>;
  accountOrder?: string[];
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
  private recentDismissedMessages: Map<string, number> = new Map();
  private static readonly RECENT_DISMISS_TTL_MS = 10000;
  private static readonly COALESCE_WINDOW_MS = 60000;

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
    const now = Date.now();

    // Clean up expired recent dismissed messages
    for (const [k, t] of this.recentDismissedMessages.entries()) {
      if (now - t > NotificationManager.RECENT_DISMISS_TTL_MS) {
        this.recentDismissedMessages.delete(k);
      }
    }

    const dismissKey = `${normalizeNotificationText(payload.contactName)}::${normalizeNotificationText(payload.body)}`;
    const dismissedAt = this.recentDismissedMessages.get(dismissKey);
    if (dismissedAt && now - dismissedAt < NotificationManager.RECENT_DISMISS_TTL_MS) {
      // Message was recently dismissed across another account; suppress duplicate popup
      return null;
    }

    // Multi-Account Notification Coalescing:
    // If the exact same notification (same chat, same sender & message body) is received across multiple accounts,
    // coalesce them into a single desktop notification alert with all account badges before the ` | `.
    const canCoalesceMulti = payload.coalesceMultiAccount !== false && Boolean(payload.contactName && payload.accountId && payload.body);
    let matchingActiveEntry: ActiveNotificationEntry | null = null;

    if (canCoalesceMulti) {
      for (const entry of this.activeNotifications.values()) {
        if (
          now - entry.lastTime < NotificationManager.COALESCE_WINDOW_MS &&
          isSameNotificationMessage(
            { contactName: entry.contactName, body: entry.lastMessageText, tag: entry.tag },
            { contactName: payload.contactName, body: payload.body, tag: payload.tag }
          )
        ) {
          matchingActiveEntry = entry;
          break;
        }
      }
    }

    if (matchingActiveEntry) {
      const existingAccIndex = matchingActiveEntry.accounts.findIndex((a) => a.accountId === payload.accountId);
      const newAccountData: ActiveNotificationAccount = {
        accountId: payload.accountId!,
        emoji: payload.accountEmoji,
        name: payload.accountName,
        tag: payload.tag,
        onAction: payload.onAction,
        onReply: payload.onReply,
        onClose: payload.onClose,
      };

      if (existingAccIndex === -1) {
        matchingActiveEntry.accounts.push(newAccountData);
      } else {
        matchingActiveEntry.accounts[existingAccIndex] = newAccountData;
      }

      const coalescedTitle = formatCoalescedNotificationTitle(
        matchingActiveEntry.accounts,
        payload.contactName!,
        payload.accountOrder || matchingActiveEntry.accountOrder
      );

      const convKey = `${payload.accountId}:${payload.contactName!.trim().toLowerCase()}`;
      matchingActiveEntry.convKeys.add(convKey);

      let activeConv: ConversationState | undefined;
      for (const existingKey of matchingActiveEntry.convKeys) {
        const c = this.conversations.get(existingKey);
        if (c) {
          activeConv = c;
          break;
        }
      }

      if (activeConv) {
        this.conversations.set(convKey, activeConv);
        activeConv.lastTime = now;
        payload.body = activeConv.messages.join('\n');
      } else {
        const formattedMsg = formatSingleMessage(payload.body, 140);
        const newConv: ConversationState = {
          notificationId: matchingActiveEntry.id,
          messages: [formattedMsg],
          lastTime: now,
        };
        this.conversations.set(convKey, newConv);
        payload.body = formattedMsg;
      }

      const openChatBehavior = payload.multiAccountOpenChatBehavior || state.globalSettings?.multiAccountOpenChatBehavior || 'all';
      const inlineReplyBehavior = payload.multiAccountInlineReplyBehavior || state.globalSettings?.multiAccountInlineReplyBehavior || 'disabled';

      if (inlineReplyBehavior === 'disabled') {
        payload.canReply = false;
      } else {
        payload.canReply = payload.canReply !== false;
      }

      if (openChatBehavior === 'disabled') {
        payload.actions = [];
      } else {
        payload.actions = [{ id: 'default', label: 'Open Chat' }];
      }

      payload.title = coalescedTitle;
      payload.replacesId = matchingActiveEntry.id;
      matchingActiveEntry.lastTime = now;
      matchingActiveEntry.body = payload.body;

      const allAccounts = [...matchingActiveEntry.accounts];
      payload.onAction = (actionId) => {
        if (openChatBehavior === 'disabled') {
          return;
        }

        const activeId = state?.activeAccountId;
        const targetAcc = getFocusedOrFirstInListAccount(
          allAccounts,
          activeId,
          payload.accountOrder || matchingActiveEntry!.accountOrder
        ) || allAccounts[0];

        if (openChatBehavior === 'all') {
          // Open in all accounts (marking all as read, keeping focused/first-in-list account open)
          for (const acc of allAccounts) {
            try {
              acc.onAction?.(actionId);
            } catch (err) {
              console.error('[NotificationManager] Error in coalesced onAction for account:', acc.accountId, err);
            }
          }
          if (state?.mainWindow) {
            if (state.mainWindow.isMinimized()) state.mainWindow.restore();
            state.mainWindow.show();
            state.mainWindow.focus();
          }
          if (targetAcc) {
            switchActiveAccount(targetAcc.accountId);
          }
        } else {
          // 'focused': open in only focused/first-in-list account
          try {
            targetAcc?.onAction?.(actionId);
          } catch (err) {
            console.error('[NotificationManager] Error in coalesced onAction:', err);
          }
        }
      };

      payload.onReply = async (replyText) => {
        if (inlineReplyBehavior === 'disabled') {
          return;
        }

        const activeId = state?.activeAccountId;
        const targetAcc = getFocusedOrFirstInListAccount(
          allAccounts,
          activeId,
          payload.accountOrder || matchingActiveEntry!.accountOrder
        ) || allAccounts[0];

        const trimmed = replyText.trim();
        if (activeConv && trimmed) {
          activeConv.messages.push(`You: ${formatSingleMessage(trimmed, 140)}`);
          activeConv.lastTime = Date.now();
          if (activeConv.notificationId) {
            const postReplyPayload: NotificationPayload = {
              ...payload,
              title: coalescedTitle,
              body: activeConv.messages.join('\n'),
              replacesId: activeConv.notificationId,
              canReply: false,
              timeoutMs: 8000,
            };
            try {
              const updatedId = await provider.notify(postReplyPayload);
              if (updatedId) {
                activeConv.notificationId = updatedId;
                matchingActiveEntry!.id = updatedId;
              }
            } catch (err) {
              console.warn('[NotificationManager] Failed to update coalesced notification with reply:', err);
            }
          }
        }
        targetAcc?.onReply?.(replyText);
      };

      payload.onClose = (reason) => {
        this.activeNotifications.delete(String(matchingActiveEntry!.id));
        for (const k of matchingActiveEntry!.convKeys) {
          this.conversations.delete(k);
        }
        if (payload.contactName && payload.body) {
          this.recentDismissedMessages.set(dismissKey, Date.now());
        }
        for (const acc of allAccounts) {
          acc.onClose?.(reason);
        }
      };

      const updatedId = await provider.notify(payload);
      if (updatedId !== null && updatedId !== undefined && updatedId !== 0) {
        const oldKey = String(matchingActiveEntry.id);
        const newKey = String(updatedId);
        if (oldKey !== newKey) {
          this.activeNotifications.delete(oldKey);
          matchingActiveEntry.id = updatedId;
          this.activeNotifications.set(newKey, matchingActiveEntry);
          if (activeConv) {
            activeConv.notificationId = updatedId;
          }
        }
      }
      return updatedId ?? matchingActiveEntry.id;
    }

    // Android-style notification coalescing:
    // Append messages sequentially on the next line and truncate long individual messages with an ellipsis
    let convKey: string | null = null;
    if (payload.contactName && payload.accountId) {
      convKey = `${payload.accountId}:${payload.contactName.trim().toLowerCase()}`;
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
      if (payload.contactName && payload.body) {
        this.recentDismissedMessages.set(dismissKey, Date.now());
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
      const entry: ActiveNotificationEntry = {
        id,
        provider,
        tag: payload.tag,
        contactName: payload.contactName,
        accountId: payload.accountId,
        accounts: payload.accountId ? [{
          accountId: payload.accountId,
          emoji: payload.accountEmoji,
          name: payload.accountName,
          tag: payload.tag,
          onAction: payload.onAction,
          onReply: payload.onReply,
          onClose: payload.onClose,
        }] : [],
        body: payload.body,
        lastMessageText: payload.body,
        lastTime: now,
        convKeys: convKey ? new Set([convKey]) : new Set(),
        accountOrder: payload.accountOrder,
      };
      this.activeNotifications.set(notifKey, entry);
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
      const matchTag = entry.tag === tag || (entry.accounts && entry.accounts.some((a) => a.tag === tag));
      if (matchTag) {
        toClose.push(entry);
        this.activeNotifications.delete(key);
      }
    }

    for (const item of toClose) {
      if (item.convKeys) {
        for (const k of item.convKeys) {
          this.conversations.delete(k);
        }
      }
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
      const matchAccount = !accountId || !entry.accounts || entry.accounts.length === 0 || entry.accounts.some((a) => a.accountId === accountId);
      const matchContact = entry.contactName && entry.contactName.trim().toLowerCase() === target;
      if (matchAccount && matchContact) {
        toClose.push(entry);
        this.activeNotifications.delete(key);
      }
    }

    for (const item of toClose) {
      if (item.convKeys) {
        for (const k of item.convKeys) {
          this.conversations.delete(k);
        }
      }
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
      const hasAccount = entry.accounts && entry.accounts.length > 0
        ? entry.accounts.some((a) => a.accountId === accountId)
        : entry.accountId === accountId;

      if (hasAccount) {
        if (entry.accounts && entry.accounts.length > 1) {
          // Other accounts are still on this notification; remove this account and re-render title
          entry.accounts = entry.accounts.filter((a) => a.accountId !== accountId);
          const updatedTitle = formatCoalescedNotificationTitle(
            entry.accounts,
            entry.contactName || '',
            entry.accountOrder
          );
          const provider = await this.getPreferredProvider();
          provider.notify({
            title: updatedTitle,
            body: entry.body,
            replacesId: entry.id,
            canReply: true,
          }).catch(() => { });
        } else {
          toClose.push(entry);
          this.activeNotifications.delete(key);
        }
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
    this.recentDismissedMessages.clear();
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
