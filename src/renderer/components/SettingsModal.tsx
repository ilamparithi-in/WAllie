import React, { useState, useEffect, useRef } from 'react';
import { X, Puzzle, Palette, Database, Bell, Settings as SettingsIcon, Plus, Shield, ArrowLeft, Users, RotateCw, FolderOpen, User, Trash2 } from 'lucide-react';
import type { AccountInfo, GlobalSettings } from '../../preload';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPage?: PageType;
  initialAccountId?: string;
  onShowDisclaimer: () => void;
}

type PageType = 'main' | 'extensions' | 'css' | 'storage' | 'notifications' | 'general' | 'preload' | 'permissions' | 'accounts';

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, initialPage, initialAccountId, onShowDisclaimer }) => {
  const [activePage, setActivePage] = useState<PageType>('main');
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [showImportDropdown, setShowImportDropdown] = useState<boolean>(false);
  const [webstoreUrlOrId, setWebstoreUrlOrId] = useState<string>('');
  const [isInstallingWebStore, setIsInstallingWebStore] = useState<boolean>(false);

  const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(null);
  const [storageSizes, setStorageSizes] = useState<{
    cache: number;
    localStorage: number;
    indexedDb: number;
    cookies: number;
  } | null>(null);
  const [isLoadingStorage, setIsLoadingStorage] = useState<boolean>(false);
  const [isClearing, setIsClearing] = useState<boolean>(false);
  const [accountsNeedingReload, setAccountsNeedingReload] = useState<string[]>([]);
  const [lastSubPage, setLastSubPage] = useState<PageType | null>(null);

  useEffect(() => {
    if (activePage !== 'main') {
      setLastSubPage(activePage);
    }
  }, [activePage]);

  // Custom CSS live state and debounce ref
  const [customCss, setCustomCss] = useState<string>('');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Notification History state
  const [notificationHistory, setNotificationHistory] = useState<any[]>([]);
  const [notifSearch, setNotifSearch] = useState<string>('');
  const [notifAccountFilter, setNotifAccountFilter] = useState<string>('all');

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  const handleToggleGlobalSetting = async (key: keyof GlobalSettings, value: any) => {
    if (!globalSettings) return;
    if (key === 'extensionDevMode' && value === true) {
      const confirmEnable = window.confirm(
        "Warning: Developer Mode allows loading unpacked extensions from your computer.\n\n" +
        "Only load extensions if you fully trust their source, as they can access your WhatsApp messages and session data.\n\n" +
        "Do you want to enable Developer Mode?"
      );
      if (!confirmEnable) return;
    }
    const updated = { ...globalSettings, [key]: value };
    setStorageSizes(null); // Force recalculation if anything changes
    setGlobalSettings(updated);
    try {
      await window.electronAPI.saveGlobalSettings(updated);
      if (key === 'hardwareAcceleration' && value === false) {
        const confirmRestart = window.confirm(
          "Hardware acceleration has been disabled. A restart is required to apply this change.\n\nDo you want to restart the application now?"
        );
        if (confirmRestart) {
          window.electronAPI.relaunchApp();
        }
      }
    } catch (err) {
      console.error('Failed to save global settings:', err);
    }
  };

  const handleToggleAccountPermission = async (
    permission: 'cameraEnabled' | 'micEnabled' | 'notificationsEnabled' | 'geolocationEnabled' | 'clipboardReadEnabled',
    value: boolean
  ) => {
    if (!selectedAccountId) return;
    const targetAccount = accounts.find((a) => a.id === selectedAccountId);
    if (!targetAccount) return;

    const currentSettings = targetAccount.settings || {
      cameraEnabled: true,
      micEnabled: true,
      notificationsEnabled: true,
      geolocationEnabled: false,
      clipboardReadEnabled: false,
    };

    const updatedSettings = {
      ...currentSettings,
      [permission]: value,
    };

    // Optimistically update local accounts state
    setAccounts((prev) =>
      prev.map((acc) =>
        acc.id === selectedAccountId
          ? { ...acc, settings: updatedSettings }
          : acc
      )
    );

    try {
      await window.electronAPI.updateAccountSettings(selectedAccountId, updatedSettings);
      setAccountsNeedingReload((prev) =>
        prev.includes(selectedAccountId) ? prev : [...prev, selectedAccountId]
      );
    } catch (err) {
      console.error('Failed to update account permission:', err);
    }
  };

  const fetchStorageSizes = (accountId: string) => {
    if (!accountId) return;
    setIsLoadingStorage(true);
    window.electronAPI
      ?.getStorageSizes(accountId)
      .then((sizes) => {
        setStorageSizes(sizes);
      })
      .catch((err) => {
        console.error('Failed to get storage sizes:', err);
      })
      .finally(() => {
        setIsLoadingStorage(false);
      });
  };

  useEffect(() => {
    if (activePage === 'storage' && selectedAccountId) {
      fetchStorageSizes(selectedAccountId);
    }
  }, [activePage, selectedAccountId]);

  const handleClearStorage = async (type: 'cache' | 'media') => {
    if (!selectedAccountId) return;
    setIsClearing(true);
    try {
      const success = await window.electronAPI.clearStorage(selectedAccountId, type);
      if (success) {
        fetchStorageSizes(selectedAccountId);
        setAccountsNeedingReload((prev) =>
          prev.includes(selectedAccountId) ? prev : [...prev, selectedAccountId]
        );
      }
    } catch (err) {
      console.error('Clear storage error:', err);
    } finally {
      setIsClearing(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === undefined || bytes === null || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const selectedAccountIdRef = useRef(selectedAccountId);
  useEffect(() => {
    selectedAccountIdRef.current = selectedAccountId;
  }, [selectedAccountId]);

  useEffect(() => {
    if (selectedAccount) {
      setCustomCss(selectedAccount.settings?.customCss || '');
    }
  }, [selectedAccountId, accounts]);

  const handleCssChange = (newCss: string) => {
    setCustomCss(newCss);
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(async () => {
      if (!selectedAccountId) return;
      const currentTheme = selectedAccount?.settings?.selectedTheme || 'none';
      try {
        await window.electronAPI.saveCss(selectedAccountId, newCss, currentTheme);
        setAccounts((prev) =>
          prev.map((acc) =>
            acc.id === selectedAccountId
              ? { ...acc, settings: { ...acc.settings!, customCss: newCss } }
              : acc
          )
        );
      } catch (err) {
        console.error('Failed to save live CSS override:', err);
      }
    }, 300);
  };

  const handleSelectPresetTheme = async (themeName: string) => {
    if (!selectedAccountId) return;
    try {
      await window.electronAPI.saveCss(selectedAccountId, customCss, themeName);
      setAccounts((prev) =>
        prev.map((acc) =>
          acc.id === selectedAccountId
            ? { ...acc, settings: { ...acc.settings!, selectedTheme: themeName } }
            : acc
        )
      );
    } catch (err) {
      console.error('Failed to save preset theme:', err);
    }
  };

  const handleClearHistory = async () => {
    try {
      await window.electronAPI.clearNotificationHistory();
    } catch (err) {
      console.error('Failed to clear notification logs:', err);
    }
  };

  const filteredNotifications = notificationHistory.filter((notif) => {
    const matchesSearch =
      notif.title.toLowerCase().includes(notifSearch.toLowerCase()) ||
      notif.body.toLowerCase().includes(notifSearch.toLowerCase());
    const matchesAccount = notifAccountFilter === 'all' || notif.accountId === notifAccountFilter;
    return matchesSearch && matchesAccount;
  });

  useEffect(() => {
    if (!isOpen) {
      setActivePage('main');
      return;
    }

    // Fetch accounts and active account on open
    window.electronAPI?.getAccounts().then((accs) => {
      setAccounts(accs);
    });

    window.electronAPI?.getActiveAccountId().then((activeId) => {
      setSelectedAccountId(activeId);
    });

    // Fetch global settings
    window.electronAPI?.getGlobalSettings().then((settings) => {
      setGlobalSettings(settings);
    });

    // Fetch initial notification history
    window.electronAPI?.getNotificationHistory().then((history) => {
      setNotificationHistory(history);
    });

    // Listen for real-time account list changes
    const unsubscribeAccount = window.electronAPI?.onAccountListChanged((updatedAccounts, updatedActiveId) => {
      setAccounts(updatedAccounts);
      // Stay locked onto a valid account if current one got removed
      if (!updatedAccounts.find((a) => a.id === selectedAccountIdRef.current)) {
        setSelectedAccountId(updatedActiveId);
      }
    });

    // Listen for notification log changes
    const unsubscribeHistory = window.electronAPI?.onNotificationHistoryChanged((updatedHistory) => {
      setNotificationHistory(updatedHistory);
    });

    return () => {
      unsubscribeAccount?.();
      unsubscribeHistory?.();
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      if (initialPage) {
        setActivePage(initialPage);
      }
      if (initialAccountId) {
        setSelectedAccountId(initialAccountId);
      }
    }
  }, [isOpen, initialPage, initialAccountId]);

  const extensions = selectedAccount?.extensions || [];

  const handleImportExtension = async (importType: 'folder' | 'archive') => {
    if (!selectedAccountId) return;
    setIsImporting(true);
    try {
      await window.electronAPI.importExtension(selectedAccountId, importType);
    } catch (err) {
      console.error('Import extension error:', err);
    } finally {
      setIsImporting(false);
    }
  };

  const handleToggleExtension = async (extId: string, enabled: boolean) => {
    if (!selectedAccountId) return;
    try {
      await window.electronAPI.toggleExtension(selectedAccountId, extId, enabled);
    } catch (err) {
      console.error('Toggle extension error:', err);
    }
  };

  const handleRemoveExtension = async (extId: string) => {
    if (!selectedAccountId) return;
    try {
      await window.electronAPI.removeExtension(selectedAccountId, extId);
    } catch (err) {
      console.error('Remove extension error:', err);
    }
  };

  const handleDeleteAccount = async (id: string) => {
    try {
      await window.electronAPI.removeAccount(id);
    } catch (err) {
      console.error('Failed to remove account:', err);
    }
  };

  const handleBrowseWebStore = () => {
    if (!selectedAccountId) return;
    window.electronAPI?.openWebStore(selectedAccountId);
  };

  const handleInstallWebStoreExtension = async () => {
    if (!selectedAccountId || !webstoreUrlOrId.trim()) return;
    setIsInstallingWebStore(true);
    try {
      await window.electronAPI?.installWebStoreExtension(selectedAccountId, webstoreUrlOrId.trim());
      setWebstoreUrlOrId('');
    } catch (err) {
      console.error('Install webstore extension error:', err);
    } finally {
      setIsInstallingWebStore(false);
    }
  };

  return (
    <div
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      className={`fixed top-[28px] right-0 bottom-0 z-50 w-[450px] bg-[#111b21] border-l border-[#222d34] shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out select-text ${
        isOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
      }`}
    >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#222d34] bg-[#202c33] flex-shrink-0">
          {activePage === 'main' ? (
            <div className="flex items-center gap-2 text-[#e9edef] font-medium text-sm">
              <SettingsIcon className="w-4 h-4 text-[#00a884]" />
              <span>Application Settings</span>
            </div>
          ) : (
            <button
              onClick={() => setActivePage('main')}
              className="flex items-center gap-2 text-[#00a884] font-medium text-sm hover:text-[#00c298] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-[#e9edef] font-semibold text-xs">
                {activePage === 'general' && 'General Settings'}
                {activePage === 'preload' && 'Accounts to load on launch'}
                {activePage === 'permissions' && 'Browser permissions'}
                {activePage === 'extensions' && 'Chrome Extensions'}
                {activePage === 'css' && 'Custom CSS & Themes'}
                {activePage === 'storage' && 'Storage & Cache'}
                {activePage === 'notifications' && 'Notification History'}
                {activePage === 'accounts' && 'Manage Accounts'}
              </span>
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[#111b21] text-[#8696a0] hover:text-[#e9edef] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body / Drawer Content */}
        <div className="flex-grow relative overflow-hidden bg-[#111b21]">
          {/* Main Menu Page */}
          <div className={`absolute inset-0 p-4 overflow-y-auto transition-transform duration-300 ease-in-out flex flex-col ${
            activePage === 'main' ? 'translate-x-0' : '-translate-x-full pointer-events-none'
          }`}>
            <div className="flex flex-col space-y-2 select-text pb-4">
              <button
                onClick={() => setActivePage('accounts')}
                className="flex items-center gap-3.5 p-3 rounded-lg bg-[#182229] border border-[#222d34] hover:bg-[#202c33] hover:border-[#374248] text-left transition-all"
              >
                <div className="w-8 h-8 rounded-full bg-[#202c33] flex items-center justify-center text-[#00a884] flex-shrink-0">
                  <User className="w-4 h-4" />
                </div>
                <div className="flex-grow min-w-0">
                  <div className="font-semibold text-[#e9edef] text-[12px]">Manage Accounts</div>
                  <div className="text-[10px] text-[#8696a0] mt-0.5">Customize account names and emojis</div>
                </div>
              </button>

              <button
                onClick={() => setActivePage('general')}
                className="flex items-center gap-3.5 p-3 rounded-lg bg-[#182229] border border-[#222d34] hover:bg-[#202c33] hover:border-[#374248] text-left transition-all"
              >
                <div className="w-8 h-8 rounded-full bg-[#202c33] flex items-center justify-center text-[#00a884] flex-shrink-0">
                  <SettingsIcon className="w-4 h-4" />
                </div>
                <div className="flex-grow min-w-0">
                  <div className="font-semibold text-[#e9edef] text-[12px]">General Settings</div>
                  <div className="text-[10px] text-[#8696a0] mt-0.5">Tray settings and GPU hardware acceleration</div>
                </div>
              </button>

              <button
                onClick={() => setActivePage('preload')}
                className="flex items-center gap-3.5 p-3 rounded-lg bg-[#182229] border border-[#222d34] hover:bg-[#202c33] hover:border-[#374248] text-left transition-all"
              >
                <div className="w-8 h-8 rounded-full bg-[#202c33] flex items-center justify-center text-[#00a884] flex-shrink-0">
                  <Users className="w-4 h-4" />
                </div>
                <div className="flex-grow min-w-0">
                  <div className="font-semibold text-[#e9edef] text-[12px]">Accounts to load on launch</div>
                  <div className="text-[10px] text-[#8696a0] mt-0.5">Select which accounts get preloaded in the background</div>
                </div>
              </button>

              <button
                onClick={() => setActivePage('permissions')}
                className="flex items-center gap-3.5 p-3 rounded-lg bg-[#182229] border border-[#222d34] hover:bg-[#202c33] hover:border-[#374248] text-left transition-all"
              >
                <div className="w-8 h-8 rounded-full bg-[#202c33] flex items-center justify-center text-[#00a884] flex-shrink-0">
                  <Shield className="w-4 h-4" />
                </div>
                <div className="flex-grow min-w-0">
                  <div className="font-semibold text-[#e9edef] text-[12px]">Browser permissions</div>
                  <div className="text-[10px] text-[#8696a0] mt-0.5">Manage camera, mic, notifications, geolocation, and clipboard access</div>
                </div>
              </button>

              <button
                onClick={() => setActivePage('extensions')}
                className="flex items-center gap-3.5 p-3 rounded-lg bg-[#182229] border border-[#222d34] hover:bg-[#202c33] hover:border-[#374248] text-left transition-all"
              >
                <div className="w-8 h-8 rounded-full bg-[#202c33] flex items-center justify-center text-[#00a884] flex-shrink-0">
                  <Puzzle className="w-4 h-4" />
                </div>
                <div className="flex-grow min-w-0">
                  <div className="font-semibold text-[#e9edef] text-[12px]">Chrome Extensions</div>
                  <div className="text-[10px] text-[#8696a0] mt-0.5">Manage helper extensions and plugins</div>
                </div>
              </button>

              <button
                onClick={() => setActivePage('css')}
                className="flex items-center gap-3.5 p-3 rounded-lg bg-[#182229] border border-[#222d34] hover:bg-[#202c33] hover:border-[#374248] text-left transition-all"
              >
                <div className="w-8 h-8 rounded-full bg-[#202c33] flex items-center justify-center text-[#00a884] flex-shrink-0">
                  <Palette className="w-4 h-4" />
                </div>
                <div className="flex-grow min-w-0">
                  <div className="font-semibold text-[#e9edef] text-[12px]">Custom CSS & Themes</div>
                  <div className="text-[10px] text-[#8696a0] mt-0.5">Select preset themes or write custom CSS</div>
                </div>
              </button>

              <button
                onClick={() => setActivePage('storage')}
                className="flex items-center gap-3.5 p-3 rounded-lg bg-[#182229] border border-[#222d34] hover:bg-[#202c33] hover:border-[#374248] text-left transition-all"
              >
                <div className="w-8 h-8 rounded-full bg-[#202c33] flex items-center justify-center text-[#00a884] flex-shrink-0">
                  <Database className="w-4 h-4" />
                </div>
                <div className="flex-grow min-w-0">
                  <div className="font-semibold text-[#e9edef] text-[12px]">Storage & Cache</div>
                  <div className="text-[10px] text-[#8696a0] mt-0.5">Inspect sizes, clear browser media or cache</div>
                </div>
              </button>

              <button
                onClick={() => setActivePage('notifications')}
                className="flex items-center gap-3.5 p-3 rounded-lg bg-[#182229] border border-[#222d34] hover:bg-[#202c33] hover:border-[#374248] text-left transition-all"
              >
                <div className="w-8 h-8 rounded-full bg-[#202c33] flex items-center justify-center text-[#00a884] flex-shrink-0">
                  <Bell className="w-4 h-4" />
                </div>
                <div className="flex-grow min-w-0">
                  <div className="font-semibold text-[#e9edef] text-[12px]">Notification History</div>
                  <div className="text-[10px] text-[#8696a0] mt-0.5">View and search desktop alert logs</div>
                </div>
              </button>

              {/* About Section */}
              <div className="mt-6 pt-4 border-t border-[#222d34]/60 text-center select-text">
                <div className="text-sm font-bold text-[#e9edef] tracking-wide">WAllie</div>
                <div className="text-[10px] text-[#8696a0] mt-1 leading-normal max-w-[320px] mx-auto">
                  Electron-based WhatsApp Client for Linux with Multi-account and Extensions Support
                </div>
                <div className="text-[9px] text-[#8696a0] mt-1">
                  Version 1.0.0 • MIT License • By Ilamparithi M
                </div>
                <div className="mt-1.5">
                  <button
                    onClick={onShowDisclaimer}
                    className="text-[#00a884] hover:text-[#00c298] transition-colors underline font-medium text-[10px] cursor-pointer bg-transparent border-none p-0 outline-none"
                  >
                    View Legal Disclaimer
                  </button>
                </div>
                <div className="flex items-center justify-center gap-3 mt-3">
                  <a
                    href="https://github.com/ilamparithi-in/WAllie"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#00a884] hover:text-[#00c298] transition-colors underline font-medium text-[11px]"
                  >
                    Leave a star! ⭐
                  </a>
                  <span className="text-[#374248]">•</span>
                  <a
                    href="https://pseudosmp.github.io/donate"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#00a884] hover:text-[#00c298] transition-colors underline font-medium text-[11px]"
                  >
                    Donate 💖
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Details Sub-pages Container */}
          <div className={`absolute inset-0 p-4 overflow-y-auto transition-transform duration-300 ease-in-out bg-[#111b21] ${
            activePage !== 'main' ? 'translate-x-0' : 'translate-x-full pointer-events-none'
          }`}>
            {(() => {
              const subPage = activePage !== 'main' ? activePage : lastSubPage;
              return (
                <>
                  {subPage === 'general' && (
              <div className="space-y-5 subpage-animate">
                {/* Global Behavior Settings */}
                <div>
                  <h3 className="text-sm font-semibold text-[#e9edef] border-b border-[#222d34] pb-2 flex items-center gap-1.5">
                    <SettingsIcon className="w-4 h-4 text-[#00a884]" />
                    <span>General Settings</span>
                  </h3>
                  <p className="text-[11px] text-[#8696a0] mt-2 mb-4 leading-relaxed">
                    Configure global behavior, system tray preferences, and hardware acceleration.
                  </p>
                  <div className="mt-2 space-y-2">
                    <label className="flex items-center justify-between cursor-pointer p-2 rounded hover:bg-[#182229] transition-colors">
                      <div>
                        <div className="font-medium text-[#e9edef]">Close to System Tray</div>
                        <div className="text-[11px] text-[#8696a0]">
                          Keep app running in background tray icon mode on close
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={globalSettings?.closeToTray ?? true}
                        onChange={(e) => handleToggleGlobalSetting('closeToTray', e.target.checked)}
                        className="accent-[#00a884]"
                      />
                    </label>

                    <label className="flex items-center justify-between cursor-pointer p-2 rounded hover:bg-[#182229] transition-colors">
                      <div>
                        <div className="font-medium text-[#e9edef]">Start Minimized</div>
                        <div className="text-[11px] text-[#8696a0]">
                          Start application minimized to the system tray on launch
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={globalSettings?.startMinimized ?? false}
                        onChange={(e) => handleToggleGlobalSetting('startMinimized', e.target.checked)}
                        className="accent-[#00a884]"
                      />
                    </label>

                    <label className="flex items-center justify-between cursor-pointer p-2 rounded hover:bg-[#182229] transition-colors">
                      <div>
                        <div className="font-medium text-[#e9edef]">Hardware Acceleration</div>
                        <div className="text-[11px] text-[#8696a0]">
                          Use GPU acceleration (requires restart to apply)
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={globalSettings?.hardwareAcceleration ?? true}
                        onChange={(e) => handleToggleGlobalSetting('hardwareAcceleration', e.target.checked)}
                        className="accent-[#00a884]"
                      />
                    </label>

                    <label className="flex items-center justify-between cursor-pointer p-2 rounded hover:bg-[#182229] transition-colors">
                      <div>
                        <div className="font-medium text-[#e9edef]">Show Developer Tools Toggle</div>
                        <div className="text-[11px] text-[#8696a0]">
                          Show a code icon in the titlebar to toggle developer tools for WhatsApp Web
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={globalSettings?.showDevToolsToggle ?? false}
                        onChange={(e) => handleToggleGlobalSetting('showDevToolsToggle', e.target.checked)}
                        className="accent-[#00a884]"
                      />
                    </label>

                    <label className="flex items-center justify-between cursor-pointer p-2 rounded hover:bg-[#182229] transition-colors">
                      <div>
                        <div className="font-medium text-[#e9edef]">Enable Notification Logging</div>
                        <div className="text-[11px] text-[#8696a0]">
                          Log desktop notifications, message edits, and deletions to history (disabled by default)
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={globalSettings?.notificationLoggingEnabled ?? false}
                        onChange={(e) => handleToggleGlobalSetting('notificationLoggingEnabled', e.target.checked)}
                        className="accent-[#00a884]"
                      />
                    </label>
                  </div>
                </div>


              </div>
            )}

            {subPage === 'preload' && (
              <div className="space-y-5 subpage-animate">
                <div>
                  <h3 className="text-sm font-semibold text-[#e9edef] border-b border-[#222d34] pb-2 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-[#00a884]" />
                    <span>Accounts to load on launch</span>
                  </h3>
                  <p className="text-[11px] text-[#8696a0] mt-2 mb-4 leading-relaxed">
                    Select which WhatsApp accounts should preload in the background when the application starts.
                    Preloading allows you to receive instant notifications without opening each account manually.
                  </p>

                  {accounts.length === 0 ? (
                    <div className="text-center py-6 text-[#8696a0] bg-[#182229] border border-[#222d34] rounded-lg">
                      No accounts added yet.
                    </div>
                  ) : (
                    <div className="bg-[#182229] border border-[#222d34] rounded-lg divide-y divide-[#222d34]/60">
                      {accounts.map((acc) => {
                        const isPreloaded = globalSettings?.preloadAccountIds
                          ? globalSettings.preloadAccountIds.includes(acc.id)
                          : acc.id === 'acc_default';
                        return (
                          <label
                            key={acc.id}
                            className="flex items-center justify-between cursor-pointer p-3 hover:bg-[#202c33]/50 transition-colors"
                          >
                            <div className="flex flex-col min-w-0 pr-4">
                              <span className="font-medium text-[#e9edef] text-[12px] truncate">
                                {acc.emoji ? `${acc.emoji} ` : ''}{acc.name}
                              </span>
                              <span className="text-[10px] text-[#8696a0] truncate mt-0.5">
                                {acc.id}
                              </span>
                            </div>
                            <input
                              type="checkbox"
                              checked={isPreloaded}
                              onChange={(e) => {
                                if (!globalSettings) return;
                                const currentIds = globalSettings.preloadAccountIds || ['acc_default'];
                                const updatedIds = e.target.checked
                                  ? [...currentIds, acc.id]
                                  : currentIds.filter((id) => id !== acc.id);
                                handleToggleGlobalSetting('preloadAccountIds', updatedIds);
                              }}
                              className="accent-[#00a884] w-4 h-4 cursor-pointer"
                            />
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {subPage === 'accounts' && (
              <div className="space-y-5 subpage-animate">
                <div>
                  <h3 className="text-sm font-semibold text-[#e9edef] border-b border-[#222d34] pb-2 flex items-center gap-1.5">
                    <User className="w-4 h-4 text-[#00a884]" />
                    <span>Manage Accounts</span>
                  </h3>
                  <p className="text-[11px] text-[#8696a0] mt-2 mb-4 leading-relaxed">
                    Set custom names and emojis, configure startup preloading, delete accounts, or jump to profile-specific settings.
                  </p>

                  <div className="space-y-3">
                    {accounts.map((acc) => (
                      <div key={acc.id} className="p-3 bg-[#182229] border border-[#222d34] rounded-lg space-y-3">
                        {/* Row 1: Name and Emoji inputs */}
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <span className="font-semibold text-xs text-[#e9edef] block truncate">
                              {acc.emoji ? `${acc.emoji} ` : ''}{acc.name}
                            </span>
                            <span className="text-[10px] text-[#8696a0] block truncate">{acc.id}</span>
                          </div>
                          
                          {/* Name Input */}
                          <input
                            type="text"
                            value={acc.name}
                            onChange={async (e) => {
                              const newName = e.target.value;
                              setAccounts(prev => prev.map(a => a.id === acc.id ? { ...a, name: newName } : a));
                              await window.electronAPI.renameAccount(acc.id, newName);
                            }}
                            placeholder="Account Name"
                            className="bg-[#202c33] text-[#e9edef] px-2 py-1 rounded border border-[#222d34] text-[11px] outline-none focus:border-[#00a884] w-28"
                          />
                        </div>

                        <div className="flex items-center gap-2 pt-2 border-t border-[#222d34]/60">
                          <span className="text-[11px] text-[#8696a0]">Emoji:</span>
                          
                          {/* Emoji Input */}
                          <input
                            type="text"
                            value={acc.emoji || ''}
                            onChange={async (e) => {
                              const emoji = e.target.value;
                              setAccounts(prev => prev.map(a => a.id === acc.id ? { ...a, emoji } : a));
                              await window.electronAPI.updateAccountEmoji(acc.id, emoji);
                            }}
                            placeholder="Emoji"
                            maxLength={8}
                            className="bg-[#202c33] text-[#e9edef] px-2 py-1 rounded border border-[#222d34] text-[11px] outline-none focus:border-[#00a884] w-14 text-center"
                          />

                          {/* Quick Emoji selection */}
                          <div className="flex gap-1 overflow-x-auto no-scrollbar">
                            {['💬', '🏢', '🏠', '👥', '💼', '🔔', '🚀', '🟢', '🔵', '🔴'].map(em => (
                              <button
                                key={em}
                                onClick={async () => {
                                  setAccounts(prev => prev.map(a => a.id === acc.id ? { ...a, emoji: em } : a));
                                  await window.electronAPI.updateAccountEmoji(acc.id, em);
                                }}
                                className={`text-[12px] p-1 rounded hover:bg-[#202c33] transition-colors ${acc.emoji === em ? 'bg-[#202c33] border border-[#00a884]/40' : ''}`}
                              >
                                {em}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Row 2: Action Buttons */}
                        <div className="flex items-center gap-1.5 pt-2 border-t border-[#222d34]/60">
                          <span className="text-[10px] text-[#8696a0] mr-1">Actions:</span>
                          <button
                            onClick={() => handleDeleteAccount(acc.id)}
                            disabled={accounts.length <= 1}
                            className={`p-1.5 rounded hover:bg-[#202c33] transition-colors ${
                              accounts.length <= 1 ? 'text-[#374248] cursor-not-allowed' : 'text-[#ea4335] hover:text-[#ff5c4c]'
                            }`}
                            title={accounts.length <= 1 ? "Cannot delete the last remaining account" : "Delete Account"}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedAccountId(acc.id);
                              setActivePage('storage');
                            }}
                            className="p-1.5 rounded hover:bg-[#202c33] text-[#8696a0] hover:text-[#00a884] transition-colors"
                            title="Storage Usage"
                          >
                            <Database className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedAccountId(acc.id);
                              setActivePage('permissions');
                            }}
                            className="p-1.5 rounded hover:bg-[#202c33] text-[#8696a0] hover:text-[#00a884] transition-colors"
                            title="Browser Permissions"
                          >
                            <Shield className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedAccountId(acc.id);
                              setActivePage('extensions');
                            }}
                            className="p-1.5 rounded hover:bg-[#202c33] text-[#8696a0] hover:text-[#00a884] transition-colors"
                            title="Chrome Extensions"
                          >
                            <Puzzle className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedAccountId(acc.id);
                              setActivePage('css');
                            }}
                            className="p-1.5 rounded hover:bg-[#202c33] text-[#8696a0] hover:text-[#00a884] transition-colors"
                            title="Custom CSS / Theme"
                          >
                            <Palette className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedAccountId(acc.id);
                              setNotifAccountFilter(acc.id);
                              setActivePage('notifications');
                            }}
                            className="p-1.5 rounded hover:bg-[#202c33] text-[#8696a0] hover:text-[#00a884] transition-colors"
                            title="Notification History"
                          >
                            <Bell className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Row 3: Load account on launch checkbox */}
                        <div className="flex items-center justify-between pt-2 border-t border-[#222d34]/60">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={
                                globalSettings?.preloadAccountIds
                                  ? globalSettings.preloadAccountIds.includes(acc.id)
                                  : acc.id === 'acc_default'
                              }
                              onChange={(e) => {
                                if (!globalSettings) return;
                                const currentIds = globalSettings.preloadAccountIds || ['acc_default'];
                                const updatedIds = e.target.checked
                                  ? [...currentIds, acc.id]
                                  : currentIds.filter((id) => id !== acc.id);
                                handleToggleGlobalSetting('preloadAccountIds', updatedIds);
                              }}
                              className="accent-[#00a884] w-3.5 h-3.5 cursor-pointer rounded"
                            />
                            <span className="text-[11px] text-[#e9edef] font-medium">Load account on launch</span>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {subPage === 'permissions' && (
              <div className="space-y-4 subpage-animate">
                <div>
                  <h3 className="text-sm font-semibold text-[#e9edef] border-b border-[#222d34] pb-2 flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-[#00a884]" />
                    <span>Browser permissions</span>
                  </h3>
                  <p className="text-[11px] text-[#8696a0] mt-2 mb-4 leading-relaxed">
                    Configure web feature permissions for each account. Disabling unused permissions prevents scripts from accessing sensitive resources.
                  </p>
                </div>

                {/* Unified Account Selector Banner */}
                <div className="flex items-center justify-between p-3 bg-[#182229] border border-[#222d34] rounded-lg">
                  <span className="font-semibold text-xs text-[#e9edef]">Target Account:</span>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="bg-[#202c33] text-[#e9edef] px-3 py-1.5 rounded border border-[#222d34] text-[11px] outline-none focus:border-[#00a884] cursor-pointer font-medium"
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.emoji ? `${acc.emoji} ` : ''}{acc.name}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedAccount && (
                  <div className="p-3 bg-[#182229] border border-[#222d34] rounded-lg space-y-3">
                    <div className="space-y-3">
                      <label className="flex items-center justify-between cursor-pointer p-1.5 rounded hover:bg-[#202c33]/40 transition-colors">
                        <div>
                          <div className="font-medium text-[#e9edef] text-[11px]">Push Notifications</div>
                          <div className="text-[10px] text-[#8696a0] mt-0.5">Allow WhatsApp to show desktop notifications</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={selectedAccount.settings?.notificationsEnabled ?? true}
                          onChange={(e) => handleToggleAccountPermission('notificationsEnabled', e.target.checked)}
                          className="accent-[#00a884] w-4 h-4 cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between cursor-pointer p-1.5 rounded hover:bg-[#202c33]/40 transition-colors">
                        <div>
                          <div className="font-medium text-[#e9edef] text-[11px]">Camera Access</div>
                          <div className="text-[10px] text-[#8696a0] mt-0.5">Allow video capture for video calls</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={selectedAccount.settings?.cameraEnabled ?? true}
                          onChange={(e) => handleToggleAccountPermission('cameraEnabled', e.target.checked)}
                          className="accent-[#00a884] w-4 h-4 cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between cursor-pointer p-1.5 rounded hover:bg-[#202c33]/40 transition-colors">
                        <div>
                          <div className="font-medium text-[#e9edef] text-[11px]">Microphone Access</div>
                          <div className="text-[10px] text-[#8696a0] mt-0.5">Allow audio capture for voice calls</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={selectedAccount.settings?.micEnabled ?? true}
                          onChange={(e) => handleToggleAccountPermission('micEnabled', e.target.checked)}
                          className="accent-[#00a884] w-4 h-4 cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between cursor-pointer p-1.5 rounded hover:bg-[#202c33]/40 transition-colors">
                        <div>
                          <div className="font-medium text-[#e9edef] text-[11px]">Geolocation Access</div>
                          <div className="text-[10px] text-[#8696a0] mt-0.5">Allow sharing current location inside chats</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={selectedAccount.settings?.geolocationEnabled ?? false}
                          onChange={(e) => handleToggleAccountPermission('geolocationEnabled', e.target.checked)}
                          className="accent-[#00a884] w-4 h-4 cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between cursor-pointer p-1.5 rounded hover:bg-[#202c33]/40 transition-colors">
                        <div>
                          <div className="font-medium text-[#e9edef] text-[11px]">Clipboard Access (Read)</div>
                          <div className="text-[10px] text-[#8696a0] mt-0.5">Allow pages to read text and files from your system clipboard</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={selectedAccount.settings?.clipboardReadEnabled ?? false}
                          onChange={(e) => handleToggleAccountPermission('clipboardReadEnabled', e.target.checked)}
                          className="accent-[#00a884] w-4 h-4 cursor-pointer"
                        />
                      </label>

                      <div className="text-[10px] text-[#8696a0] italic text-center pt-2 border-t border-[#222d34]/60">
                        * Toggling browser permissions reloads the account webview to apply changes.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {subPage === 'extensions' && (
              <div className="flex flex-col h-full space-y-4 subpage-animate">
                <div className="flex-shrink-0">
                  <h3 className="text-sm font-semibold text-[#e9edef] border-b border-[#222d34] pb-2 flex items-center gap-1.5">
                    <Puzzle className="w-4 h-4 text-[#00a884]" />
                    <span>Chrome Extensions</span>
                  </h3>
                  <p className="text-[11px] text-[#8696a0] mt-2 mb-3 leading-relaxed">
                    Manage helper extensions, load unpacked directories, or install directly from the Chrome Web Store.
                  </p>
                </div>

                {/* Unified Account Selector Banner */}
                <div className="flex items-center justify-between p-3 bg-[#182229] border border-[#222d34] rounded-lg mb-4 flex-shrink-0 relative">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-[#e9edef]">Target Account:</span>
                      <select
                        value={selectedAccountId}
                        onChange={(e) => setSelectedAccountId(e.target.value)}
                        className="bg-[#202c33] text-[#e9edef] px-3 py-1.5 rounded border border-[#222d34] text-[11px] outline-none focus:border-[#00a884] cursor-pointer font-medium"
                      >
                        {accounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.emoji ? `${acc.emoji} ` : ''}{acc.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-[#e9edef]">Developer Mode:</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={globalSettings?.extensionDevMode ?? false}
                          onChange={() => handleToggleGlobalSetting('extensionDevMode', !(globalSettings?.extensionDevMode))}
                          className="sr-only peer"
                        />
                        <div className="w-7 h-4 bg-[#202c33] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#8696a0] after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#00a884] peer-checked:after:bg-[#111b21] peer-checked:after:border-[#00a884]"></div>
                      </label>
                    </div>
                  </div>

                  {globalSettings?.extensionDevMode && (
                    <div className="relative">
                      <button
                        onClick={() => setShowImportDropdown(!showImportDropdown)}
                        disabled={isImporting || !selectedAccountId}
                        className="flex items-center justify-center p-2 bg-[#00a884] text-[#111b21] hover:bg-[#00c298] disabled:opacity-50 rounded transition-colors"
                        title="Import Local Extension (Folder, ZIP, or CRX)"
                      >
                        <FolderOpen className="w-4 h-4" />
                      </button>

                      {showImportDropdown && (
                        <>
                          <div
                            className="fixed inset-0 z-40"
                            onClick={() => setShowImportDropdown(false)}
                          />
                          <div className="absolute right-0 mt-1 w-44 bg-[#202c33] border border-[#374248] rounded shadow-xl z-50 text-[11px] py-1">
                            <button
                              onClick={() => {
                                setShowImportDropdown(false);
                                handleImportExtension('folder');
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-[#182229] text-[#e9edef] transition-colors"
                            >
                              Unpacked Folder...
                            </button>
                            <button
                              onClick={() => {
                                setShowImportDropdown(false);
                                handleImportExtension('archive');
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-[#182229] text-[#e9edef] transition-colors"
                            >
                              ZIP / CRX File...
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Chrome Web Store Installer Card */}
                <div className="mb-4 bg-[#182229] border border-[#222d34] rounded-lg p-3 flex-shrink-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-xs text-[#e9edef]">Chrome Web Store</div>
                    <button
                      onClick={handleBrowseWebStore}
                      disabled={!selectedAccountId}
                      className="text-[#00a884] hover:text-[#00c298] disabled:opacity-50 text-[10px] font-bold transition-colors flex items-center gap-1"
                    >
                      <Puzzle className="w-3 h-3" />
                      <span>Browse Web Store...</span>
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Paste Chrome Web Store URL or 32-character Extension ID..."
                      value={webstoreUrlOrId}
                      onChange={(e) => setWebstoreUrlOrId(e.target.value)}
                      disabled={isInstallingWebStore || !selectedAccountId}
                      className="flex-1 bg-[#202c33] text-[#e9edef] px-3 py-1.5 rounded border border-[#222d34] text-[11px] outline-none focus:border-[#00a884] disabled:opacity-50"
                    />
                    <button
                      onClick={handleInstallWebStoreExtension}
                      disabled={isInstallingWebStore || !webstoreUrlOrId.trim() || !selectedAccountId}
                      className="px-3 py-1.5 bg-[#00a884] text-[#111b21] hover:bg-[#00c298] disabled:opacity-50 font-bold rounded transition-colors text-[11px]"
                    >
                      {isInstallingWebStore ? 'Installing...' : 'Install'}
                    </button>
                  </div>
                </div>

                {/* Extensions List */}
                <div className="flex-1 overflow-y-auto space-y-2">
                  {extensions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center text-[#8696a0]">
                      <Puzzle className="w-12 h-12 mb-3 text-[#202c33]" />
                      <p className="font-medium text-[#d1d7db] mb-1">No Extensions Loaded</p>
                      <p className="text-[11px] max-w-[320px] leading-relaxed">
                        Import unpacked directories, ZIP archives, or CRX packages to run helper extensions (e.g. privacy sheets, message backup tools) in this session.
                      </p>
                    </div>
                  ) : (
                    extensions.map((ext) => (
                      <div
                        key={ext.id}
                        className="flex items-center justify-between p-3 bg-[#182229] border border-[#222d34] rounded-lg hover:border-[#374248] transition-colors"
                      >
                        <div className="flex items-start gap-3 min-w-0 flex-1 mr-4">
                          <div className="w-8 h-8 rounded bg-[#202c33] flex items-center justify-center text-[#00a884] flex-shrink-0">
                            <Puzzle className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-xs text-[#e9edef] truncate flex items-center gap-1.5">
                              {ext.name}
                              {ext.source === 'webstore' ? (
                                <span className="text-[9px] bg-[#00a884]/15 text-[#00a884] border border-[#00a884]/20 px-1.5 py-0.5 rounded font-semibold select-none">
                                  Web Store
                                </span>
                              ) : (
                                <span className="text-[9px] bg-[#eab308]/15 text-[#eab308] border border-[#eab308]/20 px-1.5 py-0.5 rounded font-semibold select-none">
                                  Developer
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-[#8696a0] mt-0.5 flex items-center gap-2">
                              <span>v{ext.version}</span>
                              <span className="text-[#374248]">•</span>
                              <span
                                className="truncate max-w-[120px] font-mono text-[9px] bg-[#111b21] px-1 py-0.5 rounded"
                                title={globalSettings?.extensionDevMode ? ext.path : undefined}
                              >
                                ID: {ext.id}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3.5">
                          {/* Toggle switch */}
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={ext.enabled}
                              onChange={() => handleToggleExtension(ext.id, !ext.enabled)}
                              className="sr-only peer"
                            />
                            <div className="w-7 h-4 bg-[#202c33] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#8696a0] after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#00a884] peer-checked:after:bg-[#111b21] peer-checked:after:border-[#00a884]"></div>
                          </label>
                          {/* Remove button */}
                          <button
                            onClick={() => handleRemoveExtension(ext.id)}
                            className="p-1.5 rounded hover:bg-[#202c33] text-[#8696a0] hover:text-[#ea4335] transition-colors"
                            title="Delete extension"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {subPage === 'css' && (
              <div className="flex flex-col h-full space-y-4 subpage-animate">
                <div className="flex-shrink-0">
                  <h3 className="text-sm font-semibold text-[#e9edef] border-b border-[#222d34] pb-2 flex items-center gap-1.5">
                    <Palette className="w-4 h-4 text-[#00a884]" />
                    <span>Custom CSS & Themes</span>
                  </h3>
                  <p className="text-[11px] text-[#8696a0] mt-2 mb-3 leading-relaxed">
                    Inject custom stylesheets or select preset themes to customize the appearance of each account.
                  </p>
                </div>

                {/* Unified Account Selector Banner */}
                <div className="flex items-center justify-between p-3 bg-[#182229] border border-[#222d34] rounded-lg mb-4 flex-shrink-0">
                  <span className="font-semibold text-xs text-[#e9edef]">Target Account:</span>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="bg-[#202c33] text-[#e9edef] px-3 py-1.5 rounded border border-[#222d34] text-[11px] outline-none focus:border-[#00a884] cursor-pointer font-medium"
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.emoji ? `${acc.emoji} ` : ''}{acc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex-shrink-0 space-y-2">
                  <div className="text-[11px] font-semibold text-[#e9edef]">Preset Themes</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSelectPresetTheme('none')}
                      className={`px-3 py-1.5 rounded text-[10px] font-semibold transition-colors border \${
                        selectedAccount?.settings?.selectedTheme === 'none' || !selectedAccount?.settings?.selectedTheme
                          ? 'bg-[#00a884] text-[#111b21] border-[#00a884]'
                          : 'bg-[#202c33] text-[#aebac1] border-[#222d34] hover:bg-[#2a3942]'
                      }`}
                    >
                      Default Theme
                    </button>
                    <button
                      onClick={() => handleSelectPresetTheme('oled')}
                      className={`px-3 py-1.5 rounded text-[10px] font-semibold transition-colors border \${
                        selectedAccount?.settings?.selectedTheme === 'oled'
                          ? 'bg-[#00a884] text-[#111b21] border-[#00a884]'
                          : 'bg-[#202c33] text-[#aebac1] border-[#222d34] hover:bg-[#2a3942]'
                      }`}
                    >
                      OLED Dark
                    </button>
                    <button
                      onClick={() => handleSelectPresetTheme('compact')}
                      className={`px-3 py-1.5 rounded text-[10px] font-semibold transition-colors border \${
                        selectedAccount?.settings?.selectedTheme === 'compact'
                          ? 'bg-[#00a884] text-[#111b21] border-[#00a884]'
                          : 'bg-[#202c33] text-[#aebac1] border-[#222d34] hover:bg-[#2a3942]'
                      }`}
                    >
                      Compact UI
                    </button>
                  </div>
                </div>

                <div className="flex-grow flex flex-col min-h-0 pt-2">
                  <div className="text-[11px] font-semibold text-[#e9edef] mb-1.5 flex items-center justify-between">
                    <span>Live Stylesheet Editor</span>
                    <span className="text-[9px] text-[#8696a0] font-normal italic">Changes inject instantly</span>
                  </div>
                  <textarea
                    value={customCss}
                    onChange={(e) => handleCssChange(e.target.value)}
                    placeholder="/* Type custom CSS overrides here. e.g. body { filter: invert(1); } */"
                    className="flex-1 w-full bg-[#182229] text-[#e9edef] p-3 rounded border border-[#222d34] font-mono text-[11px] resize-none outline-none focus:border-[#00a884] placeholder-[#667781] leading-relaxed h-[180px]"
                  />
                </div>
              </div>
            )}

            {subPage === 'storage' && (
              <div className="flex flex-col h-full space-y-4 subpage-animate">
                <div className="flex-shrink-0">
                  <h3 className="text-sm font-semibold text-[#e9edef] border-b border-[#222d34] pb-2 flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-[#00a884]" />
                    <span>Storage & Cache</span>
                  </h3>
                  <p className="text-[11px] text-[#8696a0] mt-2 mb-3 leading-relaxed">
                    Inspect disk usage, clear application caches, or remove local storage data.
                  </p>
                </div>

                {/* Unified Account Selector Banner */}
                <div className="flex items-center justify-between p-3 bg-[#182229] border border-[#222d34] rounded-lg mb-4 flex-shrink-0">
                  <span className="font-semibold text-xs text-[#e9edef]">Target Account:</span>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="bg-[#202c33] text-[#e9edef] px-3 py-1.5 rounded border border-[#222d34] text-[11px] outline-none focus:border-[#00a884] cursor-pointer font-medium"
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.emoji ? `${acc.emoji} ` : ''}{acc.name}
                      </option>
                    ))}
                  </select>
                </div>

                {isLoadingStorage ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center text-[#8696a0] py-12 gap-2">
                    <div className="w-6 h-6 rounded-full border-2 border-[#00a884] border-t-transparent animate-spin" />
                    <span>Calculating storage sizes...</span>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto space-y-4">
                    {/* Storage grid */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-[#182229] border border-[#222d34] rounded-lg">
                        <div className="text-[10px] text-[#8696a0] uppercase font-bold tracking-wider mb-1">HTTP Cache</div>
                        <div className="text-lg font-semibold text-[#e9edef]">
                          {storageSizes ? formatBytes(storageSizes.cache) : '0 B'}
                        </div>
                        <div className="text-[10px] text-[#8696a0] mt-1">Temporary browser cache assets</div>
                      </div>

                      <div className="p-3 bg-[#182229] border border-[#222d34] rounded-lg">
                        <div className="text-[10px] text-[#8696a0] uppercase font-bold tracking-wider mb-1">IndexedDB</div>
                        <div className="text-lg font-semibold text-[#e9edef]">
                          {storageSizes ? formatBytes(storageSizes.indexedDb) : '0 B'}
                        </div>
                        <div className="text-[10px] text-[#8696a0] mt-1">Message database and media blobs</div>
                      </div>

                      <div className="p-3 bg-[#182229] border border-[#222d34] rounded-lg">
                        <div className="text-[10px] text-[#8696a0] uppercase font-bold tracking-wider mb-1">Local Storage</div>
                        <div className="text-lg font-semibold text-[#e9edef]">
                          {storageSizes ? formatBytes(storageSizes.localStorage) : '0 B'}
                        </div>
                        <div className="text-[10px] text-[#8696a0] mt-1">Account credentials & session tokens</div>
                      </div>

                      <div className="p-3 bg-[#182229] border border-[#222d34] rounded-lg">
                        <div className="text-[10px] text-[#8696a0] uppercase font-bold tracking-wider mb-1">Cookies</div>
                        <div className="text-lg font-semibold text-[#e9edef]">
                          {storageSizes ? formatBytes(storageSizes.cookies) : '0 B'}
                        </div>
                        <div className="text-[10px] text-[#8696a0] mt-1">Authentication state databases</div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="p-3 bg-[#202c33]/40 border border-[#222d34] rounded-lg space-y-3">
                      <div className="font-semibold text-xs text-[#e9edef]">Management Actions</div>
                      
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between p-2 rounded bg-[#182229] border border-[#222d34]">
                          <div className="pr-4">
                            <div className="font-semibold text-xs text-[#e9edef]">Clear Cache</div>
                            <div className="text-[10px] text-[#8696a0] mt-0.5">Wipes temporary asset cache. Safe to do anytime.</div>
                          </div>
                          <button
                            disabled={isClearing}
                            onClick={() => handleClearStorage('cache')}
                            className="px-3 py-1.5 bg-[#202c33] border border-[#374248] text-[#e9edef] hover:bg-[#2a3942] hover:text-[#00a884] disabled:opacity-50 font-bold rounded transition-colors text-[11px] whitespace-nowrap"
                          >
                            Clear Cache
                          </button>
                        </div>

                        <div className="flex items-center justify-between p-2 rounded bg-[#182229] border border-[#222d34]">
                          <div className="pr-4">
                            <div className="font-semibold text-xs text-[#e9edef]">Clear Media & Databases</div>
                            <div className="text-[10px] text-[#ea4335] mt-0.5">Wipes local chat history & media cache. Keeps you logged in, but page will reload and sync.</div>
                          </div>
                          <button
                            disabled={isClearing}
                            onClick={() => handleClearStorage('media')}
                            className="px-3 py-1.5 bg-[#ea4335]/10 border border-[#ea4335]/30 text-[#ea4335] hover:bg-[#ea4335]/25 disabled:opacity-50 font-bold rounded transition-colors text-[11px] whitespace-nowrap"
                          >
                            Clear Media
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {subPage === 'notifications' && (
              <div className="flex flex-col h-full space-y-4 subpage-animate">
                <div className="flex-shrink-0">
                  <h3 className="text-sm font-semibold text-[#e9edef] border-b border-[#222d34] pb-2 flex items-center gap-1.5">
                    <Bell className="w-4 h-4 text-[#00a884]" />
                    <span>Notification History</span>
                  </h3>
                  <p className="text-[11px] text-[#8696a0] mt-2 mb-3 leading-relaxed">
                    Browse, filter, and search through logs of desktop notifications, message edits, and deletions.
                  </p>
                </div>

                {globalSettings?.notificationLoggingEnabled === false && (
                  <div className="flex-shrink-0 bg-[#ea4335]/15 border border-[#ea4335]/30 text-[#ea4335] px-3 py-2 rounded text-[11px] leading-normal font-medium">
                    ⚠️ Notification logging is currently disabled. Go to the{' '}
                    <button
                      onClick={() => setActivePage('general')}
                      className="underline font-semibold hover:text-[#ff5c4c] transition-colors cursor-pointer"
                    >
                      General settings page
                    </button>{' '}
                    to enable it so notifications, edits, and deletions can be recorded.
                  </div>
                )}
                <div className="flex-shrink-0 flex items-center justify-between gap-3 border-b border-[#222d34] pb-3">
                  <div className="flex items-center gap-2 flex-grow">
                    <input
                      type="text"
                      value={notifSearch}
                      onChange={(e) => setNotifSearch(e.target.value)}
                      placeholder="Search notifications..."
                      className="w-1/2 bg-[#182229] text-[#e9edef] px-2.5 py-1.5 rounded border border-[#222d34] text-[11px] outline-none focus:border-[#00a884] placeholder-[#667781]"
                    />
                    <select
                      value={notifAccountFilter}
                      onChange={(e) => setNotifAccountFilter(e.target.value)}
                      className="w-1/2 bg-[#202c33] text-[#e9edef] px-2 py-1.5 rounded border border-[#222d34] text-[11px] outline-none focus:border-[#00a884]"
                    >
                      <option value="all">All Accounts</option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.emoji ? `${acc.emoji} ` : ''}{acc.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={handleClearHistory}
                    disabled={notificationHistory.length === 0}
                    className="px-2.5 py-1.5 bg-[#ea4335]/10 border border-[#ea4335]/30 text-[#ea4335] hover:bg-[#ea4335]/25 disabled:opacity-50 font-bold rounded transition-colors text-[10px] flex-shrink-0"
                  >
                    Clear History
                  </button>
                </div>

                <div className="flex-grow overflow-y-auto space-y-2 pr-1 h-[260px]">
                  {filteredNotifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center text-[#8696a0]">
                      <Bell className="w-10 h-10 mb-2.5 text-[#202c33]" />
                      <p className="font-semibold text-[#d1d7db] mb-0.5 text-xs">No Notification Logs</p>
                      <p className="text-[10px] max-w-[200px] leading-normal">
                        {notifSearch || notifAccountFilter !== 'all'
                          ? 'No logs match your filter'
                          : 'Desktop alerts are logged here'}
                      </p>
                    </div>
                  ) : (
                    filteredNotifications.map((notif) => {
                      const date = new Date(notif.timestamp);
                      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });

                      return (
                        <div
                          key={notif.id}
                          className="flex items-start gap-2.5 p-2.5 bg-[#182229] border border-[#222d34] rounded-lg hover:border-[#374248] transition-colors text-[11px]"
                        >
                          {notif.icon ? (
                            <img
                              src={notif.icon}
                              alt=""
                              className="w-7 h-7 rounded-full flex-shrink-0 object-cover bg-[#202c33]"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const parent = e.currentTarget.parentElement;
                                if (parent) {
                                  const fb = parent.querySelector('.avatar-fallback');
                                  if (fb) (fb as HTMLElement).style.display = 'flex';
                                }
                              }}
                            />
                          ) : null}
                          <div
                            className="avatar-fallback w-7 h-7 rounded-full bg-[#202c33] flex items-center justify-center text-[#00a884] flex-shrink-0"
                            style={{ display: notif.icon ? 'none' : 'flex' }}
                          >
                            <Bell className="w-3.5 h-3.5" />
                          </div>

                          <div className="min-w-0 flex-grow">
                            <div className="flex items-baseline justify-between gap-1.5">
                              <span className="font-semibold text-xs text-[#e9edef] truncate">
                                {notif.title}
                              </span>
                              <span className="text-[9px] text-[#8696a0] flex-shrink-0 whitespace-nowrap">
                                {dateStr}, {timeStr}
                              </span>
                            </div>
                            <div className="text-[10px] text-[#8696a0] mt-0.5 break-words max-h-16 overflow-y-auto no-scrollbar">
                              {notif.body}
                            </div>
                            <div className="mt-1 flex items-center">
                              <span className="bg-[#202c33] text-[#00a884] font-medium text-[8px] px-1 py-0.5 rounded border border-[#222d34]">
                                {notif.accountName}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </>
        );
      })()}
    </div>
  </div>

          {/* Reload required card */}
          {selectedAccountId && accountsNeedingReload.includes(selectedAccountId) && (
            <div className="p-3.5 bg-[#202c33] border-t border-[#00a884] flex items-center justify-between flex-shrink-0 animate-in slide-in-from-bottom duration-250 select-none">
              <div className="flex items-center gap-2.5">
                <RotateCw className="w-4 h-4 text-[#00a884]" />
                <div>
                  <div className="font-semibold text-[#e9edef] text-[11px]">Reload required</div>
                  <div className="text-[10px] text-[#8696a0] mt-0.5">Please reload the page to apply your changes.</div>
                </div>
              </div>
              <button
                onClick={() => {
                  window.electronAPI.reloadAccount(selectedAccountId);
                  setAccountsNeedingReload((prev) => prev.filter((id) => id !== selectedAccountId));
                }}
                className="px-3.5 py-1.5 bg-[#00a884] hover:bg-[#00c298] text-[#111b21] font-bold rounded transition-colors text-[11px] whitespace-nowrap shadow-sm"
              >
                Reload Page
              </button>
            </div>
          )}
        </div>
  );
};
