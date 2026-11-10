import { useState, useEffect, useRef, useCallback } from 'react';
import type { ToastItem } from '../types';

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const isNavConfirmActiveRef = useRef(false);
  const deferredToastsRef = useRef<{ message: string; url?: string }[]>([]);
  const toastsRef = useRef<ToastItem[]>([]);
  toastsRef.current = toasts;

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isExiting: true } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  }, []);

  const showToast = useCallback((message: string, url?: string) => {
    if (isNavConfirmActiveRef.current) {
      console.log('Nav confirmation is open. Deferring toast:', message);
      deferredToastsRef.current.push({ message, url });
      return;
    }

    const currentToasts = toastsRef.current;
    const isDuplicate = currentToasts.some((t) => t.message === message && !t.isExiting);
    if (isDuplicate) return;

    const toastId = Date.now() + Math.random();
    setToasts((prev) => {
      if (prev.some((t) => t.message === message && !t.isExiting)) return prev;
      return [...prev, { id: toastId, message, url, isExiting: false }];
    });
    window.electronAPI?.showToast?.(message, url);
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubscribeToast = window.electronAPI.onToastShow((data) => {
      showToast(data.message, data.url);
    });

    const unsubscribeNavConfirm = window.electronAPI.onNavConfirmationActive?.((isActive) => {
      isNavConfirmActiveRef.current = isActive;
      if (!isActive && deferredToastsRef.current.length > 0) {
        const queued = [...deferredToastsRef.current];
        deferredToastsRef.current = [];
        queued.forEach((item) => {
          showToast(item.message, item.url);
        });
      }
    });

    return () => {
      unsubscribeToast?.();
      unsubscribeNavConfirm?.();
    };
  }, [showToast]);

  return {
    toasts,
    showToast,
    dismissToast,
  };
}

