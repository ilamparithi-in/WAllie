import React, { useState, useEffect } from 'react';
import { Pin, Minus, X, PhoneCall } from 'lucide-react';

export const CallWindow: React.FC = () => {
  const [accountName, setAccountName] = useState<string>('WhatsApp');
  const [isPinned, setIsPinned] = useState<boolean>(false);

  useEffect(() => {
    // Parse query params to get account details
    const params = new URLSearchParams(window.location.search);
    const name = params.get('accountName');
    if (name) {
      setAccountName(decodeURIComponent(name));
    }

    // Get initial pinned status
    if (window.electronAPI?.getAlwaysOnTop) {
      window.electronAPI.getAlwaysOnTop().then(setIsPinned);
    }

    // Listen for always-on-top updates from the main process
    if (window.electronAPI?.onAlwaysOnTopChanged) {
      const unsubscribe = window.electronAPI.onAlwaysOnTopChanged((pinned) => {
        setIsPinned(pinned);
      });
      return () => unsubscribe();
    }
    return undefined;
  }, []);

  const handleTogglePin = () => {
    if (window.electronAPI?.toggleAlwaysOnTop) {
      window.electronAPI.toggleAlwaysOnTop();
    }
  };

  const handleMinimize = () => window.electronAPI?.minimizeWindow();
  const handleClose = () => window.electronAPI?.closeWindow();

  return (
    <div className="h-screen w-screen flex flex-col bg-[#111b21] overflow-hidden select-none font-sans">
      {/* Native-style Titlebar */}
      <header className="h-[28px] w-full bg-[#111b21] border-b border-[#222d34] flex items-center justify-between text-[#aebac1] text-xs">
        {/* Left: Branding & Account Identifier */}
        <div 
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="flex items-center pl-3 gap-2 shrink-0 select-none"
        >
          <div className="flex items-center justify-center text-[#00a884]">
            <PhoneCall className="w-3.5 h-3.5 animate-pulse" />
          </div>
          <span className="font-semibold text-[#e9edef] text-[11px] tracking-wide">
            WhatsApp Call
          </span>
          <span className="px-1.5 py-0.5 bg-[#00a884]/10 border border-[#00a884]/20 text-[#00a884] rounded text-[10px] font-bold">
            {accountName}
          </span>
        </div>

        {/* Center: Draggable Spacer */}
        <div 
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
          className="flex-1 h-full cursor-move"
        />

        {/* Right: Stay on Top (Pin) + Window Controls */}
        <div 
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="flex items-center h-full gap-0.5 pr-0.5 shrink-0"
        >
          {/* Always on Top Pin Toggle */}
          <button
            onClick={handleTogglePin}
            title={isPinned ? 'Unpin (Disable Always on Top)' : 'Pin (Enable Always on Top)'}
            className={`flex items-center justify-center w-7 h-[28px] hover:bg-[#202c33] transition-colors ${
              isPinned ? 'text-[#00a884]' : 'text-[#8696a0] hover:text-[#e9edef]'
            }`}
          >
            <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-[#00a884]' : ''}`} />
          </button>

          {/* Divider */}
          <div className="h-3 w-[1px] bg-[#222d34] mx-1" />

          {/* Minimize */}
          <button
            onClick={handleMinimize}
            title="Minimize"
            className="flex items-center justify-center w-7 h-[28px] hover:bg-[#202c33] text-[#8696a0] hover:text-[#e9edef] transition-colors"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          {/* Close Call */}
          <button
            onClick={handleClose}
            title="End Call & Close Window"
            className="flex items-center justify-center w-8 h-[28px] hover:bg-[#ea4335] text-[#8696a0] hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main Calling Content Area - Overlaid by WebContentsView in Main Process */}
      <main className="flex-1 bg-[#111b21] relative">
        <div className="absolute inset-0 flex flex-col items-center justify-center text-[#8696a0] text-sm gap-2">
          <div className="w-8 h-8 rounded-full border-2 border-[#00a884] border-t-transparent animate-spin" />
          <span>Starting call interface...</span>
        </div>
      </main>
    </div>
  );
};
