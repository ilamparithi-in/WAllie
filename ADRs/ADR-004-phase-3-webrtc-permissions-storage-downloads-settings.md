# ADR 004: Phase 3 - WebRTC Calls, Permissions, Storage Optimization, Downloads Interception, and Settings Persistence

## Status
Accepted

## Context
During the design and implementation of Phase 3, several key architectural constraints and bugs were identified and addressed:
1. **Notifications & Call Permissions Blocked**: Standard permission checking blocked internal Chromium service worker permissions (such as `background-sync`), causing WhatsApp Web to display the warning `"Notifications are turned off"` and breaking push notifications.
2. **ESM Runtime Crash**: Attempting to trigger a system desktop notification via an inline CommonJS `require('electron')` inside the asynchronous `will-download` callback threw a `ReferenceError` because the main process is bundled as an ES module.
3. **CPU-Spamming Infinite Render Loop**: The `Titlebar` component's `useEffect` list subscribed to updates of the `accounts` state while declaring `[accounts]` as a dependency. This caused a continuous loop of state updates and IPC calls querying window maximizations.
4. **Settings Select Lag**: The `SettingsModal` re-subscribed to IPC listeners every time `selectedAccountId` was changed (as it was in the dependency array), resulting in unresponsive dropdown select components.
5. **New Feature Goals**: The client needed configurable options to preload all account views on startup (enabling instant notifications without manual clicking), control permissions on a per-account basis, and clear temporary assets/media storage without forcing users to re-login.

## Decisions
We made the following architectural decisions to resolve these issues and implement the deliverables:

1. **Permissive Origin Check with Account Settings Filtering**: Updated `setPermissionRequestHandler` and `setPermissionCheckHandler` to automatically allow all queries (like `background-sync`) originating from trusted `*.whatsapp.com` and `*.whatsapp.net` domains, while validating camera, microphone, and notification requests against individual account setting toggles.
2. **Native Screen Sharing Picker Menu**: Implemented `setDisplayMediaRequestHandler` in the main process. Available PipeWire/X11 video capture sources are fetched using `desktopCapturer.getSources` and displayed using a native context-style `Menu` popped up at the cursor position. The callback is called with an empty object `{}` on menu dismiss/cancellation to prevent renderer process hangs.
3. **Filesystem-Based Storage Calculations**: Created asynchronous parallel directory size calculations (`calculatePathSize`) that scan partition directories under `Partitions/<accountId>` to calculate HTTP Cache, IndexedDB databases, LocalStorage databases, and Cookie files. Wiping cache or media files is executed using native session methods without removing authorization tokens, and the view is automatically reloaded after cleanup to refresh database connections.
4. **URL Link Delegation**: Intercepted `will-navigate` and `setWindowOpenHandler` in the main process, redirecting non-WhatsApp domains to the default system browser via `shell.openExternal`.
5. **Downloads Interception & Unique Naming**: Intercepted downloads via `will-download`, saving items directly to `app.getPath('downloads')`. Handled duplicate files by checking local existence and appending counters (e.g. `file (1).png`). Progress metrics are streamed to a bottom-right React floating overlay panel, and completed downloads trigger a system notification using a statically imported `Notification` class to avoid ESM runtime failures.
6. **React Component Hook Optimizations**: Used React `useRef` to store the active `accounts` list (in `Titlebar.tsx`) and target `selectedAccountId` (in `SettingsModal.tsx`), removing them from their respective `useEffect` dependency arrays to completely eliminate infinite loop rerenders and input lags.
7. **Configurable Settings Persistence**: Created a `settings.json` file in the user data directory to store application preferences (Close to Tray, Hardware Acceleration, and Launch Preloading). If `loadAllOnLaunch` is enabled, all inactive account views are spawned in parallel on startup.

## Consequences
- **High Performance**: Rerender loops are resolved, reducing CPU usage to 0% when idle.
- **Robust Permissions & Calls**: WebRTC voice/video calls, screen sharing, and notifications function natively without triggering web page errors.
- **Granular Controls**: Users can configure global launching rules and toggle camera, microphone, and notification permissions individually per WhatsApp account.
- **Clean Storage Wiping**: Users can inspect storage metrics per-account and optimize cache/media storage space on-demand without losing logged-in sessions.
