import { app, BrowserWindow, screen } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { state } from './state';
import { getInitialWindowSize } from './utils';
import { DEFAULT_MIN_WINDOW_WIDTH, DEFAULT_MIN_WINDOW_HEIGHT } from '../shared/types';

export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized?: boolean;
}

export const WINDOW_STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');

let saveTimeout: NodeJS.Timeout | null = null;

/**
 * Validates whether the given rectangle intersects visibly with any connected display's workArea.
 * Prevents opening an invisible window if an external monitor was disconnected.
 */
function isVisibleOnAnyDisplay(x: number, y: number, width: number, height: number): boolean {
  try {
    const displays = screen.getAllDisplays();
    return displays.some((disp) => {
      const { x: dx, y: dy, width: dw, height: dh } = disp.workArea;
      const overlapX = Math.max(0, Math.min(x + width, dx + dw) - Math.max(x, dx));
      const overlapY = Math.max(0, Math.min(y + height, dy + dh) - Math.max(y, dy));
      return overlapX >= 100 && overlapY >= 100;
    });
  } catch {
    return true;
  }
}

/**
 * Loads saved window state or computes default initial window state.
 */
export function loadWindowState(): WindowState {
  const unblocked = !!state.globalSettings?.unblockMinWindowSize;
  const minW = unblocked ? 0 : DEFAULT_MIN_WINDOW_WIDTH;
  const minH = unblocked ? 0 : DEFAULT_MIN_WINDOW_HEIGHT;
  const defaultSize = getInitialWindowSize(1100, 750);

  try {
    if (fs.existsSync(WINDOW_STATE_FILE)) {
      const raw = fs.readFileSync(WINDOW_STATE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);

      if (typeof parsed.width === 'number' && typeof parsed.height === 'number') {
        let width = parsed.width;
        let height = parsed.height;

        // Apply softlock recovery if window size is less than minimum
        if (width < minW) width = minW;
        if (height < minH) height = minH;

        let x = typeof parsed.x === 'number' ? parsed.x : undefined;
        let y = typeof parsed.y === 'number' ? parsed.y : undefined;

        // If coordinates were saved, make sure they aren't lost off-screen (e.g. disconnected monitor)
        if (x !== undefined && y !== undefined) {
          if (!isVisibleOnAnyDisplay(x, y, width, height)) {
            console.log('[WindowState] Saved coordinates are not visible on any connected monitor. Re-centering.');
            x = undefined;
            y = undefined;
          }
        }

        return {
          width,
          height,
          x,
          y,
          isMaximized: !!parsed.isMaximized,
        };
      }
    }
  } catch (err) {
    console.error('[WindowState] Failed to load window state:', err);
  }

  return {
    width: defaultSize.width,
    height: defaultSize.height,
    isMaximized: false,
  };
}

/**
 * Immediately extracts current window bounds and saves to disk.
 */
export function saveWindowStateImmediate(win?: BrowserWindow | null): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }

  const targetWin = win || state.mainWindow;
  if (!targetWin || targetWin.isDestroyed()) return;

  try {
    const isMaximized = targetWin.isMaximized();
    let bounds: { x: number; y: number; width: number; height: number };

    if (isMaximized || targetWin.isMinimized()) {
      bounds = targetWin.getNormalBounds();
    } else {
      bounds = targetWin.getBounds();
    }

    const stateToSave: WindowState = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized,
    };

    fs.writeFileSync(WINDOW_STATE_FILE, JSON.stringify(stateToSave, null, 2), 'utf-8');
  } catch (err) {
    console.error('[WindowState] Failed to save window state:', err);
  }
}

/**
 * Debounces window state saving to avoid excessive disk I/O during continuous resizing/moving.
 */
export function debouncedSaveWindowState(win?: BrowserWindow | null, delayMs = 500): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    saveWindowStateImmediate(win);
    saveTimeout = null;
  }, delayMs);
}

/**
 * Resets saved window state file.
 */
export function resetSavedWindowState(): void {
  try {
    if (fs.existsSync(WINDOW_STATE_FILE)) {
      fs.unlinkSync(WINDOW_STATE_FILE);
    }
  } catch (err) {
    console.error('[WindowState] Failed to reset window state file:', err);
  }
}

