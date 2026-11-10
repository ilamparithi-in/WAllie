import { useState, useEffect } from 'react';
import type { AccountInfo } from '../../preload';

export function useAccounts() {
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string>('');

  useEffect(() => {
    if (!window.electronAPI) return;

    window.electronAPI.getAccounts().then((accs) => setAccounts(accs));
    window.electronAPI.getActiveAccountId().then((id) => setActiveAccountId(id));

    const unsubscribe = window.electronAPI.onAccountListChanged((updatedAccounts, updatedActiveId) => {
      setAccounts(updatedAccounts);
      setActiveAccountId(updatedActiveId);
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  const activeAccount = accounts.find((a) => a.id === activeAccountId);
  const isActiveAccountLoaded = activeAccount ? activeAccount.isLoaded !== false : false;

  return {
    accounts,
    setAccounts,
    activeAccountId,
    setActiveAccountId,
    activeAccount,
    isActiveAccountLoaded,
  };
}

