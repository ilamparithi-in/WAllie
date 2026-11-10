import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Titlebar } from './components/Titlebar';
import { SettingsModal } from './components/SettingsModal';
import { DownloadsTracker } from './components/DownloadsTracker';
import { ToastContainer } from './components/ToastContainer';
import { DisclaimerModal } from './components/DisclaimerModal';
import { ProtocolPromptModal } from './components/ProtocolPromptModal';
import { AvatarZoomModal } from './components/AvatarZoomModal';

import { useAccounts } from './hooks/useAccounts';
import { useGlobalSettings } from './hooks/useGlobalSettings';
import { useTheme } from './hooks/useTheme';
import { useDownloads } from './hooks/useDownloads';
import { useToasts } from './hooks/useToasts';
import { useWindowZoom } from './hooks/useWindowZoom';

import type { AccountInfo } from '../preload';
import type { SettingsPageType } from './types';

export const App: React.FC = () => {
  // Domain hooks
  const { accounts, activeAccountId, isActiveAccountLoaded } = useAccounts();
  const { globalSettings, updateGlobalSettings } = useGlobalSettings();
  useTheme();
  const { downloads, removeDownload, openDownloadedFile, showItemInFolder } = useDownloads();
  const { toasts, showToast, dismissToast } = useToasts();
  useWindowZoom(globalSettings);

  // Settings modal state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialPage, setSettingsInitialPage] = useState<SettingsPageType | undefined>(undefined);
  const [settingsInitialAccountId, setSettingsInitialAccountId] = useState<string | undefined>(undefined);

  // Disclaimer modal state
  const [showDisclaimerForce, setShowDisclaimerForce] = useState(false);

  // Protocol handling state
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [promptAccounts, setPromptAccounts] = useState<AccountInfo[]>([]);
  const [isHandlingProtocol, setIsHandlingProtocol] = useState(false);

  // Avatar zoom modal state
  const [avatarModalData, setAvatarModalData] = useState<{ url: string; title: string } | null>(null);

  // Prevent Chromium default behavior (navigating to file://) when files are dropped on window UI
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
        e.preventDefault();
      }
    };
    const handleDrop = (e: DragEvent) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('dragover', handleDragOver, false);
    window.addEventListener('drop', handleDrop, false);
    return () => {
      window.removeEventListener('dragover', handleDragOver, false);
      window.removeEventListener('drop', handleDrop, false);
    };
  }, []);

  // Settings modal handlers
  const handleToggleSettings = useCallback(() => {
    if (isSettingsOpen) {
      window.electronAPI?.toggleSettings(false);
      requestAnimationFrame(() => {
        setIsSettingsOpen(false);
        setSettingsInitialPage('main');
      });
    } else {
      setIsSettingsOpen(true);
      window.electronAPI?.toggleSettings(true);
    }
  }, [isSettingsOpen]);

  const handleOpenNotificationHistory = useCallback(() => {
    setSettingsInitialPage('notifications');
    setIsSettingsOpen(true);
    window.electronAPI?.toggleSettings(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    window.electronAPI?.toggleSettings(false);
    requestAnimationFrame(() => {
      setIsSettingsOpen(false);
      setSettingsInitialPage(undefined);
      setSettingsInitialAccountId(undefined);
    });
  }, []);

  // Disclaimer handlers
  const handleAcceptDisclaimer = useCallback(async () => {
    if (!globalSettings) return;
    const success = await updateGlobalSettings({
      ...globalSettings,
      disclaimerAccepted: true,
    });
    if (success) {
      setShowDisclaimerForce(false);
      window.electronAPI?.toggleDisclaimer(false);
    }
  }, [globalSettings, updateGlobalSettings]);

  const handleDeclineDisclaimer = useCallback(() => {
    window.electronAPI?.closeWindow();
  }, []);

  const handleCloseDisclaimerForce = useCallback(() => {
    setShowDisclaimerForce(false);
    window.electronAPI?.toggleDisclaimer(false);
  }, []);

  // Protocol URL prompt handlers
  const handleCloseProtocolPrompt = useCallback((isCancelled = true) => {
    if (isCancelled && pendingUrl) {
      showToast('Opening link cancelled', pendingUrl);
    }
    setPendingUrl(null);
    window.electronAPI?.toggleProtocolPrompt(false);
  }, [pendingUrl, showToast]);

  const handleReopenPrompt = useCallback(async (url: string) => {
    const accs = await window.electronAPI.getAccounts();
    const loggedInAccs = accs.filter((a) => a.loggedIn);
    const promptList = loggedInAccs.length > 0 ? loggedInAccs : accs;
    setPromptAccounts(promptList);
    setPendingUrl(url);
    window.electronAPI?.toggleProtocolPrompt(true);
  }, []);

  const handleSelectProtocolAccount = useCallback(async (accountId: string) => {
    if (!pendingUrl || isHandlingProtocol) return;
    const urlToOpen = pendingUrl;
    const targetAccount = promptAccounts.find((a) => a.id === accountId);
    setIsHandlingProtocol(true);
    try {
      const res = await window.electronAPI.handleProtocolUrl(accountId, urlToOpen);
      if (res && res.success) {
        showToast(`Opening link in ${targetAccount?.name || 'account'}...`, urlToOpen);
        setPendingUrl(null);
        window.electronAPI?.toggleProtocolPrompt(false);
      } else if (res && res.cancelled) {
        showToast('Opening link cancelled', urlToOpen);
        console.log('User cancelled page unload. Keeping pending URL prompt open.');
      }
    } finally {
      setIsHandlingProtocol(false);
    }
  }, [pendingUrl, isHandlingProtocol, promptAccounts, showToast]);

  // IPC Event Subscriptions for window-level actions
  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubscribeCloseRequest = window.electronAPI.onSettingsCloseRequest(() => {
      handleCloseSettings();
    });

    const unsubscribeOpenManage = window.electronAPI.onOpenManageAccounts((accountId) => {
      setSettingsInitialPage('accounts');
      setSettingsInitialAccountId(accountId);
      setIsSettingsOpen(true);
      window.electronAPI?.toggleSettings(true);
    });

    const unsubscribeProtocol = window.electronAPI.onProtocolReceived(async (url) => {
      console.log('Renderer received custom protocol URL:', url);
      const accs = await window.electronAPI.getAccounts();
      const defaultAccountId = globalSettings?.defaultProtocolAccountId;

      // If a specific default account is set and valid (and not 'ask'):
      if (defaultAccountId && defaultAccountId !== 'ask') {
        const targetAcc = accs.find((a) => a.id === defaultAccountId);
        if (targetAcc) {
          const res = await window.electronAPI.handleProtocolUrl(targetAcc.id, url);
          if (res && res.success) {
            showToast(`Opening link in ${targetAcc.name}...`, url);
          } else if (res && res.cancelled) {
            showToast('Opening link cancelled', url);
            const loggedInAccs = accs.filter((a) => a.loggedIn);
            setPromptAccounts(loggedInAccs.length > 0 ? loggedInAccs : accs);
            setPendingUrl(url);
            window.electronAPI.toggleProtocolPrompt(true);
          }
          return;
        }
      }

      // Default behavior ("Ask Everytime"):
      const loggedInAccs = accs.filter((a) => a.loggedIn);
      const promptList = loggedInAccs.length > 0 ? loggedInAccs : accs;
      setPromptAccounts(promptList);
      setPendingUrl(url);
      window.electronAPI.toggleProtocolPrompt(true);
    });

    const unsubscribeReopenPrompt = window.electronAPI.onProtocolReopenPrompt?.((url) => {
      handleReopenPrompt(url);
    });

    window.electronAPI.signalProtocolReady();

    return () => {
      unsubscribeCloseRequest?.();
      unsubscribeOpenManage?.();
      unsubscribeProtocol?.();
      unsubscribeReopenPrompt?.();
    };
  }, [globalSettings, handleCloseSettings, handleReopenPrompt, showToast]);

  // Loading screen before settings load
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

  return (
    <div className="h-screen w-screen flex flex-col bg-[#111b21] overflow-hidden select-none">
      {/* Custom Titlebar (28px) */}
      <Titlebar
        onToggleSettings={handleToggleSettings}
        onOpenNotificationHistory={handleOpenNotificationHistory}
        isDisclaimerAccepted={isDisclaimerAccepted}
      />

      {/* Main Container Area: The Electron WebContentsView will overlay this area below the titlebar */}
      <main className="flex-1 w-full relative bg-[#111b21]">
        {!isActiveAccountLoaded && (
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
        )}
      </main>

      {/* Floating Downloads Tracker */}
      <DownloadsTracker
        downloads={downloads}
        onRemove={removeDownload}
        onOpenFile={openDownloadedFile}
        onShowInFolder={showItemInFolder}
      />

      {/* Settings Modal Drawer */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={handleCloseSettings}
        initialPage={settingsInitialPage}
        initialAccountId={settingsInitialAccountId}
        onShowDisclaimer={() => {
          setShowDisclaimerForce(true);
          window.electronAPI?.toggleDisclaimer(true);
        }}
      />

      {/* Legal Disclaimer Modal Overlay */}
      <DisclaimerModal
        isOpen={showDisclaimerOverlay}
        isFirstLaunch={!isDisclaimerAccepted}
        onAccept={handleAcceptDisclaimer}
        onDecline={handleDeclineDisclaimer}
        onClose={handleCloseDisclaimerForce}
      />

      {/* Custom Protocol Account Switcher Prompt */}
      <ProtocolPromptModal
        pendingUrl={pendingUrl}
        accounts={promptAccounts}
        isHandlingProtocol={isHandlingProtocol}
        onSelectAccount={handleSelectProtocolAccount}
        onClose={handleCloseProtocolPrompt}
        onOpenAvatar={(url, title) => setAvatarModalData({ url, title: title || 'Group Display Picture' })}
        disableEscape={Boolean(avatarModalData)}
      />

      {/* Toast Notifications */}
      <ToastContainer
        toasts={toasts}
        onDismiss={dismissToast}
        onReopen={handleReopenPrompt}
      />

      {/* Nested Avatar / Display Picture Zoom Modal */}
      <AvatarZoomModal
        data={avatarModalData}
        onClose={() => setAvatarModalData(null)}
      />
    </div>
  );
};
