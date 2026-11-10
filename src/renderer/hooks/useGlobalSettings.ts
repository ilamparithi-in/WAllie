import { useState, useEffect, useRef, useCallback } from 'react';
import type { GlobalSettings } from '../../preload';

export function useGlobalSettings() {
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(null);
  const globalSettingsRef = useRef<GlobalSettings | null>(null);
  globalSettingsRef.current = globalSettings;

  useEffect(() => {
    if (!window.electronAPI) return;

    window.electronAPI.getGlobalSettings().then((settings) => {
      setGlobalSettings(settings);
      if (!settings.disclaimerAccepted) {
        window.electronAPI.toggleDisclaimer(true);
      }
    });

    const unsubscribe = window.electronAPI.onGlobalSettingsChanged((settings) => {
      setGlobalSettings(settings);
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  const updateGlobalSettings = useCallback(async (updatedSettings: GlobalSettings): Promise<boolean> => {
    if (!window.electronAPI) return false;
    const success = await window.electronAPI.saveGlobalSettings(updatedSettings);
    if (success) {
      setGlobalSettings(updatedSettings);
    }
    return success;
  }, []);

  return {
    globalSettings,
    globalSettingsRef,
    setGlobalSettings,
    updateGlobalSettings,
  };
}

