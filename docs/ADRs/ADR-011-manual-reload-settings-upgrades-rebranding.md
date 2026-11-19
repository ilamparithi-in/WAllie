# ADR 011: Manual Settings Reload UI Card and Rebranding to WAllie

## Status
Accepted

## Context
During settings adjustment (like toggling browser permissions) or clearing storage cache/databases inside the settings drawer, the Electron main process would automatically reload the corresponding profile's `WebContentsView` to apply changes immediately. 
This created two main usability issues:
1. **Disruptive Auto-Reloads**: Toggling multiple checkboxes sequentially caused repeated view reloads, resulting in performance overhead, reload delays, and temporary UI flashing.
2. **Lack of User Agency**: Users had no choice on when the reload took place, forcing page refreshes even if they were in the middle of other settings configurations.

Additionally, the project required a comprehensive rebranding to replace all references to "WALi" with "WAllie" along with updated description, author metadata, and links.

---

## Decisions
We implemented the following solutions:

1. **Decoupled Reload Mechanism**:
   - Removed the automatic `webContents.reload()` triggers from the main process IPC handlers `account:update-settings` and `account:clear-storage` in `src/main/index.ts`.
   - Introduced a new IPC message listener `account:reload` to allow the renderer to reload a target profile's view on demand.

2. **Manual Reload Required Banner (Settings Card)**:
   - Added a React state array `accountsNeedingReload` in the `SettingsModal` component to track profiles that have pending configuration changes.
   - Designed a sleek, animated notification card at the bottom of the settings modal displaying "Reload required" whenever the currently selected profile is flagged for reload.
   - Integrated a green "Reload Page" button on the card. Clicking it calls the new `reloadAccount` API, refreshes the view, and dismisses the card.
   - Used the static `RotateCw` icon to match the layout and appearance of the reload button on the main titlebar.

3. **Rebranding to WAllie**:
   - Replaced name, description, author, and repository metadata in `package.json`, `electron-builder.yml`, `PKGBUILD`, and `index.html`.
   - Created `build/wallie.desktop` featuring the new branding and custom `wallie` protocols, while removing the deprecated `build/wali.desktop` template.
   - Configured custom protocol scheme handlers `wallie://` inside `src/main/index.ts` and system tray tooltip branding.

4. **External Link Delegation & Safety**:
   - Added `will-navigate` and `setWindowOpenHandler` on `mainWindow` in the main process. This ensures that clicking repository ("Leave a star!") or donation links within the Settings Modal routes safely to the system's default web browser instead of hijacking the application window.

---

## Consequences
- **Improved UX Control**: Users can now change multiple browser permissions or clear cache data seamlessly, then trigger a single page reload at their own convenience.
- **Unified Branding**: The entire repository and distribution packaging are aligned under the new `WAllie` brand name.
- **Robust External Links**: App links can no longer load external pages inside the main application context, maintaining clean navigation state.
