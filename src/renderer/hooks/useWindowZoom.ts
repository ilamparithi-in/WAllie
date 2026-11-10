import { useEffect, useRef } from 'react';
import type { GlobalSettings } from '../../preload';

export function useWindowZoom(globalSettings: GlobalSettings | null) {
  const globalSettingsRef = useRef<GlobalSettings | null>(globalSettings);
  globalSettingsRef.current = globalSettings;

  useEffect(() => {
    let wheelZoomTimeout: NodeJS.Timeout | null = null;
    let accumulatedDeltaY = 0;

    const handleWheelZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (globalSettingsRef.current?.ctrlScrollZoomEnabled !== false) {
          accumulatedDeltaY += e.deltaY;
          if (wheelZoomTimeout) clearTimeout(wheelZoomTimeout);
          wheelZoomTimeout = setTimeout(() => {
            if (Math.abs(accumulatedDeltaY) > 5) {
              const direction = accumulatedDeltaY < 0 ? 'in' : 'out';
              window.electronAPI?.triggerZoomStep?.(direction);
            }
            accumulatedDeltaY = 0;
          }, 30);
        }
      }
    };

    window.addEventListener('wheel', handleWheelZoom, { passive: false });
    return () => {
      window.removeEventListener('wheel', handleWheelZoom);
      if (wheelZoomTimeout) clearTimeout(wheelZoomTimeout);
    };
  }, []);
}

