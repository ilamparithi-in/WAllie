import React, { useState, useEffect } from 'react';
import { SettingsModal } from './components/SettingsModal';
import { useTheme } from './hooks/useTheme';
import type { SettingsPageType } from './types';

export const SettingsApp: React.FC = () => {
  useTheme();

  const params = new URLSearchParams(window.location.search);
  const rawPage = params.get('page') as SettingsPageType | null;
  const rawAccountId = params.get('accountId') || undefined;

  const [activePage, setActivePage] = useState<SettingsPageType | undefined>(rawPage || undefined);
  const [activeAccountId, setActiveAccountId] = useState<string | undefined>(rawAccountId);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onSettingsNavigate?.((data) => {
      if (data.page) {
        setActivePage(data.page as SettingsPageType);
      }
      if (data.accountId) {
        setActiveAccountId(data.accountId);
      }
    });
    return () => unsubscribe?.();
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#111b21] overflow-hidden select-text">
      <SettingsModal
        isOpen={true}
        isDetached={true}
        initialPage={activePage}
        initialAccountId={activeAccountId}
        onClose={() => {
          window.electronAPI?.closeWindow();
        }}
        onShowDisclaimer={() => {
          // If disclaimer needed, delegate to main window or log
        }}
      />
    </div>
  );
};
