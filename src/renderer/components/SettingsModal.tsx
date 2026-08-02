import React, { useState, useEffect, useRef } from 'react';
import { X, Puzzle, Palette, Database, Bell, Settings as SettingsIcon, Plus, Shield, ArrowLeft, Users, RotateCw, FolderOpen, User, Trash2 } from 'lucide-react';
import type { AccountInfo, GlobalSettings } from '../../preload';
import { GeneralSettingsPage } from './settings/GeneralSettingsPage';
import { PreloadSettingsPage } from './settings/PreloadSettingsPage';
import { AccountsSettingsPage } from './settings/AccountsSettingsPage';
import { PermissionsSettingsPage } from './settings/PermissionsSettingsPage';
import { ExtensionsSettingsPage } from './settings/ExtensionsSettingsPage';
import { ThemeSettingsPage } from './settings/ThemeSettingsPage';
import { StorageSettingsPage } from './settings/StorageSettingsPage';
import { NotificationSettingsPage } from './settings/NotificationSettingsPage';

import { useFocusTrap } from '../hooks/useFocusTrap';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPage?: PageType;
  initialAccountId?: string;
  onShowDisclaimer: () => void;
}

type PageType = 'main' | 'extensions' | 'css' | 'storage' | 'notifications' | 'general' | 'preload' | 'permissions' | 'accounts';

const SETTINGS_MENU_ITEMS: {
  page: PageType;
  icon: React.ElementType;
  title: string;
  description: string;
}[] = [
  { page: 'accounts', icon: User, title: 'Manage Accounts', description: 'Customize account names and emojis' },
  { page: 'general', icon: SettingsIcon, title: 'General Settings', description: 'Tray settings and GPU hardware acceleration' },
  { page: 'preload', icon: Users, title: 'Accounts to load on launch', description: 'Select which accounts get preloaded in the background' },
  { page: 'permissions', icon: Shield, title: 'Browser permissions', description: 'Manage camera, mic, notifications, geolocation, and clipboard access' },
  { page: 'extensions', icon: Puzzle, title: 'Chrome Extensions', description: 'Manage helper extensions and plugins' },
  { page: 'css', icon: Palette, title: 'Custom CSS & Themes', description: 'Select preset themes or write custom CSS' },
  { page: 'storage', icon: Database, title: 'Storage & Cache', description: 'Inspect sizes, clear browser media or cache' },
  { page: 'notifications', icon: Bell, title: 'Notification History', description: 'View and search desktop alert logs' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, initialPage, initialAccountId, onShowDisclaimer }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const [activePage, setActivePage] = useState<PageType>('main');

  useFocusTrap(modalRef, isOpen);

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

  const handleClearHistory = async (options?: any) => {
    try {
      await window.electronAPI.clearNotificationHistory(options);
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
      ref={modalRef}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      className={`fixed top-[28px] right-0 bottom-0 z-50 w-[450px] bg-[#111b21] border-l border-[#222d34] shadow-2xl flex flex-col transform transition-transform duration-300 ease-[cubic-bezier(0.1,0.9,0.2,1)] select-text ${
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
              onClick={(e) => {
                setActivePage('main');
                e.currentTarget.blur();
              }}
              onMouseDown={(e) => e.preventDefault()}
              className="flex items-center gap-2 text-[#00a884] font-medium text-sm hover:text-[#00c298] transition-colors focus-visible:ring-2 focus-visible:ring-[#00a884] focus-visible:outline-none"
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
            onClick={(e) => {
              onClose();
              e.currentTarget.blur();
            }}
            onMouseDown={(e) => e.preventDefault()}
            tabIndex={-1}
            className="p-1 rounded hover:bg-[#111b21] text-[#8696a0] hover:text-[#e9edef] transition-colors focus-visible:ring-2 focus-visible:ring-[#00a884] focus-visible:outline-none"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body / Drawer Content */}
        <div className="flex-grow relative overflow-hidden bg-[#111b21]">
          {/* Main Menu Page */}
          <div className={`absolute inset-0 p-4 overflow-y-auto transition-transform duration-300 ease-in-out flex flex-col ${
            activePage === 'main' ? 'translate-x-0' : '-translate-x-full pointer-events-none invisible'
          }`}>
            <div className="flex flex-col space-y-2 select-text pb-4">
              {SETTINGS_MENU_ITEMS.map((item) => {
                const IconComponent = item.icon;
                return (
                  <button
                    key={item.page}
                    onClick={() => setActivePage(item.page)}
                    onMouseDown={(e) => e.preventDefault()}
                    className="flex items-center gap-3.5 p-3 rounded-lg bg-[#182229] border border-[#222d34] hover:bg-[#202c33] hover:border-[#374248] text-left transition-all focus-visible:ring-2 focus-visible:ring-[#00a884] focus-visible:outline-none"
                  >
                    <div className="w-8 h-8 rounded-full bg-[#202c33] flex items-center justify-center text-[#00a884] flex-shrink-0">
                      <IconComponent className="w-4 h-4" />
                    </div>
                    <div className="flex-grow min-w-0">
                      <div className="font-semibold text-[#e9edef] text-[12px]">{item.title}</div>
                      <div className="text-[10px] text-[#8696a0] mt-0.5">{item.description}</div>
                    </div>
                  </button>
                );
              })}

              {/* About Section */}
              <div className="mt-6 pt-4 border-t border-[#222d34]/60 text-center select-text">
                <div className="flex justify-center mb-2.5">
                  <img src="./icon.png" alt="WAllie Logo" className="w-14 h-14 object-contain" />
                </div>
                <div className="text-sm font-bold text-[#e9edef] tracking-wide">WAllie</div>
                <div className="text-[10px] text-[#8696a0] mt-1 leading-normal max-w-[320px] mx-auto">
                  Electron-based WhatsApp Client for Linux with Multi-account and Extensions Support
                </div>
                <div className="text-[9px] text-[#8696a0] mt-1">
                  Version 1.0.0 • MIT License • By Ilamparithi M
                </div>
                <div className="mt-1.5 flex flex-col gap-1 items-center">
                  <button
                    onClick={(e) => {
                      onShowDisclaimer();
                      e.currentTarget.blur();
                    }}
                    onMouseDown={(e) => e.preventDefault()}
                    className="text-[#00a884] hover:text-[#00c298] transition-colors underline font-medium text-[10px] cursor-pointer bg-transparent border-none p-0 focus-visible:ring-2 focus-visible:ring-[#00a884] focus-visible:outline-none"
                  >
                    View Legal Disclaimer
                  </button>
                  <button
                    onClick={(e) => {
                      window.electronAPI?.toggleWallieDevTools();
                      e.currentTarget.blur();
                    }}
                    onMouseDown={(e) => e.preventDefault()}
                    className="text-[#8696a0] hover:text-[#e9edef] transition-colors underline font-medium text-[10px] cursor-pointer bg-transparent border-none p-0 focus-visible:ring-2 focus-visible:ring-[#00a884] focus-visible:outline-none"
                  >
                    Open Wallie DevTools
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
            activePage !== 'main' ? 'translate-x-0' : 'translate-x-full pointer-events-none invisible'
          }`}>
            {(() => {
              const subPage = activePage !== 'main' ? activePage : lastSubPage;
              return (
                <>
                  {subPage === 'general' && (
                    <GeneralSettingsPage
                      globalSettings={globalSettings}
                      handleToggleGlobalSetting={handleToggleGlobalSetting}
                    />
                  )}

                  {subPage === 'preload' && (
                    <PreloadSettingsPage
                      accounts={accounts}
                      globalSettings={globalSettings}
                      handleToggleGlobalSetting={handleToggleGlobalSetting}
                    />
                  )}

                  {subPage === 'accounts' && (
                    <AccountsSettingsPage
                      accounts={accounts}
                      setAccounts={setAccounts}
                      globalSettings={globalSettings}
                      handleToggleGlobalSetting={handleToggleGlobalSetting}
                      handleDeleteAccount={handleDeleteAccount}
                      setSelectedAccountId={setSelectedAccountId}
                      setNotifAccountFilter={setNotifAccountFilter}
                      setActivePage={setActivePage}
                    />
                  )}

                  {subPage === 'permissions' && (
                    <PermissionsSettingsPage
                      accounts={accounts}
                      selectedAccountId={selectedAccountId}
                      setSelectedAccountId={setSelectedAccountId}
                      selectedAccount={selectedAccount}
                      handleToggleAccountPermission={handleToggleAccountPermission}
                    />
                  )}

                  {subPage === 'extensions' && (
                    <ExtensionsSettingsPage
                      accounts={accounts}
                      selectedAccountId={selectedAccountId}
                      setSelectedAccountId={setSelectedAccountId}
                      globalSettings={globalSettings}
                      handleToggleGlobalSetting={handleToggleGlobalSetting}
                      showImportDropdown={showImportDropdown}
                      setShowImportDropdown={setShowImportDropdown}
                      isImporting={isImporting}
                      handleImportExtension={handleImportExtension}
                      handleBrowseWebStore={handleBrowseWebStore}
                      webstoreUrlOrId={webstoreUrlOrId}
                      setWebstoreUrlOrId={setWebstoreUrlOrId}
                      isInstallingWebStore={isInstallingWebStore}
                      handleInstallWebStoreExtension={handleInstallWebStoreExtension}
                      extensions={extensions}
                      handleToggleExtension={handleToggleExtension}
                      handleRemoveExtension={handleRemoveExtension}
                    />
                  )}

                  {subPage === 'css' && (
                    <ThemeSettingsPage
                      accounts={accounts}
                      selectedAccountId={selectedAccountId}
                      setSelectedAccountId={setSelectedAccountId}
                      selectedAccount={selectedAccount}
                      handleSelectPresetTheme={handleSelectPresetTheme}
                      customCss={customCss}
                      handleCssChange={handleCssChange}
                    />
                  )}

                  {subPage === 'storage' && (
                    <StorageSettingsPage
                      accounts={accounts}
                      selectedAccountId={selectedAccountId}
                      setSelectedAccountId={setSelectedAccountId}
                      isLoadingStorage={isLoadingStorage}
                      storageSizes={storageSizes}
                      formatBytes={formatBytes}
                      isClearing={isClearing}
                      handleClearStorage={handleClearStorage}
                    />
                  )}

                  {subPage === 'notifications' && (
                    <NotificationSettingsPage
                      accounts={accounts}
                      globalSettings={globalSettings}
                      setActivePage={setActivePage}
                      notifSearch={notifSearch}
                      setNotifSearch={setNotifSearch}
                      notifAccountFilter={notifAccountFilter}
                      setNotifAccountFilter={setNotifAccountFilter}
                      handleClearHistory={handleClearHistory}
                      notificationHistory={notificationHistory}
                      filteredNotifications={filteredNotifications}
                    />
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
