/**
 * WAllie Preload Entrypoint (Modularized)
 *
 * Coordinates isolated preload APIs across the WAllie client:
 * - api.ts: `ElectronAPI` & `sandboxAPI` exposed to the React UI
 * - whatsappIntegration.ts: Theme synchronization, download handling, `__wallie_ipc`
 * - titlebar.ts: Custom framed titlebar for popups/views
 * - callDetection.ts: In-call WebRTC detection & blank screen watchdog
 * - webstore.ts: Chrome Web Store inline installation button
 * - toast.ts: Native-styled guest toast notifications
 */

import { exposeRendererAPIs } from './api';
import { setupWhatsAppIntegration } from './whatsappIntegration';
import { injectCallTitlebar } from './callDetection';
import { injectUnifiedTitlebar } from './titlebar';
import { setupWebStoreInjection } from './webstore';

// Inlined at build time by scripts/build-preload.cjs from src/preload/inject/whatsappMainWorld.ts
const MAIN_WORLD_SCRIPT = '__MAIN_WORLD_SCRIPT__';

// Re-export public ElectronAPI typings for renderer TypeScript definitions
export * from './api';

const WHATSAPP_DOMAIN_REGEX = /^([^.\s]+\.)*whatsapp\.(com|net)$/i;
const isWhatsApp = WHATSAPP_DOMAIN_REGEX.test(window.location.hostname);

if (!isWhatsApp) {
  exposeRendererAPIs();

  window.addEventListener('DOMContentLoaded', () => {
    const isDevTools = Boolean(document.querySelector('meta[name="is-devtools"]'));
    if (isDevTools) {
      const accountNameMeta = document.querySelector('meta[name="account-name"]');
      const accountName = accountNameMeta ? decodeURIComponent(accountNameMeta.getAttribute('content') || '') : 'Account';
      injectUnifiedTitlebar({
        title: 'DevTools',
        badge: accountName,
        iconType: 'devtools',
        controls: ['min', 'max', 'close'],
      });
    }
  });

  if (window.location.hostname === 'chromewebstore.google.com') {
    setupWebStoreInjection();
  }
} else {
  setupWhatsAppIntegration(MAIN_WORLD_SCRIPT);
  if (window.location.pathname.includes('/call')) {
    injectCallTitlebar();
  }
}

export {};
