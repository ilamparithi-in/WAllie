import { useState, useEffect, useCallback } from 'react';
import type { DownloadState } from '../types';

export function useDownloads() {
  const [downloads, setDownloads] = useState<DownloadState[]>([]);

  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubscribe = window.electronAPI.onDownloadProgress((data) => {
      if (data.state === 'cancelled') {
        setDownloads((prev) => prev.filter((d) => d.id !== data.id));
        return;
      }

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

    return () => {
      unsubscribe?.();
    };
  }, []);

  const removeDownload = useCallback((id: number) => {
    setDownloads((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const openDownloadedFile = useCallback((savePath: string) => {
    window.electronAPI?.openDownloadedFile?.(savePath);
  }, []);

  const showItemInFolder = useCallback((savePath: string) => {
    window.electronAPI?.showItemInFolder?.(savePath);
  }, []);

  return {
    downloads,
    removeDownload,
    openDownloadedFile,
    showItemInFolder,
  };
}

