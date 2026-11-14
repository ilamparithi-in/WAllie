import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Titlebar } from './components/Titlebar';
import { SettingsModal } from './components/SettingsModal';
import { DownloadsTracker } from './components/DownloadsTracker';
import { ToastContainer } from './components/ToastContainer';
import { DisclaimerModal } from './components/DisclaimerModal';
import { ProtocolPromptModal } from './components/ProtocolPromptModal';
import { AvatarZoomModal } from './components/AvatarZoomModal';
import { AddAccountModal } from './components/AddAccountModal';

import { useAccounts } from './hooks/useAccounts';
import { useGlobalSettings } from './hooks/useGlobalSettings';
import { useTheme } from './hooks/useTheme';
import { useDownloads } from './hooks/useDownloads';
import { useToasts } from './hooks/useToasts';
import { useWindowZoom } from './hooks/useWindowZoom';

import type { AccountInfo, AddAccountOptions } from '../preload';
import type { SettingsPageType } from './types';

export const App: React.FC = () => {
  // Domain hooks
  const { accounts, isActiveAccountLoaded } = useAccounts();
  const { globalSettings, updateGlobalSettings } = useGlobalSettings();
  const globalSettingsRef = useRef(globalSettings);
  globalSettingsRef.current = globalSettings;
  useTheme();
  const { downloads, removeDownload, openDownloadedFile, showItemInFolder } = useDownloads();
  const { toasts, showToast, dismissToast } = useToasts();
  useWindowZoom(globalSettings);

  // Settings modal state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialPage, setSettingsInitialPage] = useState<SettingsPageType | undefined>(undefined);
  const [settingsInitialAccountId, setSettingsInitialAccountId] = useState<string | undefined>(undefined);

  // Add account modal state
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);

  // Disclaimer modal state
  const [showDisclaimerForce, setShowDisclaimerForce] = useState(false);

  // Protocol handling state
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [promptAccounts, setPromptAccounts] = useState<AccountInfo[]>([]);
  const [isHandlingProtocol, setIsHandlingProtocol] = useState(false);

  // Avatar zoom modal state
  const [avatarModalData, setAvatarModalData] = useState<{ url: string; title: string } | null>(null);

  // Settings subpage tracking for popout / detaching
  const currentSettingsStateRef = useRef<{ page?: SettingsPageType; accountId?: string }>({});

  const isPortraitThreshold = () => window.innerWidth <= 900;

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
  const handleToggleSettings = useCallback(async () => {
    const isDetached = await window.electronAPI?.isSettingsDetachedOpen?.();
    if (isDetached) {
      window.electronAPI?.openDetachedSettings?.();
      return;
    }

    if (isPortraitThreshold()) {
      window.electronAPI?.openDetachedSettings?.(settingsInitialPage, settingsInitialAccountId);
      return;
    }

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
  }, [isSettingsOpen, settingsInitialPage, settingsInitialAccountId]);

  const handleOpenNotificationHistory = useCallback(async () => {
    const isDetached = await window.electronAPI?.isSettingsDetachedOpen?.();
    if (isDetached || isPortraitThreshold()) {
      window.electronAPI?.openDetachedSettings?.('notifications');
      return;
    }
    setSettingsInitialPage('notifications');
    setIsSettingsOpen(true);
    window.electronAPI?.toggleSettings(true);
  }, []);

  const handlePopoutSettings = useCallback((page?: SettingsPageType, accountId?: string) => {
    const targetPage = page || currentSettingsStateRef.current.page || 'main';
    const targetAccountId = accountId || currentSettingsStateRef.current.accountId;
    window.electronAPI?.openDetachedSettings?.(targetPage, targetAccountId);
    window.electronAPI?.toggleSettings(false);
    setIsSettingsOpen(false);
  }, []);

  // Detach settings to its own window when window is resized under portrait threshold (<= 900px)
  useEffect(() => {
    const handleResize = () => {
      if (isSettingsOpen && window.innerWidth <= 900) {
        handlePopoutSettings();
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isSettingsOpen, handlePopoutSettings]);

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

  // Add account modal handlers
  const handleConfirmAddAccount = useCallback(async (options: AddAccountOptions) => {
    const newAcc = await window.electronAPI?.addAccount(options);
    if (newAcc) {
      showToast(`Added account ${newAcc.emoji ? newAcc.emoji + ' ' : ''}${newAcc.name}`, 'Account created successfully');
    }
  }, [showToast]);

  // IPC Event Subscriptions for window-level actions
  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubscribeTriggerAdd = window.electronAPI.onTriggerAddAccount?.(() => {
      setIsAddAccountOpen(true);
    });

    const unsubscribeCloseRequest = window.electronAPI.onSettingsCloseRequest(() => {
      handleCloseSettings();
    });

    const unsubscribeOpenManage = window.electronAPI.onOpenManageAccounts(async (accountId) => {
      const isDetached = await window.electronAPI?.isSettingsDetachedOpen?.();
      if (isDetached || isPortraitThreshold()) {
        window.electronAPI?.openDetachedSettings?.('accounts', accountId);
        return;
      }
      setSettingsInitialPage('accounts');
      setSettingsInitialAccountId(accountId);
      setIsSettingsOpen(true);
      window.electronAPI?.toggleSettings(true);
    });

    const unsubscribeDetachedClosed = window.electronAPI.onDetachedSettingsClosed?.(() => {
      // Closing the detached window is equivalent to completely closing the pane, not reattaching it
      setIsSettingsOpen(false);
    });

    const unsubscribeProtocol = window.electronAPI.onProtocolReceived(async (url) => {
      console.log('Renderer received custom protocol URL:', url);
      const accs = await window.electronAPI.getAccounts();
      const defaultAccountId = globalSettingsRef.current?.defaultProtocolAccountId;

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
      unsubscribeTriggerAdd?.();
      unsubscribeCloseRequest?.();
      unsubscribeOpenManage?.();
      unsubscribeDetachedClosed?.();
      unsubscribeProtocol?.();
      unsubscribeReopenPrompt?.();
    };
  }, [handleCloseSettings, handleReopenPrompt, showToast]);

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
        onOpenAddAccount={() => setIsAddAccountOpen(true)}
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
        onPopout={handlePopoutSettings}
        onCurrentPageChange={(page, accountId) => {
          currentSettingsStateRef.current = { page, accountId };
        }}
        onShowDisclaimer={() => {
          setShowDisclaimerForce(true);
          window.electronAPI?.toggleDisclaimer(true);
        }}
        onOpenAddAccount={() => setIsAddAccountOpen(true)}
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

      {/* Add Account Modal Prompt */}
      <AddAccountModal
        isOpen={isAddAccountOpen}
        onClose={() => setIsAddAccountOpen(false)}
        onConfirm={handleConfirmAddAccount}
        accounts={accounts}
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
