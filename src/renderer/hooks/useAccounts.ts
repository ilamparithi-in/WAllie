import { useState, useEffect, useCallback } from 'react';
import type { AccountInfo, WebErrorDetails } from '../../preload';

export function useAccounts() {
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string>('');
  const [accountErrors, setAccountErrors] = useState<Record<string, WebErrorDetails>>({});
  const [isAccountLoading, setIsAccountLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!window.electronAPI) return;

    window.electronAPI.getAccounts().then((accs) => setAccounts(accs));
    window.electronAPI.getActiveAccountId().then((id) => {
      setActiveAccountId(id);
      if (id) {
        window.electronAPI.getAccountLoadError(id).then((err) => {
          if (err) {
            setAccountErrors((prev) => ({ ...prev, [id]: err }));
          }
        });
      }
    });

    const unsubscribeList = window.electronAPI.onAccountListChanged((updatedAccounts, updatedActiveId) => {
      setAccounts(updatedAccounts);
      setActiveAccountId(updatedActiveId);
      if (updatedActiveId) {
        window.electronAPI.getAccountLoadError(updatedActiveId).then((err) => {
          if (err) {
            setAccountErrors((prev) => ({ ...prev, [updatedActiveId]: err }));
          } else {
            setAccountErrors((prev) => {
              if (!prev[updatedActiveId]) return prev;
              const next = { ...prev };
              delete next[updatedActiveId];
              return next;
            });
          }
        });
      }
    });

    const unsubscribeError = window.electronAPI.onAccountLoadError?.((error) => {
      setAccountErrors((prev) => ({ ...prev, [error.accountId]: error }));
      setIsAccountLoading(false);
    });

    const unsubscribeErrorCleared = window.electronAPI.onAccountLoadErrorCleared?.((data) => {
      setAccountErrors((prev) => {
        if (!prev[data.accountId]) return prev;
        const next = { ...prev };
        delete next[data.accountId];
        return next;
      });
      setIsAccountLoading(false);
    });

    const unsubscribeLoadStarted = window.electronAPI.onAccountLoadStarted?.((data) => {
      if (data.accountId === activeAccountId) {
        setIsAccountLoading(true);
      }
    });

    return () => {
      unsubscribeList?.();
      unsubscribeError?.();
      unsubscribeErrorCleared?.();
      unsubscribeLoadStarted?.();
    };
  }, [activeAccountId]);

  const activeAccount = accounts.find((a) => a.id === activeAccountId);
  const isActiveAccountLoaded = activeAccount ? activeAccount.isLoaded !== false : false;
  const activeAccountError = activeAccountId ? accountErrors[activeAccountId] || null : null;

  const reloadActive = useCallback(() => {
    setIsAccountLoading(true);
    window.electronAPI?.reloadActiveAccount();
  }, []);

  const loadActiveHome = useCallback(async () => {
    if (!activeAccountId) return;
    setIsAccountLoading(true);
    await window.electronAPI?.loadAccountUrl(activeAccountId, 'https://web.whatsapp.com');
  }, [activeAccountId]);

  return {
    accounts,
    setAccounts,
    activeAccountId,
    setActiveAccountId,
    activeAccount,
    isActiveAccountLoaded,
    activeAccountError,
    accountErrors,
    isAccountLoading,
    reloadActive,
    loadActiveHome,
  };
}


