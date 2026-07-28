import React, { useState, useEffect } from 'react';
import { Titlebar } from './components/Titlebar';
import { SettingsModal } from './components/SettingsModal';
import { Download, CheckCircle, XCircle, X, Shield } from 'lucide-react';

import type { AccountInfo, GlobalSettings } from '../preload';

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
  const [settingsInitialPage, setSettingsInitialPage] = useState<'main' | 'extensions' | 'css' | 'storage' | 'notifications' | 'general' | 'preload' | 'permissions' | 'accounts' | undefined>(undefined);
  const [settingsInitialAccountId, setSettingsInitialAccountId] = useState<string | undefined>(undefined);

  const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(null);
  const [showDisclaimerForce, setShowDisclaimerForce] = useState(false);
  const [disclaimerChecked, setDisclaimerChecked] = useState(false);

  useEffect(() => {
    if (!window.electronAPI) return;

    // Load initial global settings
    window.electronAPI.getGlobalSettings().then((settings) => {
      setGlobalSettings(settings);
      if (!settings.disclaimerAccepted) {
        window.electronAPI.toggleDisclaimer(true);
      }
    });

    const unsubscribeGlobalSettings = window.electronAPI.onGlobalSettingsChanged((settings) => {
      setGlobalSettings(settings);
    });

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
      const loggedInAccs = accs.filter((a) => a.loggedIn);
      if (loggedInAccs.length <= 1) {
        const targetId = loggedInAccs.length === 1
          ? loggedInAccs[0].id
          : (await window.electronAPI.getActiveAccountId() || accs[0]?.id || 'acc_default');
        window.electronAPI.handleProtocolUrl(targetId, url);
      } else {
        setPromptAccounts(loggedInAccs);
        setPendingUrl(url);
        window.electronAPI.toggleProtocolPrompt(true);
      }
    });

    const unsubscribeOpenManage = window.electronAPI.onOpenManageAccounts((accountId) => {
      setSettingsInitialPage('accounts');
      setSettingsInitialAccountId(accountId);
      setIsSettingsOpen(true);
      window.electronAPI?.toggleSettings(true);
    });

    window.electronAPI.signalProtocolReady();

    return () => {
      unsubscribeGlobalSettings?.();
      unsubscribeDownload?.();
      unsubscribeCloseRequest?.();
      unsubscribeProtocol?.();
      unsubscribeOpenManage?.();
    };
  }, []);

  const handleToggleSettings = () => {
    setIsSettingsOpen((prev) => {
      const next = !prev;
      window.electronAPI?.toggleSettings(next);
      return next;
    });
  };

  const handleCloseSettings = () => {
    setIsSettingsOpen(false);
    setSettingsInitialPage(undefined);
    setSettingsInitialAccountId(undefined);
    window.electronAPI?.toggleSettings(false);
  };

  const handleAcceptDisclaimer = async () => {
    if (!globalSettings) return;
    const updatedSettings = {
      ...globalSettings,
      disclaimerAccepted: true
    };
    const success = await window.electronAPI.saveGlobalSettings(updatedSettings);
    if (success) {
      setGlobalSettings(updatedSettings);
      window.electronAPI.toggleDisclaimer(false);
    }
  };

  const handleDeclineDisclaimer = () => {
    window.electronAPI?.closeWindow();
  };

  if (globalSettings === null) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#111b21] text-[#8696a0] text-sm gap-2 font-sans select-none">
        <div className="w-8 h-8 rounded-full border-2 border-[#00a884] border-t-transparent animate-spin" />
        <span>Loading configurations...</span>
      </div>
    );
  }

  const isDisclaimerAccepted = !!globalSettings.disclaimerAccepted;
  const showDisclaimerOverlay = !isDisclaimerAccepted || showDisclaimerForce;
  const isFirstLaunchMode = !isDisclaimerAccepted;

  return (
    <div className="h-screen w-screen flex flex-col bg-[#111b21] overflow-hidden select-none">
      {/* Custom Titlebar (28px) */}
      <Titlebar onToggleSettings={handleToggleSettings} isDisclaimerAccepted={isDisclaimerAccepted} />

      {/* Main Container Area: The Electron WebContentsView will overlay this area below the titlebar */}
      <main className="flex-1 w-full relative bg-[#111b21]">
        {/* Placeholder background state when loading view */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-[#8696a0] text-sm gap-2">
          {isDisclaimerAccepted ? (
            <>
              <div className="w-8 h-8 rounded-full border-2 border-[#00a884] border-t-transparent animate-spin" />
              <span>Connecting to WhatsApp Web...</span>
            </>
          ) : (
            <span>Please review and accept the legal disclaimer to proceed.</span>
          )}
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
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={handleCloseSettings}
        initialPage={settingsInitialPage}
        initialAccountId={settingsInitialAccountId}
        onShowDisclaimer={() => {
          setShowDisclaimerForce(true);
          window.electronAPI.toggleDisclaimer(true);
        }}
      />

      {/* Custom Protocol Account Switcher Prompt */}
      {pendingUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm select-text font-sans">
          <div className="bg-[#222e35] border border-[#2c3943] w-[400px] rounded-xl shadow-2xl overflow-hidden flex flex-col p-6 animate-in fade-in duration-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-[#e9edef] text-sm font-semibold">Open WhatsApp Link</h2>
              <button
                onClick={() => {
                  setPendingUrl(null);
                  window.electronAPI.toggleProtocolPrompt(false);
                }}
                className="text-[#8696a0] hover:text-[#e9edef] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[#8696a0] text-xs leading-relaxed mb-5">
              An external link wants to open a chat. <b>The page will be refreshed!</b> Select which WhatsApp account you'd like to open this link in:
            </p>

            <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
              {promptAccounts.map((account) => (
                <button
                  key={account.id}
                  onClick={() => {
                    window.electronAPI.handleProtocolUrl(account.id, pendingUrl);
                    setPendingUrl(null);
                    window.electronAPI.toggleProtocolPrompt(false);
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
                onClick={() => {
                  setPendingUrl(null);
                  window.electronAPI.toggleProtocolPrompt(false);
                }}
                className="px-4 py-2 text-xs font-semibold text-[#8696a0] hover:text-[#e9edef] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Legal Disclaimer Modal Overlay */}
      {showDisclaimerOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b141a]/95 select-text font-sans p-4 bg-[radial-gradient(ellipse_at_center,rgba(0,168,132,0.12),transparent_70%)] animate-in fade-in duration-300">
          <div className="bg-[#222e35]/95 backdrop-blur-md border border-[#2c3943]/80 w-full max-w-2xl rounded-2xl shadow-2xl p-7 flex flex-col max-h-[90vh] overflow-hidden transform scale-100 animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-[#00a884]/15 border border-[#00a884]/30 flex items-center justify-center text-[#00a884] mx-auto mb-3">
                <Shield className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-[#e9edef] tracking-wide">Legal Disclaimer</h2>
              <p className="text-[11px] text-[#8696a0] mt-0.5">WAllie - Unofficial WhatsApp Desktop Client</p>
            </div>

            {/* Scrollable Terms Content */}
            <div className="flex-1 overflow-y-auto bg-[#111b21]/70 border border-[#222d34] rounded-xl p-5 my-4 text-xs text-[#8696a0] leading-relaxed space-y-4 pr-3 select-text">
              <div>
                <h4 className="font-bold text-[#e9edef] mb-1">1. Acceptance of Terms</h4>
                <p>
                  By using WAllie (the "Application"), you agree to be bound by this legal disclaimer. If you do not agree to these terms, you must immediately decline and terminate the use of this Application.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-[#e9edef] mb-1">2. Unofficial Client Status</h4>
                <p>
                  WAllie is an unofficial, third-party client for WhatsApp. It is not affiliated, associated, authorized, endorsed by, or in any way officially connected with WhatsApp LLC, Meta Platforms, Inc., or any of their affiliates. The official WhatsApp service can be found at <a href="https://whatsapp.com" target="_blank" rel="noopener noreferrer" className="text-[#00a884] hover:underline">https://whatsapp.com</a>. "WhatsApp" and all related trademarks, names, and logos are the property of Meta Platforms, Inc.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-[#e9edef] mb-1">3. Limitation of Liability</h4>
                <p>
                  The Application is provided "AS IS", without warranty of any kind, express or implied. Under no circumstances shall the developer, contributors, or copyright holders of WAllie be liable for any direct, indirect, incidental, special, consequential, or punitive damages, including but not limited to:
                </p>
                <ul className="list-disc pl-5 mt-1.5 space-y-1">
                  <li>Any issues with your connection to or availability of the WhatsApp Web service.</li>
                  <li>Data loss, corruption, or leakages.</li>
                  <li>Any damages resulting from software errors, crashes, or security vulnerabilities.</li>
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-[#e9edef] mb-1">4. Terms of Service</h4>
                <p>
                  WAllie acts strictly as a web wrapper for the official WhatsApp Web application. The Application does not contain any automated bots, scraping scripts, spamming features, or policy-violating tools. Users are solely responsible for ensuring their usage of the application complies with WhatsApp's Terms of Service.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-[#e9edef] mb-1">5. Third-Party Extensions & Custom CSS</h4>
                <p>
                  WAllie allows the loading of third-party Chrome extensions and custom stylesheets (CSS). The developer of this Application has no control over, and assumes no responsibility for, the code, privacy policies, or actions of any third-party extensions or custom scripts you choose to import. You are solely responsible for verifying the safety of any custom code or extension you load.
                </p>
              </div>
            </div>

            {/* Footer */}
            {isFirstLaunchMode ? (
              <div className="space-y-4">
                <label className="flex items-start gap-3 cursor-pointer group mt-1 select-none text-left">
                  <input
                    type="checkbox"
                    checked={disclaimerChecked}
                    onChange={(e) => setDisclaimerChecked(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-[#2c3943] bg-[#111b21] text-[#00a884] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#00a884]"
                  />
                  <span className="text-[11px] text-[#8696a0] group-hover:text-[#e9edef] transition-colors leading-normal select-text">
                    I acknowledge that WAllie is an unofficial wrapper for WhatsApp Web, and I agree that the developer of this application is not responsible for any operations, actions, or consequences of my usage.
                  </span>
                </label>

                <div className="flex gap-3 justify-end border-t border-[#2c3943]/60 pt-4">
                  <button
                    onClick={handleDeclineDisclaimer}
                    className="px-5 py-2 rounded-lg text-xs font-semibold bg-[#2a3942] hover:bg-[#3d4f5c] text-[#ea4335] hover:text-[#ff6b6b] transition-all duration-200 cursor-pointer"
                  >
                    Decline & Exit
                  </button>
                  <button
                    onClick={handleAcceptDisclaimer}
                    disabled={!disclaimerChecked}
                    className={`px-6 py-2 rounded-lg text-xs font-bold text-[#111b21] transition-all duration-200 flex items-center gap-1.5 shadow-lg ${disclaimerChecked
                        ? 'bg-[#00a884] hover:bg-[#00c298] hover:shadow-[#00a884]/20 cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0'
                        : 'bg-[#00a884]/40 text-[#111b21]/50 cursor-not-allowed'
                      }`}
                  >
                    Accept & Continue
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end border-t border-[#2c3943]/60 pt-4">
                <button
                  onClick={() => {
                    setShowDisclaimerForce(false);
                    window.electronAPI.toggleDisclaimer(false);
                  }}
                  className="px-6 py-2 rounded-lg text-xs font-semibold bg-[#00a884] hover:bg-[#00c298] text-[#111b21] transition-all duration-200 shadow-md cursor-pointer"
                >
                  Close Disclaimer
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
