# ADR-007: Selective Storage Clearing and Native-Styled WhatsApp Calling Popouts

## Context
When implementing Phase 3 and Phase 5 features, we encountered two significant issues related to user storage clearing and call popout window styling:
1. **User Logouts on Clearing Storage**: Clearing the media cache and databases logged the user out of WhatsApp Web because the original implementation wiped the entire `indexdb` partition folder, deleting active session cookies and cryptographic Signal protocol keys (`wawc` and `signal-storage` databases).
2. **Standard Non-Native Popups and "Allow Pop-ups" Warnings**: 
   - When WhatsApp Web opened call popouts (`window.open`), returning `{ action: 'deny' }` blocked the popup and prompted the browser page to display an "Allow pop-ups for this site" warning banner.
   - Allowing the popup resulted in a standard Chromium window containing a menubar/toolbar and system titlebar, which did not align with the clean frameless layout of our desktop client.
   - Intercepting the popup by immediately destroying it and spawning a fresh `BrowserWindow` loading `/calling` broke the WebRTC call connection/session handshake, forcing the call UI back into the main tab view.

## Decision
We decided to resolve these issues by implementing:
1. **Selective IndexedDB Storage Clearing**: Instead of wiping the entire database partition path, we run an asynchronous Javascript script inside the `WebContentsView` of the active account view. The script retrieves all database metadata via `window.indexedDB.databases()` and deletes every database *except* `'wawc'` and `'signal-storage'`. This clears local messages, media, and chat histories while preserving the logged-in credentials.
2. **Transparent Pop-up Allowance & Synchronous Interception**:
   - `setWindowOpenHandler` is updated to return `{ action: 'allow', overrideBrowserWindowOptions: { ... } }` for all internal WhatsApp Web URLs. This ensures `window.open` succeeds synchronously on the web page side, preventing the "Allow pop-ups" warning.
   - We configure the `overrideBrowserWindowOptions` with:
     - `frame: false` (to hide standard OS borders)
     - `titleBarStyle: 'hidden'` (to enable custom titlebars)
     - `autoHideMenuBar: true` (to completely remove the toolbar/menu controls)
     - `backgroundThrottling: false` (to prevent audio/video lagging during WebRTC calls when the window is blurred/minimized)
3. **Preload Titlebar DOM Injection & CSS Stacking**:
   - We updated the preload script to detect calling paths (`/call/popout` and `/calling`).
   - Rather than creating a separate React instance, the preload script injects a persistent `<style>` block to `document.documentElement` that applies a `transform: translateY(28px) !important` and `height: calc(100% - 28px) !important` to `document.body > :not(#custom-titlebar)`. This shifts the entire absolute-positioned rendering container of WhatsApp Web down by 28px.
   - The custom titlebar (displaying the account badge name, a pin-to-top toggle, minimize, and close controls) is appended directly to `document.body`, placing it at the absolute top of the stacking context where it remains fully clickable, draggable, and visible.

## Consequences
- **Silent Clear**: Media clearing reloads the page and syncs without ever logging out the user.
- **Perfect Calling Stability**: Clicking "Call" in the client launches a native-looking call popup immediately with no WebRTC disconnection or popup warnings.
- **Native Custom Controls**: Call popouts support full window dragging, minimization, and toggleable Always-on-Top pinning options.
