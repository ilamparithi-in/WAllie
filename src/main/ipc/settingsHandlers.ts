import { ipcMain, dialog } from 'electron';
import { state } from '../state';
import { saveSettings } from '../config';
import { focusActiveView, getActiveWindow } from '../utils';
import {
  animateSettingsTransition,
  updateActiveViewBounds,
  enforceWindowMinimumSize,
  initializeAccountsLoad,
  openSettingsWindow,
  closeSettingsWindow,
} from '../window';
import { applyRetentionPruning } from '../notificationHistory';
import { applyThemeMode, getThemeInfo } from '../theme';
import { GlobalSettings } from '../../shared/types';
import { validate, globalSettingsSchema } from './schemas';

export function registerSettingsHandlers(): void {
  ipcMain.on('settings:toggle', (_event, isOpen: unknown) => {
    const open = Boolean(isOpen);
    animateSettingsTransition(open);
    if (!open && (!state.settingsWindow || state.settingsWindow.isDestroyed())) {
      focusActiveView();
    }
  });

  ipcMain.on('settings:open-detached', (_event, page?: unknown, accountId?: unknown) => {
    openSettingsWindow(typeof page === 'string' ? page : undefined, typeof accountId === 'string' ? accountId : undefined);
  });

  ipcMain.on('settings:close-detached', () => {
    closeSettingsWindow();
  });

  ipcMain.handle('settings:is-detached-open', () => {
    return Boolean(state.settingsWindow && !state.settingsWindow.isDestroyed());
  });

  ipcMain.on('disclaimer:toggle', (_event, isOpen: unknown) => {
    const open = Boolean(isOpen);
    state.disclaimerOpen = open;
    updateActiveViewBounds();
    if (!open) focusActiveView();
  });

  ipcMain.on('protocol:toggle-prompt', (_event, isOpen: unknown) => {
    const open = Boolean(isOpen);
    state.protocolPromptOpen = open;
    updateActiveViewBounds();
    if (!open) focusActiveView();
  });

  ipcMain.on('settings:reset-app-scale', async () => {
    if (!state.globalSettings) return;
    state.globalSettings.appScale = 100;
    await saveSettings(state.globalSettings);
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.mainWindow.webContents.setZoomFactor(1.0);
      state.mainWindow.webContents.send('settings:global-changed', state.globalSettings);
    }
    if (state.settingsWindow && !state.settingsWindow.isDestroyed()) {
      state.settingsWindow.webContents.send('settings:global-changed', state.globalSettings);
    }
    for (const view of state.accountViews.values()) {
      if (view && !view.webContents.isDestroyed()) {
        view.webContents.setZoomFactor(1.0);
      }
    }
    updateActiveViewBounds();
  });

  ipcMain.handle('settings:get-global', () => state.globalSettings);

  ipcMain.handle('theme:get-current', () => getThemeInfo());

  ipcMain.handle('settings:save-global', async (_event, rawSettings: unknown) => {
    if (!state.globalSettings) return false;
    const newSettings = validate(globalSettingsSchema, rawSettings) as unknown as GlobalSettings;

    const oldScale = state.globalSettings.appScale || 100;
    const oldRetention = state.globalSettings.notificationRetentionDays;
    const oldThemeMode = state.globalSettings.themeMode || 'system';
    const disclaimerJustAccepted = newSettings.disclaimerAccepted && !state.globalSettings.disclaimerAccepted;
    const scaleChanged = newSettings.appScale !== undefined && newSettings.appScale !== oldScale;
    const retentionChanged = newSettings.notificationRetentionDays !== undefined && newSettings.notificationRetentionDays !== oldRetention;
    const themeChanged = newSettings.themeMode !== undefined && newSettings.themeMode !== oldThemeMode;

    state.globalSettings = newSettings;
    await saveSettings(state.globalSettings);

    if (themeChanged) {
      applyThemeMode(newSettings.themeMode || 'system');
    }

    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      enforceWindowMinimumSize(state.mainWindow);
    }

    if (retentionChanged) {
      applyRetentionPruning();
    }

    const newBaseScale = (newSettings.appScale || 100) / 100;
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      try {
        state.mainWindow.webContents.setZoomFactor(newBaseScale);
      } catch (e) { }
      state.mainWindow.webContents.send('settings:global-changed', state.globalSettings);
    }
    if (state.settingsWindow && !state.settingsWindow.isDestroyed()) {
      state.settingsWindow.webContents.send('settings:global-changed', state.globalSettings);
    }

    if (scaleChanged) {
      for (const view of state.accountViews.values()) {
        if (view && !view.webContents.isDestroyed()) {
          try {
            const currentFactor = view.webContents.getZoomFactor();
            const relativeZoom = currentFactor / (oldScale / 100);
            view.webContents.setZoomFactor(newBaseScale * relativeZoom);
          } catch (e) { }
        }
      }
      updateActiveViewBounds();

      // Show native system dialog prompt for scale confirmation
      if (newSettings.appScale !== 100) {
        const targetWindow = getActiveWindow();
        if (targetWindow && !targetWindow.isDestroyed()) {
          setTimeout(async () => {
            try {
              const result = await dialog.showMessageBox(targetWindow, {
                type: 'question',
                buttons: ['Keep Scale', 'Revert Scale'],
                defaultId: 0,
                cancelId: 1,
                title: 'Confirm App Scale',
                message: `App Scale changed to ${newSettings.appScale}%`,
                detail: 'Does WAllie UI display properly at this scale level?',
                noLink: true,
              });

              if (result.response !== 0) {
                console.log(`Reverting App Scale back to ${oldScale}%`);
                state.globalSettings!.appScale = oldScale;
                await saveSettings(state.globalSettings!);
                const revertedBaseScale = oldScale / 100;
                targetWindow.webContents.setZoomFactor(revertedBaseScale);
                targetWindow.webContents.send('settings:global-changed', state.globalSettings);
                for (const view of state.accountViews.values()) {
                  if (view && !view.webContents.isDestroyed()) {
                    view.webContents.setZoomFactor(revertedBaseScale);
                  }
                }
                updateActiveViewBounds();
              }
            } catch (err) {
              console.error('Error in scale confirmation dialog:', err);
            }
          }, 100);
        }
      }
    }

    if (disclaimerJustAccepted) {
      console.log('Legal disclaimer accepted. Initializing account views.');
      await initializeAccountsLoad();
    }

    const responsiveMode = newSettings.responsiveLayoutMode || 'auto';
    for (const view of state.accountViews.values()) {
      if (view && !view.webContents.isDestroyed()) {
        try {
          view.webContents.send('responsive-layout:mode-changed', responsiveMode);
        } catch (e) { }
      }
    }

    return true;
  });

  ipcMain.handle('responsive-layout:get-mode', () => {
    return state.globalSettings?.responsiveLayoutMode || 'auto';
  });
}

