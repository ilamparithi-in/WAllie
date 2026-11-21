/**
 * WAllie Main World Injection Script
 *
 * Execution Context & Architectural Boundaries:
 * - Runtime Realm: Executes inside Chromium World ID 0 (the main execution realm
 *   of the WhatsApp Web document), sharing the global window and DOM scope.
 * - Purpose: Directly hooks into WhatsApp Web's webpack modules (`window.require`),
 *   in-memory message/chat collections (`WAWebChatCollection`, `WAWebMsgCollection`),
 *   native Notification constructor intercepts, and drag-and-drop stabilizers that
 *   cannot be accessed across the isolated context boundary.
 * - Security Boundaries:
 *   - The main world does not possess Node.js integration or Electron IPC access.
 *   - Communication between the main world and the isolated preload context occurs
 *     via strict `window.postMessage` protocols and bridged event handlers.
 *   - Sensitive operations (file writes, directory prompts, external links) are delegated
 *     to the main process via validated IPC channels.
 */

import './types';
import { activeNotificationCallbacks, initCustomNotification, initAnchorDownloadHandler } from './customNotification';
import { initChatNavigation } from './chatNavigation';
import { initDragDropStabilizer } from './dragDrop';

(() => {
  if ((window as any).__wallie_main_world_initialized) {
    return;
  }
  (window as any).__wallie_main_world_initialized = true;

  initCustomNotification();
  initAnchorDownloadHandler();
  initChatNavigation(activeNotificationCallbacks);
  initDragDropStabilizer();
})();
