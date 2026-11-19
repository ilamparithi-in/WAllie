# ADR 014: Modular Refactoring, Security Hardening, and Storage Walk Optimizations

## Status
Accepted

## Context
As the WAllie WhatsApp client matured, several core files expanded significantly, presenting maintainability, security, and performance challenges:
1. **Monolithic God Files**: 
   - `src/main/index.ts` had grown to **2,693 lines**, housing app startup routines, custom extension extractors, tray behaviors, layout bounds math, and all IPC event listeners. This high coupling made debugging difficult and increased the risk of regression during code updates.
   - `src/renderer/components/SettingsModal.tsx` was **1,584 lines** long, combining settings state management, style definitions, and all UI views (General, Preload, Manage Accounts, Permissions, Extensions, CSS Themes, Storage, and Notification Logs) in a single file.
2. **Security Vulnerabilities**:
   - Verification of WhatsApp domains in preload scripts and main process handlers relied on loose substring checking or suffix matching (e.g., `hostname.includes('whatsapp.com')` or `hostname.endsWith('.whatsapp.net')`). These matches were vulnerable to host-spoofing attacks (e.g., `whatsapp.com.attacker.com`).
3. **Storage Walk Constraints**:
   - To compute storage partition sizes, the application spawned a recursive shell subprocess running `du -sb`. Spawning shell processes during deep directories recursion resulted in system handle constraints, process locking, and potential sandbox compatibility issues.

---

## Decisions
We executed a complete refactoring and security audit of the codebase:

1. **Main Process Modularization**:
   - Deconstructed `src/main/index.ts` into specialized, single-responsibility modules:
     - `src/main/state.ts`: Encapsulates shared global mutable variables, resolving ESM read-only export constraints.
     - `src/main/utils.ts`: Houses app icon loaders, user agent variables, and domain verification.
     - `src/main/config.ts`: Manages JSON configuration file read/writes.
     - `src/main/extensions.ts`: Operates zip extraction, extension permissions prompts, and deletion.
     - `src/main/views.ts`: Instantiates Electron WebContentsViews, custom context menus, and custom CSS injections.
     - `src/main/window.ts`: Controls bounds resizing math, cubic-bezier easing intervals, trays, and DevTools frames.
     - `src/main/notifications.ts`: Powers notification cache logs and native alert triggers.
     - `src/main/ipc.ts`: Binds all `ipcMain` channels to their corresponding modular handlers.
   - Refactored `src/main/index.ts` to act solely as a lightweight bootstrapper that configures Chrome hardware acceleration switches, reads initialization states, and triggers the modular modules.

2. **Settings Drawer Refactoring**:
   - Modularized `src/renderer/components/SettingsModal.tsx` by moving the layout of each settings panel into dedicated sub-components within `src/renderer/components/settings/`:
     - `GeneralSettingsPage.tsx`
     - `PreloadSettingsPage.tsx`
     - `AccountsSettingsPage.tsx`
     - `PermissionsSettingsPage.tsx`
     - `ExtensionsSettingsPage.tsx`
     - `ThemeSettingsPage.tsx`
     - `StorageSettingsPage.tsx`
     - `NotificationSettingsPage.tsx`
   - Rewrote `SettingsModal.tsx` to act purely as a lightweight layout shell and routing controller.

3. **Security Hardening via Strict Regular Expressions**:
   - Implemented a strict regular expression verification for WhatsApp domains:
     ```typescript
     export const WHATSAPP_DOMAIN_REGEX = /^([^.\s]+\.)*whatsapp\.(com|net)$/i;
     ```
   - Replaced all loose hostname checks in `src/preload/index.ts` and `src/main/utils.ts` with test checks matching this regex pattern.

4. **Asynchronous Non-Blocking Storage walk**:
   - Replaced shell subprocesses (`du -sb`) with a native Javascript recursive directory size walker.
   - Utilized asynchronous, non-blocking `fs.promises.stat` calls to aggregate directory sizes, preventing main thread freezes and resolving process spawning handle constraints.

---

## Consequences
- **Clean and Maintainable Codebase**: Main and renderer god files are reduced to clear, specialized chunks, simplifying development, testing, and debugging.
- **Enhanced Security**: Closed host-spoofing vectors by strictly auditing WhatsApp domains against `WHATSAPP_DOMAIN_REGEX`.
- **Improved Performance**: Switched from heavy recursive shell execution to lightweight, asynchronous, native filesystem checks, minimizing runtime resource utilization.
- **Build Integrity**: All modular refactoring compiles successfully, passing `npm run typecheck` and standard bundling pipelines (`npm run build`).
