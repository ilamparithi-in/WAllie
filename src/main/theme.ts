import { nativeTheme } from 'electron';
import { state } from './state';

export interface ThemeInfo {
  themeMode: 'system' | 'light' | 'dark';
  shouldUseDarkColors: boolean;
}

export function getThemeInfo(): ThemeInfo {
  const themeMode = state.globalSettings?.themeMode || 'system';
  return {
    themeMode,
    shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
  };
}

export function handleThemeUpdate() {
  const isDark = nativeTheme.shouldUseDarkColors;
  const themeMode = state.globalSettings?.themeMode || 'system';
  const bgColor = isDark ? '#111b21' : '#f0f2f5';

  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    try {
      state.mainWindow.setBackgroundColor(bgColor);
      state.mainWindow.webContents.send('theme:changed', {
        themeMode,
        shouldUseDarkColors: isDark,
      });
    } catch (e) {
      console.error('[Theme] Error updating main window theme:', e);
    }
  }

  for (const view of state.accountViews.values()) {
    if (view && !view.webContents.isDestroyed()) {
      try {
        view.setBackgroundColor(bgColor);
        view.webContents.send('theme:changed', {
          themeMode,
          shouldUseDarkColors: isDark,
        });
      } catch (e) {
        console.error('[Theme] Error updating view theme:', e);
      }
    }
  }
}

export function applyThemeMode(themeMode: 'system' | 'light' | 'dark') {
  nativeTheme.themeSource = themeMode;
  handleThemeUpdate();
}

export function initTheme() {
  const mode = state.globalSettings?.themeMode || 'system';
  nativeTheme.themeSource = mode;
  nativeTheme.on('updated', () => {
    handleThemeUpdate();
  });
}
