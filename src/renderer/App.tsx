import React, { useState, useEffect } from 'react';
import { Titlebar } from './components/Titlebar';
import { SettingsModal } from './components/SettingsModal';
import { Download, CheckCircle, XCircle, X } from 'lucide-react';

import type { AccountInfo } from '../preload';

interface DownloadState {
  id: number;
  filename: string;
  percent: number;
  state: 'progressing' | 'completed' | 'failed';
  receivedBytes?: number;
  totalBytes?: number;
}

export const App: React.FC = () => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [downloads, setDownloads] = useState<DownloadState[]>([]);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [promptAccounts, setPromptAccounts] = useState<AccountInfo[]>([]);

  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubscribeDownload = window.electronAPI.onDownloadProgress((data) => {
      setDownloads((prev) => {
        const idx = prev.findIndex((d) => d.id === data.id);
        if (idx > -1) {
          const updated = [...prev];
          updated[idx] = data;
          return updated;
        } else {
          return [...prev, data];
        }
      });

      // Auto-remove completed or failed alerts after 6 seconds
      if (data.state === 'completed' || data.state === 'failed') {
        setTimeout(() => {
          setDownloads((prev) => prev.filter((d) => d.id !== data.id));
        }, 6000);
      }
    });

    const unsubscribeCloseRequest = window.electronAPI.onSettingsCloseRequest(() => {
      handleCloseSettings();
    });

    const unsubscribeProtocol = window.electronAPI.onProtocolReceived(async (url) => {
      console.log('Renderer received custom protocol URL:', url);
      const accs = await window.electronAPI.getAccounts();
      if (accs.length <= 1) {
        window.electronAPI.handleProtocolUrl(accs[0]?.id || 'acc_default', url);
      } else {
        setPromptAccounts(accs);
        setPendingUrl(url);
      }
    });

    window.electronAPI.signalProtocolReady();

    return () => {
      unsubscribeDownload?.();
      unsubscribeCloseRequest?.();
      unsubscribeProtocol?.();
    };
  }, []);

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

      {/* Floating Downloads Tracker */}
      {downloads.length > 0 && (
        <div 
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-xs w-72 select-text"
        >
          {downloads.map((dl) => (
            <div 
              key={dl.id} 
              className="p-3 bg-[#202c33] border border-[#222d34] rounded-lg shadow-2xl flex flex-col gap-2 transition-all duration-300"
            >
              <div className="flex items-center gap-2">
                {dl.state === 'progressing' && <Download className="w-3.5 h-3.5 text-[#00a884] animate-bounce" />}
                {dl.state === 'completed' && <CheckCircle className="w-3.5 h-3.5 text-[#00a884]" />}
                {dl.state === 'failed' && <XCircle className="w-3.5 h-3.5 text-[#ea4335]" />}
                <span className="font-semibold text-[11px] text-[#e9edef] truncate flex-1" title={dl.filename}>
                  {dl.filename}
                </span>
                <button 
                  onClick={() => setDownloads(prev => prev.filter(d => d.id !== dl.id))}
                  className="p-0.5 text-[#8696a0] hover:text-[#e9edef] rounded hover:bg-[#111b21] transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>

              {dl.state === 'progressing' && (
                <div className="space-y-1">
                  <div className="w-full bg-[#111b21] rounded-full h-1 overflow-hidden">
                    <div 
                      className="bg-[#00a884] h-1 rounded-full transition-all duration-200"
                      style={{ width: `${dl.percent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] text-[#8696a0]">
                    <span>{dl.percent}%</span>
                    <span>
                      {dl.receivedBytes && dl.totalBytes
                        ? `${(dl.receivedBytes / (1024 * 1024)).toFixed(1)} MB of ${(dl.totalBytes / (1024 * 1024)).toFixed(1)} MB`
                        : ''}
                    </span>
                  </div>
                </div>
              )}

              {dl.state === 'completed' && (
                <div className="text-[9px] text-[#00a884] font-semibold">
                  Saved to Downloads folder
                </div>
              )}

              {dl.state === 'failed' && (
                <div className="text-[9px] text-[#ea4335] font-semibold">
                  Download failed or cancelled
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Settings Modal Drawer */}
      <SettingsModal isOpen={isSettingsOpen} onClose={handleCloseSettings} />

      {/* Custom Protocol Account Switcher Prompt */}
      {pendingUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm select-text font-sans">
          <div className="bg-[#222e35] border border-[#2c3943] w-[400px] rounded-xl shadow-2xl overflow-hidden flex flex-col p-6 animate-in fade-in duration-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-[#e9edef] text-sm font-semibold">Open WhatsApp Link</h2>
              <button 
                onClick={() => setPendingUrl(null)}
                className="text-[#8696a0] hover:text-[#e9edef] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <p className="text-[#8696a0] text-xs leading-relaxed mb-5">
              An external link wants to open a chat. Select which WhatsApp account you'd like to open this link in:
            </p>

            <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
              {promptAccounts.map((account) => (
                <button
                  key={account.id}
                  onClick={() => {
                    window.electronAPI.handleProtocolUrl(account.id, pendingUrl);
                    setPendingUrl(null);
                  }}
                  className="flex items-center gap-3 p-3 bg-[#111b21] hover:bg-[#202c33] border border-[#2c3943] hover:border-[#00a884] rounded-lg text-left transition-all duration-200"
                >
                  <div className="w-8 h-8 rounded-full bg-[#00a884]/10 border border-[#00a884]/20 flex items-center justify-center text-[#00a884] font-semibold text-xs shrink-0">
                    {account.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[#e9edef] text-xs font-semibold truncate">{account.name}</div>
                    <div className="text-[#8696a0] text-[10px] truncate">
                      {account.loggedIn ? 'Logged in' : 'Not logged in'}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex justify-end mt-5 pt-3 border-t border-[#2c3943]">
              <button
                onClick={() => setPendingUrl(null)}
                className="px-4 py-2 text-xs font-semibold text-[#8696a0] hover:text-[#e9edef] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
