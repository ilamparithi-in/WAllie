import { BrowserWindow, WebContentsView, Tray } from 'electron';
import { Account, GlobalSettings } from '../shared/types';

export const state = {
  mainWindow: null as BrowserWindow | null,
  tray: null as Tray | null,
  accounts: [] as Account[],
  activeAccountId: '',
  accountViews: new Map<string, WebContentsView>(),
  devtoolsWindows: new Map<string, BrowserWindow>(),
  configuredSessions: new Set<string>(),
  webstoreWindows: new Map<number, string>(),
  globalSettings: null as GlobalSettings | null,
  disclaimerOpen: false,
  protocolPromptOpen: false,
  settingsOpen: false,
  settingsDrawerWidth: 0,
  callWindows: new Set<BrowserWindow>(),
  notificationHistoryCache: null as any[] | null,
  historyFlushTimeout: null as NodeJS.Timeout | null,
  pendingProtocolUrl: null as string | null,
};
