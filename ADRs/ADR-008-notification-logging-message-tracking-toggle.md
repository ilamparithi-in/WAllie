# ADR 007: Main-World Notification Interception, Message Event Auditing, Disabled-by-Default Settings, and Custom DevTools Titlebars

## Status
Accepted

## Context
When running Electron with `contextIsolation: true` and `sandbox: true`, the preload script executes in an isolated javascript context. In this environment:
1. **Isolated Window Context**: Overriding `window.Notification` inside the preload script only affects the isolated context's window. Standard pages (such as WhatsApp Web) running in the Main World continue using native browser notifications. This bypassed our custom constructor, resulting in unbranded notifications and an empty local notification history log.
2. **Auditing Chat Events**: WhatsApp Web does not provide built-in events when messages are edited or deleted by contacts. Users requested a way to audit these modifications.
3. **Privacy Controls**: Automatically storing chat notifications and events on disk poses potential privacy concerns. A settings toggle was needed to keep notification logging disabled by default.
4. **DevTools Window Branding & Controls**: Standard detached Chromium DevTools windows lacked consistent custom titlebars, window controls (min/max/close), and did not clearly display which account profile was being debugged.

---

## Decisions
We implemented the following solutions:

1. **Main-World API Interception**:
   - Exposed a secure `__walinux_ipc` proxy object via `contextBridge.exposeInMainWorld` in `src/preload/index.ts`.
   - Injected the custom `Notification` constructor override directly into `worldId: 0` (the Main World) using `webFrame.executeJavaScriptInIsolatedWorld`. This allows the WhatsApp Web page to interact with our custom constructor, forwarding notifications to the main process via the secure `__walinux_ipc` proxy.

2. **DOM-Based Event Auditing (Edits & Deletions)**:
   - Injected a `MutationObserver` script into the Main World of WhatsApp Web.
   - The observer scans for rendered elements with the `[data-id]` attribute and maps them to a memory cache storing their message text and sender name.
   - When a change is detected, it compares the new text to the old:
     - If the text has changed to a deletion phrase (e.g. "This message was deleted" across common locales), it sends a Deletion event to the history logs.
     - Otherwise, it logs an Edit event detailing the original and updated message text.

3. **Disabled-by-Default Logging & Settings Integration**:
   - Added a new configuration setting `notificationLoggingEnabled` (defaulting to `false`) in the `GlobalSettings` interface.
   - Updated `notification:create` and added `notification:create-log-entry` in the main process to check `globalSettings.notificationLoggingEnabled` before executing any file-backed history logging.
   - Updated the settings UI with a toggle checkbox in the General tab and a conditional warning banner in the Notification History tab.

4. **Unified Titlebar & DevTools Custom Windows**:
   - Refactored calling titlebar logic into a generic `injectUnifiedTitlebar` function in preload. It supports call indicators or code icons, badges, and configurable controls (`pin`, `min`, `max`, `close`).
   - Integrated custom detached BrowserWindow instances for account DevTools in the main process, loading meta headers to trigger the unified titlebar injection and displaying the active profile badge.

---

## Consequences
- **Functional Interception**: Notifications are successfully intercepted, custom branded with the account name, and support callbacks without compromising `contextIsolation` security.
- **Privacy-First Logging**: The local notification database remains inactive until the user explicitly consents by checking the settings toggle.
- **Local History Auditing**: Message deletions and edits inside open chats are recorded transparently in the notification drawer.
- **Consistent Styling**: DevTools windows now share the application's frameless Dark titlebar, allowing users to minimize, maximize, and easily identify which account is being inspected.
