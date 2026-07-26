# ADR 005: Phase 4 - Sliding Settings Drawer, Android-Style Paged View, Live CSS Themes, Native Notifications, History Log, and DevTools Toggle

## Status
Accepted

## Context
During the design and implementation of Phase 4, several key UX and performance challenges were addressed:
1. **Cramped Two-Column Settings**: Splitting a narrow `450px` sidebar drawer into tab options on the left and settings content on the right resulted in squished sliders, text fields, and inputs that were difficult to use.
2. **Additive Style Rule Bloat**: Electron's `webContents.insertCSS()` is additive by default. Swapping preset CSS themes (OLED Dark, Compact UI) or typing custom styles kept accumulating old rules, preventing the UI from reverting cleanly to the default WhatsApp theme.
3. **Async Reload Race Conditions**: Showing a confirmation dialog asynchronously inside the synchronous `will-prevent-unload` event handler caused page refresh locks, frozen buttons, and GLib-GObject event disposal errors.
4. **Blob URLs in Native OS Alerts**: WhatsApp Web generates user profile photos using local `blob:` URLs in the page context. These blob URLs cannot be read by the Electron main process, preventing native OS notification managers from rendering avatars.
5. **Branding & Focus Redirection**: Multiple active WhatsApp accounts required distinct identification on incoming desktop alerts, along with click redirects to automatically activate the matching tab.

## Decisions
We made the following architectural decisions to resolve these issues and implement the deliverables:

1. **Android-Style Paged Settings Drawer**:
   - Resized the active webview width by `450px` when settings are open instead of unmounting the contents, preserving the running DOM state.
   - Refactored the cramped two-column layout into a single-column drill-down settings menu inspired by the Android Settings app. Sub-pages (General, Extensions, Custom CSS, Storage, Notification History) occupy the full width of the drawer and include an `←` back arrow navigation button in the header.
2. **Injected CSS Key Tracking Map**:
   - Created a key tracking map `insertedCssKeys = new Map<string, string>()` in the main process to store the style references returned by `insertCSS`.
   - When updating styles or selecting a new theme, the main process calls `webContents.removeInsertedCSS(previousKey)` before inserting new styles, ensuring a clean dynamic theme reset without reloading the page. Stale keys are cleared on page `dom-ready`.
3. **Synchronous Reload Bypass**:
   - Replaced the asynchronous dialogue prompts in `will-prevent-unload` with a synchronous `event.preventDefault()` bypass. This ensures all reload operations (including cache clearing and manual refresh buttons) execute instantly.
4. **Preload Notification Overrides & Base64 Avatar Resolver**:
   - Overrode the global browser `window.Notification` constructor in the preload script.
   - Implemented an asynchronous avatar resolver in the preload context that fetches blob and remote URLs and converts them to Base64 strings before sending them to the main process via IPC.
5. **Branded DBus Notifications with Smart Actions**:
   - Standardized native system notification titles to include account branding (e.g., `[Work] Sender Name`).
   - Wired native notification clicks to restore the main window, switch to the sender's account tab, and pass a clicked-reply bridge to click the chat element.
6. **Local Notification Log History Database**:
   - Structured a local `notification_history.json` logger with a size ceiling of 100 entries. Exposed keyword searching and account-based filtering within the Settings Drawer history page.
7. **Docked/Detached Developer Tools Toggle**:
   - Added a general setting "Show Developer Tools Toggle". When enabled, a `</>` icon is rendered in the titlebar next to the settings button, allowing instant access to devtools for the active web contents pane.

## Consequences
- **Optimized Drawer Readability**: The single-column settings page is highly readable and mobile-friendly, fitting all settings comfortably in a `450px` drawer.
- **Zero-Reload Theme Swapping**: Toggling between Compact UI, OLED Dark, and Default Theme is applied instantly in real-time without refreshing the page.
- **Robust and Fast Reloads**: Refresh operations run cleanly with no GLib handler warnings or freezing screens.
- **Rich Native Alerts**: Incoming messages native to Linux include custom sender photos and distinct account identifiers.
