import React, { useState } from 'react';
import { Titlebar } from './components/Titlebar';
import { SettingsModal } from './components/SettingsModal';

export const App: React.FC = () => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleOpenSettings = () => {
    setIsSettingsOpen(true);
    window.electronAPI?.toggleSettings(true);
  };

  const handleCloseSettings = () => {
    setIsSettingsOpen(false);
    window.electronAPI?.toggleSettings(false);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#111b21] overflow-hidden select-none">
      {/* Custom Titlebar (28px) */}
      <Titlebar onOpenSettings={handleOpenSettings} />

      {/* Main Container Area: The Electron WebContentsView will overlay this area below the titlebar */}
      <main className="flex-1 w-full relative bg-[#111b21]">
        {/* Placeholder background state when loading view */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-[#8696a0] text-sm gap-2">
          <div className="w-8 h-8 rounded-full border-2 border-[#00a884] border-t-transparent animate-spin" />
          <span>Connecting to WhatsApp Web...</span>
        </div>
      </main>

      {/* Settings Modal Drawer */}
      <SettingsModal isOpen={isSettingsOpen} onClose={handleCloseSettings} />
    </div>
  );
};
