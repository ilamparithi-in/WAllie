import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Titlebar } from './components/Titlebar';
import { SettingsModal } from './components/SettingsModal';
import { DownloadsTracker } from './components/DownloadsTracker';
import { ToastContainer } from './components/ToastContainer';

import { useAccounts } from './hooks/useAccounts';
import { useGlobalSettings } from './hooks/useGlobalSettings';
import { useTheme } from './hooks/useTheme';
import { useDownloads } from './hooks/useDownloads';
import { useToasts } from './hooks/useToasts';
import { useWindowZoom } from './hooks/useWindowZoom';

import type { SettingsPageType } from './types';

export const App: React.FC = () => {
  // Domain hooks
  const { isActiveAccountLoaded } = useAccounts();
  const { globalSettings } = useGlobalSettings();
  const globalSettingsRef = useRef(globalSettings);
  globalSettingsRef.current = globalSettings;
  useTheme();
  const { downloads, removeDownload, openDownloadedFile, showItemInFolder } = useDownloads();
  const { toasts, showToast, dismissToast } = useToasts();
  useWindowZoom(globalSettings);

  // Settings modal drawer state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialPage, setSettingsInitialPage] = useState<SettingsPageType | undefined>(undefined);
  const [settingsInitialAccountId, setSettingsInitialAccountId] = useState<string | undefined>(undefined);

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

  // Legal Disclaimer initial check
  useEffect(() => {
    if (globalSettings && globalSettings.disclaimerAccepted === false) {
      window.electronAPI?.openDisclaimerWindow?.(true);
    }
  }, [globalSettings]);

  // Protocol URL prompt reopen handler
  const handleReopenPrompt = useCallback(async (url: string) => {
    window.electronAPI?.openProtocolPromptWindow?.(url);
  }, []);

  // IPC Event Subscriptions for window-level actions
  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubscribeTriggerAdd = window.electronAPI.onTriggerAddAccount?.(() => {
      window.electronAPI?.openAddAccountWindow?.();
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
            window.electronAPI?.openProtocolPromptWindow?.(url);
          }
          return;
        }
      }

      // Default behavior ("Ask Everytime"):
      window.electronAPI?.openProtocolPromptWindow?.(url);
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

  return (
    <div className="h-screen w-screen flex flex-col bg-[#111b21] overflow-hidden select-none">
      {/* Custom Titlebar (28px) */}
      <Titlebar
        onToggleSettings={handleToggleSettings}
        onOpenNotificationHistory={handleOpenNotificationHistory}
        isDisclaimerAccepted={isDisclaimerAccepted}
        onOpenAddAccount={() => window.electronAPI?.openAddAccountWindow?.()}
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
          window.electronAPI?.openDisclaimerWindow?.(false);
        }}
        onOpenAddAccount={() => window.electronAPI?.openAddAccountWindow?.()}
      />

      {/* Toast Notifications */}
      <ToastContainer
        toasts={toasts}
        onDismiss={dismissToast}
        onReopen={handleReopenPrompt}
      />
    </div>
  );
};
