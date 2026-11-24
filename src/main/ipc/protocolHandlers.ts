import { ipcMain } from 'electron';
import { state } from '../state';
import { DEFAULT_USER_AGENT } from '../config';
import { updateActiveViewBounds, switchActiveAccount } from '../window';
import { clearPausedMediaState } from '../views';
import { GroupInviteDetails } from '../../shared/types';
import { extractMetaContent } from '../../shared/htmlMetadata.ts';
import {
  validate,
  accountIdSchema,
  urlStringSchema,
  callStatusSchema,
} from './schemas';
import { z } from 'zod';

const groupInviteCache = new Map<string, GroupInviteDetails>();

async function fetchGroupInviteDetails(code: string): Promise<GroupInviteDetails | null> {
  const cleanCode = code.trim();
  if (!cleanCode) return null;
  if (groupInviteCache.has(cleanCode)) {
    return groupInviteCache.get(cleanCode)!;
  }

  try {
    const inviteUrl = `https://chat.whatsapp.com/${encodeURIComponent(cleanCode)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(inviteUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return null;
    }

    const html = await res.text();

    const rawTitle = extractMetaContent(html, 'og:title') || '';
    const rawImage = extractMetaContent(html, 'og:image') || '';
    const rawDesc = extractMetaContent(html, 'og:description') || '';

    let name: string | undefined;
    if (rawTitle && rawTitle.toLowerCase() !== 'whatsapp group invite') {
      name = rawTitle;
    }

    let iconUrl: string | undefined;
    if (rawImage) {
      iconUrl = rawImage;
      try {
        const imgController = new AbortController();
        const imgTimeout = setTimeout(() => imgController.abort(), 3000);
        const imgRes = await fetch(rawImage, {
          signal: imgController.signal,
          headers: { 'User-Agent': DEFAULT_USER_AGENT },
        });
        clearTimeout(imgTimeout);
        if (imgRes.ok) {
          const buf = await imgRes.arrayBuffer();
          const mime = imgRes.headers.get('content-type') || 'image/jpeg';
          iconUrl = `data:${mime};base64,${Buffer.from(buf).toString('base64')}`;
        }
      } catch {
        // Fall back to original rawImage if pre-fetch fails
      }
    }

    let description: string | undefined;
    if (rawDesc && rawDesc.toLowerCase() !== 'whatsapp group invite') {
      description = rawDesc;
    }

    const result: GroupInviteDetails = {
      code: cleanCode,
      name,
      iconUrl,
      description,
    };

    if (name) {
      groupInviteCache.set(cleanCode, result);
    }

    return result;
  } catch (err) {
    console.error('Failed to fetch group invite details:', err);
    return null;
  }
}

const inviteCodeSchema = z.string().trim().min(1).max(200);

export function registerProtocolHandlers(): void {
  ipcMain.handle('protocol:get-group-invite-info', async (_event, rawCode: unknown) => {
    const code = validate(inviteCodeSchema, rawCode);
    return await fetchGroupInviteDetails(code);
  });

  ipcMain.on('protocol:ready', () => {
    if (state.pendingProtocolUrl) {
      console.log(`Sending pending protocol URL to ready renderer: ${state.pendingProtocolUrl}`);
      state.mainWindow?.webContents.send('protocol:received-url', state.pendingProtocolUrl);
      state.pendingProtocolUrl = null;
    }
  });

  ipcMain.on('protocol:reopen-prompt', (_event, rawUrl: unknown) => {
    const url = validate(urlStringSchema, rawUrl);
    if (url && state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.protocolPromptOpen = true;
      updateActiveViewBounds();
      state.mainWindow.webContents.send('protocol:reopen-prompt', url);
    }
  });

  ipcMain.handle('protocol:handle-url', async (_event, rawAccountId: unknown, rawUrlStr: unknown) => {
    const accountId = validate(accountIdSchema, rawAccountId);
    const urlStr = validate(urlStringSchema, rawUrlStr);
    console.log(`Handling custom protocol URL for account ${accountId}: ${urlStr}`);
    try {
      const url = new URL(urlStr);
      let waPath = '/';

      if (url.hostname === 'send' || url.pathname.startsWith('/send')) {
        waPath = '/send' + url.search;
      } else if (
        (url.hostname === 'chat' || url.hostname === 'accept' || url.pathname.startsWith('/chat') || url.pathname.startsWith('/accept')) &&
        url.searchParams.has('code')
      ) {
        waPath = `/accept?code=${encodeURIComponent(url.searchParams.get('code')!)}`;
      } else if (url.hostname === 'chat.whatsapp.com') {
        const code = url.pathname.replace(/^\/(invite\/)?/, '').split('/')[0];
        if (code) {
          waPath = `/accept?code=${encodeURIComponent(code)}`;
        }
      } else if (url.hostname === 'wa.me') {
        const phone = url.pathname.replace(/^\//, '');
        const search = url.search ? (url.search.startsWith('?') ? url.search : `?${url.search}`) : '';
        waPath = `/send${search ? `${search}&phone=${phone}` : `?phone=${phone}`}`;
      } else if (url.search) {
        waPath = `/${url.pathname.replace(/^\//, '')}${url.search}`;
      } else if (url.pathname && url.pathname !== '/') {
        waPath = url.pathname;
      }

      const targetUrl = `https://web.whatsapp.com${waPath}`;
      console.log(`Resolved target URL for WhatsApp Web: ${targetUrl}`);

      const targetView = state.accountViews.get(accountId);
      if (!targetView) {
        return { success: false, error: 'Target account view not found' };
      }

      (targetView.webContents as any)._lastUnloadCancelled = false;
      try {
        await targetView.webContents.loadURL(targetUrl);
      } catch (err: any) {
        if (
          (targetView.webContents as any)._lastUnloadCancelled ||
          err?.message?.includes('ERR_ABORTED') ||
          err?.code === 'ERR_ABORTED'
        ) {
          console.log(`Navigation cancelled by user for account ${accountId}`);
          return { success: false, cancelled: true };
        }
        console.error('Failed to load target URL:', err);
        return { success: false, error: err?.message || String(err) };
      }

      await switchActiveAccount(accountId);
      return { success: true };
    } catch (error: any) {
      console.error('Failed to handle custom protocol redirection:', error);
      return { success: false, error: error?.message || String(error) };
    }
  });

  ipcMain.on('call:status-changed', (_event, rawData: unknown) => {
    const data = validate(callStatusSchema, rawData);
    if (data.status === 'answered') {
      if (state.callWindows.size > 0 && !state.callWasAnswered) {
        console.log(`[wallie] Call status changed: ${data.status}`);
        state.callWasAnswered = true;
        clearPausedMediaState();
      }
    } else if (data.status === 'declined') {
      if (state.callWindows.size > 0 && state.callWasAnswered) {
        console.log(`[wallie] Call status changed: ${data.status}`);
        state.callWasAnswered = false;
      }
    }
  });

  ipcMain.on('call:status-sync', (event, rawData: unknown) => {
    const data = validate(callStatusSchema, rawData);
    if (data.status === 'answered') {
      if (state.callWindows.size > 0 && !state.callWasAnswered) {
        console.log(`[wallie] Call status sync: ${data.status}`);
        state.callWasAnswered = true;
        clearPausedMediaState();
      }
    } else if (data.status === 'declined') {
      if (state.callWindows.size > 0 && state.callWasAnswered) {
        console.log(`[wallie] Call status sync: ${data.status}`);
        state.callWasAnswered = false;
      }
    }
    event.returnValue = true;
  });
}

