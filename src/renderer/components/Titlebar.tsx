import React, { useState, useEffect } from 'react';
import { Minus, Square, Copy, X, Settings, Plus, MessageSquare } from 'lucide-react';
import type { AccountInfo } from '../../preload';

interface TitlebarProps {
  onOpenSettings: () => void;
}

export const Titlebar: React.FC<TitlebarProps> = ({ onOpenSettings }) => {
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [activeId, setActiveId] = useState<string>('default');
  const [isMaximized, setIsMaximized] = useState<boolean>(false);
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [showFlash, setShowFlash] = useState<boolean>(false);

  useEffect(() => {
    if (!window.electronAPI) return;

    // Fetch initial accounts & window state
    window.electronAPI.getAccounts().then(setAccounts);
    window.electronAPI.getActiveAccountId().then(setActiveId);
    window.electronAPI.isMaximized().then(setIsMaximized);

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

    let flashTimeout: NodeJS.Timeout | null = null;
    const unsubscribeZoom = window.electronAPI.onZoomChanged((percent) => {
      setZoomPercent(percent);
      setShowFlash(true);
      if (flashTimeout) clearTimeout(flashTimeout);
      flashTimeout = setTimeout(() => {
        setShowFlash(false);
      }, 800);
    });

    return () => {
      unsubscribeAccount();
      unsubscribeUnread();
      unsubscribeMaximized();
      unsubscribeZoom();
      if (flashTimeout) clearTimeout(flashTimeout);
    };
  }, []);

  const handleMinimize = () => window.electronAPI?.minimizeWindow();
  const handleMaximize = () => window.electronAPI?.maximizeWindow();
  const handleClose = () => window.electronAPI?.closeWindow();

  const handleSwitchTab = (id: string) => {
    setActiveId(id);
    window.electronAPI?.switchAccount(id);
  };

  const handleAddAccount = async () => {
    const newAcc = await window.electronAPI?.addAccount();
    if (newAcc) {
      handleSwitchTab(newAcc.id);
    }
  };

  return (
    <header className="h-[28px] w-full bg-[#111b21] border-b border-[#222d34] flex items-center justify-between select-none text-[#aebac1] text-xs font-sans">
      {/* Left: App Logo & Account Tabs */}
      <div
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        className="flex items-center h-full overflow-hidden pl-2 gap-1"
      >
        {/* Branding Icon */}
        <div className="flex items-center justify-center text-[#00a884] pr-1.5" title="WhatsApp Linux">
          <MessageSquare className="w-3.5 h-3.5 fill-[#00a884] text-[#111b21]" />
        </div>

        {/* Tab List */}
        <div className="flex items-center h-full gap-0.5 overflow-x-auto no-scrollbar">
          {accounts.map((account) => {
            const isActive = account.id === activeId;
            return (
              <button
                key={account.id}
                onClick={() => handleSwitchTab(account.id)}
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                className={`group flex items-center gap-1.5 px-2.5 h-[22px] rounded-t text-[11px] font-medium transition-colors ${
                  isActive
                    ? 'bg-[#202c33] text-[#e9edef] border-t-2 border-[#00a884]'
                    : 'text-[#8696a0] hover:bg-[#182229] hover:text-[#d1d7db]'
                }`}
              >
                <span className="truncate max-w-[100px]">{account.name}</span>
                {account.unreadCount > 0 && (
                  <span className="bg-[#00a884] text-[#111b21] font-bold text-[9px] px-1 rounded-full min-w-[14px] text-center leading-[13px]">
                    {account.unreadCount > 99 ? '99+' : account.unreadCount}
                  </span>
                )}
              </button>
            );
          })}

          {/* Add Account Button */}
          <button
            onClick={handleAddAccount}
            title="Add Account Instance"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            className="flex items-center justify-center w-5 h-5 rounded hover:bg-[#202c33] text-[#8696a0] hover:text-[#00a884] transition-colors ml-0.5"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Drag fill area */}
      <div
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        className="flex-1 h-full"
      />

      {/* Right: Settings Gear + Window Controls */}
      <div
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        className="flex items-center h-full gap-0.5"
      >
        {/* Zoom Indicator Badge */}
        {zoomPercent !== 100 && (
          <button
            onClick={() => window.electronAPI?.resetZoom()}
            title="Zoom level active. Click to reset to 100%"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            className={`flex items-center justify-center px-1.5 h-[18px] rounded text-[10px] font-extrabold tracking-wide transition-all duration-200 ${
              showFlash
                ? 'bg-[#00a884] text-[#111b21] scale-105 shadow-md'
                : 'bg-[#202c33] text-[#00a884] hover:bg-[#2a3942] hover:text-[#e9edef]'
            }`}
          >
            {zoomPercent}%
          </button>
        )}

        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          title="Settings (Extensions, CSS, Storage, History)"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="flex items-center justify-center w-7 h-[28px] hover:bg-[#202c33] text-[#8696a0] hover:text-[#e9edef] transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>

        {/* Divider */}
        <div className="h-3 w-[1px] bg-[#222d34] mx-1" />

        {/* Window Controls */}
        <button
          onClick={handleMinimize}
          title="Minimize"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="flex items-center justify-center w-7 h-[28px] hover:bg-[#202c33] text-[#8696a0] hover:text-[#e9edef] transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleMaximize}
          title={isMaximized ? 'Restore' : 'Maximize'}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="flex items-center justify-center w-7 h-[28px] hover:bg-[#202c33] text-[#8696a0] hover:text-[#e9edef] transition-colors"
        >
          {isMaximized ? <Copy className="w-3 h-3 rotate-180" /> : <Square className="w-3 h-3" />}
        </button>
        <button
          onClick={handleClose}
          title="Close / Minimize to Tray"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="flex items-center justify-center w-8 h-[28px] hover:bg-[#ea4335] text-[#8696a0] hover:text-white transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
