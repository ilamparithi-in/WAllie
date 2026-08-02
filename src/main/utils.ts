import { nativeImage, NativeImage, WebContents } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { state } from './state';
import { Account, DEFAULT_ACCOUNT_SETTINGS } from '../shared/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { WHATSAPP_DOMAIN_REGEX } from '../shared/constants';
export { WHATSAPP_DOMAIN_REGEX };

export function getPreloadPath(): string {
  return path.join(__dirname, '../preload/index.cjs');
}

export function getAccountById(id: string): Account | undefined {
  return state.accounts.find((a) => a.id === id);
}

export function focusActiveView(): void {
  const activeView = state.accountViews.get(state.activeAccountId);
  if (activeView && !activeView.webContents.isDestroyed()) {
    activeView.webContents.focus();
  }
}

export function isWhatsAppUrl(urlStr: string): boolean {
  try {
    const hostname = new URL(urlStr).hostname;
    return WHATSAPP_DOMAIN_REGEX.test(hostname);
  } catch {
    return false;
  }
}

export function getAppIcon(size?: { width: number; height: number }): NativeImage {
  const iconPath = path.join(__dirname, '../renderer/icon.png');
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#00a884"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;
    icon = nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'));
  }
  if (size) {
    icon = icon.resize(size);
  }
  return icon;
}

export function checkPermissionForAccount(
  account: Account,
  permission: string,
  mediaType?: string,
  mediaTypes: string[] = []
): boolean {
  const settings = account.settings || DEFAULT_ACCOUNT_SETTINGS;
  if (permission === 'notifications') {
    return settings.notificationsEnabled;
  }
  if (permission === 'media') {
    if (mediaTypes && mediaTypes.length > 0) {
      let granted = true;
      if (mediaTypes.includes('video') && !settings.cameraEnabled) {
        granted = false;
      }
      if (mediaTypes.includes('audio') && !settings.micEnabled) {
        granted = false;
      }
      return granted;
    }
    if (mediaType === 'video') return settings.cameraEnabled;
    if (mediaType === 'audio') return settings.micEnabled;
    return settings.cameraEnabled || settings.micEnabled;
  }
  if (permission === 'geolocation') {
    return !!settings.geolocationEnabled;
  }
  if (permission === 'clipboard-read') {
    return !!settings.clipboardReadEnabled;
  }
  if (permission === 'background-sync' || permission === 'fullscreen') {
    return true;
  }
  return false;
}

export function getAccountForWebContents(webContents: WebContents): Account | undefined {
  for (const [accId, view] of state.accountViews.entries()) {
    if (view.webContents === webContents) {
      return getAccountById(accId);
    }
  }
  return undefined;
}
