import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Minus, Square, Copy, X, Settings, Plus, RotateCw, Code, Bell, ChevronDown } from 'lucide-react';
import type { AccountInfo } from '../../preload';

interface TitlebarProps {
  onToggleSettings: () => void;
  onOpenNotificationHistory?: () => void;
  isDisclaimerAccepted?: boolean;
  onOpenAddAccount?: () => void;
}

export const Titlebar: React.FC<TitlebarProps> = ({
  onToggleSettings,
  onOpenNotificationHistory,
  isDisclaimerAccepted = true,
  onOpenAddAccount,
}) => {
  const isMac = typeof window !== 'undefined' && window.electronAPI?.platform === 'darwin';
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [isMaximized, setIsMaximized] = useState<boolean>(false);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [showFlash, setShowFlash] = useState<boolean>(false);
  const [showDevTools, setShowDevTools] = useState<boolean>(false);
  const [showRefresh, setShowRefresh] = useState<boolean>(true);
  const [showNotifHistory, setShowNotifHistory] = useState<boolean>(true);
  const [closeToTray, setCloseToTray] = useState<boolean>(true);

  // Renaming state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Overflow and Dropdown state
  const [isDropdownMode, setIsDropdownMode] = useState<boolean>(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const rightSectionRef = useRef<HTMLDivElement>(null);
  const measureTabsRef = useRef<HTMLDivElement>(null);

  const handleToggleDropdown = () => {
    if (triggerButtonRef.current) {
      const rect = triggerButtonRef.current.getBoundingClientRect();
      window.electronAPI?.showAccountDropdownMenu?.({
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    } else {
      window.electronAPI?.showAccountDropdownMenu?.();
    }
  };

  useEffect(() => {
    const unsub = window.electronAPI?.onAccountDropdownStatus?.((status) => {
      setIsDropdownOpen(status);
    });
    return () => unsub?.();
  }, []);

  // Overflow measurement logic
  const checkOverflow = useCallback(() => {
    if (!headerRef.current) return;
    const headerWidth = headerRef.current.offsetWidth;
    const rightWidth = rightSectionRef.current ? rightSectionRef.current.offsetWidth : (isMac ? 90 : 160);
    const macSpacer = isMac && !isFullScreen ? 78 : 0;
    const logoWidth = 28;
    const minDragWidth = 24;

    const neededTabsWidth = measureTabsRef.current ? measureTabsRef.current.offsetWidth : 0;
    const availableWidth = headerWidth - rightWidth - macSpacer - logoWidth - minDragWidth;

    if (neededTabsWidth <= 0) return;

    if (!isDropdownMode) {
      if (neededTabsWidth > availableWidth) {
        setIsDropdownMode(true);
      }
    } else {
      // 24px hysterisis gap to avoid oscillation at threshold
      if (availableWidth >= neededTabsWidth + 24) {
        setIsDropdownMode(false);
        setIsDropdownOpen(false);
      }
    }
  }, [isDropdownMode, isMac, isFullScreen]);

  useEffect(() => {
    checkOverflow();
    if (!headerRef.current) return;

    const observer = new ResizeObserver(() => {
      checkOverflow();
    });
    observer.observe(headerRef.current);
    if (measureTabsRef.current) {
      observer.observe(measureTabsRef.current);
    }
    if (rightSectionRef.current) {
      observer.observe(rightSectionRef.current);
    }

    return () => observer.disconnect();
  }, [checkOverflow, accounts]);

  const accountsRef = useRef(accounts);

  useEffect(() => {
    accountsRef.current = accounts;
  }, [accounts]);

  useEffect(() => {
    if (!window.electronAPI) return;

    // Fetch initial accounts, settings & window state
    window.electronAPI.getAccounts().then((accs) => {
      setAccounts(accs);
    });
    window.electronAPI.getActiveAccountId().then(setActiveId);
    window.electronAPI.isMaximized().then(setIsMaximized);
    window.electronAPI.isFullScreen?.().then(setIsFullScreen);
    window.electronAPI.getGlobalSettings().then((settings) => {
      setShowDevTools(!!settings.showDevToolsToggle);
      if (settings.showRefreshButton !== undefined) {
        setShowRefresh(settings.showRefreshButton);
      }
      if (settings.showNotificationHistoryButton !== undefined) {
        setShowNotifHistory(settings.showNotificationHistoryButton);
      }
      if (settings.closeToTray !== undefined) {
        setCloseToTray(settings.closeToTray);
      }
    });

    // Listen for account updates
    const unsubscribeAccount = window.electronAPI.onAccountListChanged((updatedAccounts, updatedActiveId) => {
      setAccounts(updatedAccounts);
      setActiveId(updatedActiveId);
    });

    const unsubscribeUnread = window.electronAPI.onUnreadCountChanged((accId, count) => {
      setAccounts((prev) =>
        prev.map((acc) => (acc.id === accId ? { ...acc, unreadCount: count } : acc))
      );
    });

    const unsubscribeMaximized = window.electronAPI.onMaximizedStateChanged((maxState) => {
      setIsMaximized(maxState);
    });

    const unsubscribeFullScreen = window.electronAPI.onFullScreenChanged?.((fsState) => {
      setIsFullScreen(fsState);
    });

    let flashTimeout: NodeJS.Timeout | null = null;
    const unsubscribeZoom = window.electronAPI.onZoomChanged((percent) => {
      setZoomPercent(percent);
      setShowFlash(true);
      if (flashTimeout) clearTimeout(flashTimeout);
      flashTimeout = setTimeout(() => {
        setShowFlash(false);
      }, 800);
    });

    // Listen for context-menu triggered renaming events from the main process
    const unsubscribeTriggerRename = window.electronAPI.onTriggerRename((id) => {
      const acc = accountsRef.current.find((a) => a.id === id);
      if (acc) {
        setEditingId(acc.id);
        setEditName(acc.name);
      } else {
        // Fallback check if state accounts array hasn't updated yet
        window.electronAPI.getAccounts().then((accs) => {
          const matched = accs.find((a) => a.id === id);
          if (matched) {
            setEditingId(matched.id);
            setEditName(matched.name);
          }
        });
      }
    });

    const unsubscribeGlobalSettings = window.electronAPI.onGlobalSettingsChanged((settings) => {
      setShowDevTools(!!settings.showDevToolsToggle);
      if (settings.showRefreshButton !== undefined) {
        setShowRefresh(settings.showRefreshButton);
      }
      if (settings.showNotificationHistoryButton !== undefined) {
        setShowNotifHistory(settings.showNotificationHistoryButton);
      }
      if (settings.closeToTray !== undefined) {
        setCloseToTray(settings.closeToTray);
      }
    });

    return () => {
      unsubscribeAccount();
      unsubscribeUnread();
      unsubscribeMaximized();
      unsubscribeFullScreen?.();
      unsubscribeZoom();
      unsubscribeTriggerRename();
      unsubscribeGlobalSettings();
      if (flashTimeout) clearTimeout(flashTimeout);
    };
  }, []);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const handleMinimize = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    window.electronAPI?.minimizeWindow();
  };
  const handleMaximize = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    window.electronAPI?.maximizeWindow();
  };
  const handleClose = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    window.electronAPI?.closeWindow();
  };

  const handleSwitchTab = (id: string) => {
    if (editingId) return; // Prevent switching when editing tab name
    setActiveId(id);
    window.electronAPI?.switchAccount(id);
  };

  const handleAddAccount = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    if (!isDisclaimerAccepted) return;
    if (onOpenAddAccount) {
      onOpenAddAccount();
    } else {
      const newAcc = await window.electronAPI?.addAccount();
      if (newAcc) {
        handleSwitchTab(newAcc.id);
      }
    }
  };

  const handleStartEdit = (account: AccountInfo, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(account.id);
    setEditName(account.name);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const trimmed = editName.trim();
    if (trimmed && trimmed !== accounts.find((a) => a.id === editingId)?.name) {
      await window.electronAPI.renameAccount(editingId, trimmed);
    }
    setEditingId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  const handleContextMenu = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    window.electronAPI?.showAccountContextMenu(id);
  };

  const showTrafficLightSpacer = isMac && !isFullScreen;
  const activeAccount = accounts.find((a) => a.id === activeId);

  return (
    <header
      ref={headerRef}
      className="h-[28px] w-full bg-[#111b21] border-b border-[#222d34] flex items-center justify-between select-none text-[#aebac1] text-xs font-sans app-titlebar relative overflow-hidden"
    >
      {/* macOS Traffic Lights Spacer (draggable window region) */}
      {showTrafficLightSpacer && (
        <div
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
          className="w-[78px] h-full flex-shrink-0"
        />
      )}

      {/* Left: App Logo & Account Tabs / Dropdown */}
      <div
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        className={`flex items-center h-full min-w-0 flex-shrink-0 ${showTrafficLightSpacer ? 'pl-0' : 'pl-2'} gap-1`}
      >
        {/* Branding Icon */}
        <div className="flex items-center justify-center pr-1.5 flex-shrink-0" title="WAllie">
          <img src="./icon.png" alt="WAllie" className="w-4 h-4 object-contain" />
        </div>

        {/* Account Switcher: Tabs or Dropdown */}
        {isDisclaimerAccepted && (
          isDropdownMode ? (
            /* Dropdown Mode */
            <div className="relative flex items-center h-full gap-1 flex-shrink-0">
              <button
                ref={triggerButtonRef}
                id="account-switcher-trigger"
                type="button"
                aria-haspopup="menu"
                aria-expanded={isDropdownOpen}
                aria-controls="account-switcher-menu"
                aria-label={activeAccount ? `Switch account, current: ${activeAccount.name}` : 'Account switcher'}
                onClick={handleToggleDropdown}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (activeAccount) handleContextMenu(activeAccount.id, e);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleToggleDropdown();
                  }
                }}
                onMouseDown={(e) => e.preventDefault()}
                tabIndex={0}
                title={activeAccount ? `Active: ${activeAccount.name} (Click to switch, Right-click for options)` : 'Account Switcher'}
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                className="group flex items-center gap-1.5 px-2.5 h-[22px] rounded text-[11px] font-medium bg-[#202c33] hover:bg-[#2a3942] text-[#e9edef] border border-[#2a3942] hover:border-[#00a884]/40 transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-[#00a884] focus:outline-none account-switcher-btn"
              >
                {activeAccount && activeAccount.id === editingId ? (
                  <input
                    ref={inputRef}
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleSaveEdit}
                    className="bg-[#111b21] text-[#e9edef] px-1 rounded border border-[#00a884] text-[10px] w-[80px] h-[16px] outline-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className={`truncate max-w-[110px] ${activeAccount?.isLoaded === false ? 'text-[#8696a0]/70' : ''}`}>
                    {activeAccount?.emoji ? `${activeAccount.emoji} ` : ''}
                    {activeAccount?.name || 'Accounts'}
                  </span>
                )}

                {/* Active account unread badge */}
                {activeAccount && activeAccount.unreadCount > 0 && activeAccount.id !== editingId && (
                  <span className="bg-[#00a884] text-[#111b21] font-bold text-[9px] px-1 rounded-full min-w-[14px] text-center leading-[13px]">
                    {activeAccount.unreadCount > 99 ? '99+' : activeAccount.unreadCount}
                  </span>
                )}

                <ChevronDown
                  className={`w-3.5 h-3.5 text-[#8696a0] group-hover:text-[#e9edef] transition-transform duration-200 ${
                    isDropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Compact Add Button next to dropdown */}
              <button
                onClick={handleAddAccount}
                onMouseDown={(e) => e.preventDefault()}
                tabIndex={-1}
                title="Add Account Instance"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                className="flex items-center justify-center w-5 h-5 rounded hover:bg-[#202c33] text-[#8696a0] hover:text-[#00a884] transition-colors focus:outline-none"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>

              {/* Accessible ARIA menu semantics for screen readers and modern web compliance */}
              <div
                id="account-switcher-menu"
                role="menu"
                aria-labelledby="account-switcher-trigger"
                className="sr-only"
              >
                {accounts.map((acc) => (
                  <div
                    key={acc.id}
                    role="menuitemradio"
                    aria-checked={acc.id === activeId}
                    tabIndex={acc.id === activeId ? 0 : -1}
                    onClick={() => handleSwitchTab(acc.id)}
                  >
                    {acc.name}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Tabs Mode */
            <div className="flex items-center h-full gap-0.5 overflow-hidden no-scrollbar">
              {accounts.map((account) => {
                const isActive = account.id === activeId;
                const isEditing = account.id === editingId;
                const isLoaded = account.isLoaded !== false;

                let tabStyle = '';
                if (isActive) {
                  tabStyle = !isLoaded
                    ? 'bg-[#182229] text-[#8696a0] border-t-2 border-[#00a884]/40 opacity-75'
                    : 'bg-[#202c33] text-[#e9edef] border-t-2 border-[#00a884]';
                } else {
                  tabStyle = !isLoaded
                    ? 'text-[#54656f] bg-[#111b21]/60 opacity-60 hover:bg-[#182229] hover:text-[#aebac1] hover:opacity-100'
                    : 'text-[#8696a0] hover:bg-[#182229] hover:text-[#d1d7db]';
                }

                return (
                  <div
                    key={account.id}
                    onClick={() => handleSwitchTab(account.id)}
                    onDoubleClick={(e) => handleStartEdit(account, e)}
                    onContextMenu={(e) => handleContextMenu(account.id, e)}
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                    className={`group flex items-center gap-1.5 px-2.5 h-[22px] rounded-t text-[11px] font-medium transition-colors cursor-pointer relative ${tabStyle}`}
                    title={!isLoaded ? "Account unloaded (click to load), Double click to rename, Right-click for options" : "Double click to rename, Right-click for options"}
                  >
                    {isEditing ? (
                      <input
                        ref={inputRef}
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={handleSaveEdit}
                        className="bg-[#111b21] text-[#e9edef] px-1 rounded border border-[#00a884] text-[10px] w-[80px] h-[16px] outline-none"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className={`truncate max-w-[100px] ${!isLoaded ? 'text-[#8696a0]/70' : ''}`}>
                        {account.emoji ? `${account.emoji} ` : ''}{account.name}
                      </span>
                    )}

                    {/* Unread badge */}
                    {!isEditing && account.unreadCount > 0 && (
                      <span className="bg-[#00a884] text-[#111b21] font-bold text-[9px] px-1 rounded-full min-w-[14px] text-center leading-[13px]">
                        {account.unreadCount > 99 ? '99+' : account.unreadCount}
                      </span>
                    )}
                  </div>
                );
              })}

              {/* Add Account Button */}
              <button
                onClick={handleAddAccount}
                onMouseDown={(e) => e.preventDefault()}
                tabIndex={-1}
                title="Add Account Instance"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                className="flex items-center justify-center w-5 h-5 rounded hover:bg-[#202c33] text-[#8696a0] hover:text-[#00a884] transition-colors ml-0.5 focus:outline-none"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        )}
      </div>

      {/* Drag fill area */}
      <div
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        className="flex-1 h-full min-w-[12px]"
      />

      {/* Right: Settings Gear + Window Controls */}
      <div
        ref={rightSectionRef}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        className={`flex items-center h-full gap-0.5 flex-shrink-0 ${isMac ? 'pr-2' : ''}`}
      >
        {isDisclaimerAccepted && (
          <>
            {/* Zoom Indicator Badge */}
            {zoomPercent !== 100 && (
              <button
                onClick={(e) => {
                  window.electronAPI?.resetZoom();
                  e.currentTarget.blur();
                }}
                onMouseDown={(e) => e.preventDefault()}
                tabIndex={-1}
                title="Zoom level active. Click to reset to 100%"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                className={`flex items-center justify-center px-1.5 h-[18px] rounded text-[10px] font-extrabold tracking-wide transition-all duration-200 focus:outline-none ${showFlash
                  ? 'bg-[#00a884] text-[#111b21] scale-105 shadow-md'
                  : 'bg-[#202c33] text-[#00a884] hover:bg-[#2a3942] hover:text-[#e9edef]'
                  }`}
              >
                {zoomPercent}%
              </button>
            )}

            {/* Refresh Button */}
            {showRefresh && (
              <button
                onClick={(e) => {
                  window.electronAPI?.reloadActiveAccount();
                  e.currentTarget.blur();
                }}
                onMouseDown={(e) => e.preventDefault()}
                tabIndex={-1}
                title="Refresh WhatsApp Web"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                className="flex items-center justify-center w-7 h-[28px] hover:bg-[#202c33] text-[#8696a0] hover:text-[#e9edef] transition-colors focus:outline-none"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            )}

            {/* DevTools Toggle Button */}
            {showDevTools && (
              <button
                onClick={(e) => {
                  window.electronAPI?.toggleDevTools();
                  e.currentTarget.blur();
                }}
                onMouseDown={(e) => e.preventDefault()}
                tabIndex={-1}
                title="Toggle Developer Tools"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                className="flex items-center justify-center w-7 h-[28px] hover:bg-[#202c33] text-[#8696a0] hover:text-[#e9edef] transition-colors focus:outline-none"
              >
                <Code className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Notification History Button */}
            {showNotifHistory && (
              <button
                onClick={(e) => {
                  onOpenNotificationHistory?.();
                  e.currentTarget.blur();
                }}
                onMouseDown={(e) => e.preventDefault()}
                tabIndex={-1}
                title="Notification History"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                className="flex items-center justify-center w-7 h-[28px] hover:bg-[#202c33] text-[#8696a0] hover:text-[#e9edef] transition-colors focus:outline-none cursor-pointer"
              >
                <Bell className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Settings Button */}
            <button
              onClick={(e) => {
                onToggleSettings();
                e.currentTarget.blur();
              }}
              onMouseDown={(e) => e.preventDefault()}
              tabIndex={-1}
              title="Settings (Extensions, CSS, Storage, History)"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              className="flex items-center justify-center w-7 h-[28px] hover:bg-[#202c33] text-[#8696a0] hover:text-[#e9edef] transition-colors focus:outline-none"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>

            {/* Divider (only on non-macOS platforms with window controls) */}
            {!isMac && <div className="h-3 w-[1px] bg-[#222d34] mx-1" />}
          </>
        )}

        {/* Window Controls (hidden on macOS where native traffic lights are used) */}
        {!isMac && (
          <>
            <button
              onClick={handleMinimize}
              onMouseDown={(e) => e.preventDefault()}
              tabIndex={-1}
              title="Minimize"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              className="flex items-center justify-center w-7 h-[28px] hover:bg-[#202c33] text-[#8696a0] hover:text-[#e9edef] transition-colors focus:outline-none"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleMaximize}
              onMouseDown={(e) => e.preventDefault()}
              tabIndex={-1}
              title={isMaximized ? 'Restore' : 'Maximize'}
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              className="flex items-center justify-center w-7 h-[28px] hover:bg-[#202c33] text-[#8696a0] hover:text-[#e9edef] transition-colors focus:outline-none"
            >
              {isMaximized ? <Copy className="w-3 h-3 rotate-180" /> : <Square className="w-3 h-3" />}
            </button>
            <button
              onClick={handleClose}
              onMouseDown={(e) => e.preventDefault()}
              tabIndex={-1}
              title={closeToTray ? 'Minimize to Tray' : 'Close'}
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              className="titlebar-close-btn flex items-center justify-center w-8 h-[28px] hover:bg-[#ea4335] text-[#8696a0] hover:text-white transition-colors focus:outline-none"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>

      {/* Invisible measurement element to calculate total required width of tabs */}
      <div
        ref={measureTabsRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: -9999,
          left: -9999,
          visibility: 'hidden',
          pointerEvents: 'none',
          height: '28px',
        }}
        className="flex items-center gap-0.5 whitespace-nowrap"
      >
        {accounts.map((account) => (
          <div
            key={account.id}
            className="flex items-center gap-1.5 px-2.5 h-[22px] rounded-t text-[11px] font-medium"
          >
            <span className="max-w-[100px]">
              {account.emoji ? `${account.emoji} ` : ''}{account.name}
            </span>
            {account.unreadCount > 0 && (
              <span className="font-bold text-[9px] px-1 rounded-full min-w-[14px]">
                {account.unreadCount > 99 ? '99+' : account.unreadCount}
              </span>
            )}
          </div>
        ))}
        <div className="w-5 h-5 ml-0.5" />
      </div>
    </header>
  );
};
