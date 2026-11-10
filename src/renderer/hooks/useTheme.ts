import { useEffect } from 'react';

export function useTheme() {
  useEffect(() => {
    if (!window.electronAPI) return;

    const applyDomTheme = (isDark: boolean) => {
      if (isDark) {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
        document.documentElement.setAttribute('data-theme', 'dark');
      } else {
        document.documentElement.classList.add('light');
        document.documentElement.classList.remove('dark');
        document.documentElement.setAttribute('data-theme', 'light');
      }
    };

    window.electronAPI.getThemeInfo?.()
      .then((info) => {
        if (info) applyDomTheme(info.shouldUseDarkColors);
      })
      .catch(() => {});

    const unsubscribe = window.electronAPI.onThemeChanged?.((info) => {
      if (info) applyDomTheme(info.shouldUseDarkColors);
    });

    return () => {
      unsubscribe?.();
    };
  }, []);
}

