import { ipcMain, dialog, nativeImage, BrowserWindow } from 'electron';
import fs from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { state } from '../state';
import { resolveGoogleFont } from '../../shared/fonts';
import { NativePromptOptions, NativePromptResult, NativeConfirmOptions } from '../../shared/types';
import { validate } from './schemas';
import { z } from 'zod';

const execAsync = promisify(exec);

const fontResolutionSchema = z.object({
  family: z.string().trim().min(1).max(200),
  cachedUrl: z.string().trim().max(1000).optional(),
});

export function registerSystemHandlers(): void {
  ipcMain.handle('wallpaper:select-file', async () => {
    if (!state.mainWindow || state.mainWindow.isDestroyed()) return null;
    const result = await dialog.showOpenDialog(state.mainWindow, {
      title: 'Choose Chat Wallpaper Image',
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }],
      properties: ['openFile'],
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    try {
      const image = nativeImage.createFromPath(filePath);
      if (image.isEmpty()) return null;

      const size = image.getSize();
      const maxEdge = 1920;
      let finalImage = image;

      if (size.width > maxEdge || size.height > maxEdge) {
        const scale = Math.min(maxEdge / size.width, maxEdge / size.height);
        finalImage = image.resize({
          width: Math.round(size.width * scale),
          height: Math.round(size.height * scale),
          quality: 'better',
        });
      }

      const jpegBuffer = finalImage.toJPEG(82);
      return `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;
    } catch (err) {
      console.error('Failed to process wallpaper image:', err);
      return null;
    }
  });

  ipcMain.handle('customcss:select-file', async () => {
    if (!state.mainWindow || state.mainWindow.isDestroyed()) return null;
    const result = await dialog.showOpenDialog(state.mainWindow, {
      title: 'Choose Custom CSS Stylesheet',
      filters: [
        { name: 'CSS Stylesheets', extensions: ['css'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return null;
    }

    try {
      const content = await fs.promises.readFile(result.filePaths[0], 'utf-8');
      return content.substring(0, 500000); // 500KB max
    } catch (err) {
      console.error('Failed to read custom CSS file:', err);
      return null;
    }
  });

  ipcMain.handle('system:get-fonts', async () => {
    try {
      const { stdout } = await execAsync('fc-list : family');
      const families = new Set<string>();
      stdout.split('\n').forEach((line) => {
        line.split(',').forEach((f) => {
          const trimmed = f.trim();
          if (trimmed && !trimmed.startsWith('.')) {
            families.add(trimmed);
          }
        });
      });
      return Array.from(families).sort((a, b) => a.localeCompare(b));
    } catch {
      return [
        'Inter',
        'Roboto',
        'Open Sans',
        'Lato',
        'Montserrat',
        'Poppins',
        'Ubuntu',
        'Cantarell',
        'DejaVu Sans',
        'Fira Sans',
        'Segoe UI',
        'Helvetica Neue',
        'Arial',
        'sans-serif',
      ];
    }
  });

  ipcMain.handle('system:get-fonts-meta', async () => {
    try {
      const { stdout } = await execAsync('fc-list : family variable');
      const fontMap = new Map<string, boolean>();
      stdout.split('\n').forEach((line) => {
        if (!line.trim()) return;
        const [familiesPart, varPart] = line.split(':variable=');
        const isVar = varPart ? varPart.trim().toLowerCase() === 'true' : false;
        familiesPart.split(',').forEach((f) => {
          const trimmed = f.trim();
          if (trimmed && !trimmed.startsWith('.')) {
            const current = fontMap.get(trimmed) || false;
            fontMap.set(trimmed, current || isVar);
          }
        });
      });

      let desktopFontName = '';
      try {
        const { stdout: gOut } = await execAsync('gsettings get org.gnome.desktop.interface font-name');
        const cleaned = gOut.trim().replace(/^['"]+|['"]+$/g, '');
        const parts = cleaned.split(/\s+/);
        if (parts.length > 1 && !isNaN(Number(parts[parts.length - 1]))) {
          desktopFontName = parts.slice(0, -1).join(' ');
        } else {
          desktopFontName = cleaned;
        }
      } catch {
        // Fallback
      }

      let desktopFontIsVariable = false;
      if (desktopFontName) {
        desktopFontIsVariable = fontMap.get(desktopFontName) || false;
      }

      const fonts = Array.from(fontMap.entries())
        .map(([name, isVariable]) => ({ name, isVariable }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return {
        fonts,
        desktopFont: {
          name: desktopFontName,
          isVariable: desktopFontIsVariable,
        },
      };
    } catch {
      return {
        fonts: [],
        desktopFont: { name: '', isVariable: false },
      };
    }
  });

  ipcMain.handle('system:resolve-google-font', async (_event, rawFamily: unknown, rawCachedUrl?: unknown) => {
    const { family, cachedUrl } = validate(fontResolutionSchema, {
      family: rawFamily,
      cachedUrl: rawCachedUrl,
    });
    return await resolveGoogleFont(family, cachedUrl);
  });

  ipcMain.handle('dialog:show-prompt', async (event, options: NativePromptOptions): Promise<NativePromptResult> => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender) || state.mainWindow || undefined;
    const buttons = options?.buttons && options.buttons.length > 0 ? options.buttons : ['OK'];
    const result = await dialog.showMessageBox(parentWindow!, {
      type: options?.type || 'info',
      title: options?.title || 'Prompt',
      message: options?.message || '',
      detail: options?.detail,
      buttons,
      defaultId: options?.defaultId ?? 0,
      cancelId: options?.cancelId ?? (buttons.length > 1 ? buttons.length - 1 : 0),
      checkboxLabel: options?.checkboxLabel,
      checkboxChecked: options?.checkboxChecked,
      noLink: true,
    });
    return {
      response: result.response,
      checkboxChecked: result.checkboxChecked,
    };
  });

  ipcMain.handle('dialog:show-confirm', async (event, options: NativeConfirmOptions): Promise<boolean> => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender) || state.mainWindow || undefined;
    const confirmLabel = options?.confirmLabel || 'OK';
    const cancelLabel = options?.cancelLabel || 'Cancel';
    const buttons = [confirmLabel, cancelLabel];

    const result = await dialog.showMessageBox(parentWindow!, {
      type: options?.type || 'question',
      title: options?.title || 'Confirm',
      message: options?.message || '',
      detail: options?.detail,
      buttons,
      defaultId: options?.defaultConfirm !== false ? 0 : 1,
      cancelId: 1,
      noLink: true,
    });
    return result.response === 0;
  });
}

