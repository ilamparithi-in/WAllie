# ADR 002: GTK Window Drag Masking, WebContentsView Modal Detachment, and Linux Runtime Fixes

## Status
Accepted

## Context
During Phase 1 implementation and interactive testing of the frameless Electron WhatsApp Web Linux client, two major window interaction and rendering issues were identified:

1. **Unresponsive Window Controls on Linux (GTK)**:
   - Clicking custom window controls (`Minimize`, `Maximize / Restore Down`, `Close`), Settings gear, or account tab buttons in the titlebar had no effect, or behaved like dragging the window.
   - **Root Cause**: Setting `-webkit-app-region: drag` on the outer parent `<header>` container created a GTK-level window drag mask across the entire top 28px rectangle of the window. On Linux (GTK / X11 / Wayland), Chromium's drag manager intercepts `mousedown` events before DOM dispatch and ignores child `-webkit-app-region: no-drag` declarations on descendant elements.

2. **Window Soft-Lock on Opening Settings**:
   - Clicking the Settings gear button rendered the window completely unresponsive (soft-locked).
   - **Root Cause**: In Electron 30+, `WebContentsView` is a native Chromium surface attached directly to `mainWindow.contentView`, rendering above the HTML window DOM in native window composition. When React opened the Settings modal, `WebContentsView` covered the modal and swallowed all pointer/keyboard events below `y: 28`, while React's backdrop intercepted renderer events, creating a deadlocked window state.

3. **Linux Electron Binary & ESM Preload Incompatibilities**:
   - `ReferenceError: __dirname is not defined` when running ES modules (`"type": "module"` in `package.json`).
   - System tray icon failure (`Error: invalid buffer size`) when passing SVG strings directly to `nativeImage.createFromBitmap()`.

## Decisions

To resolve these architectural and platform-specific issues, we made the following decisions:

### 1. Scoped Window Drag Regions for Linux (GTK)
- **Decision**: Removed `style={{ WebkitAppRegion: 'drag' }}` from the outer `<header>` wrapper tag in `Titlebar.tsx`.
- **Implementation**: Drag functionality is scoped exclusively to dedicated non-interactive elements: the branding logo container and the middle empty spacer (`<div className="flex-1 h-full" style={{ WebkitAppRegion: 'drag' }} />`).
- **Rationale**: Keeps all interactive elements (tabs, add account, settings, minimize, maximize, close) completely outside GTK's window drag region mask, ensuring 100% of mouse clicks trigger React event handlers directly.

### 2. Native `WebContentsView` Lifecycle Detachment for Overlays
- **Decision**: Implemented an IPC message bridge (`settings:toggle`) to dynamically detach and re-attach active `WebContentsView` instances during overlay modal lifecycles.
- **Implementation**:
  - When Settings opens (`isOpen: true`), the main process calls `mainWindow.contentView.removeChildView(activeView)` to completely detach `activeView` from native window composition.
  - When Settings closes (`isOpen: false`), the main process calls `mainWindow.contentView.addChildView(activeView)` and restores active bounds (`updateActiveViewBounds()`).
- **Rationale**: Completely uncovers the HTML renderer window when modals are active, giving 100% visual visibility, keyboard focus, and mouse click access to the Settings modal without reloading WhatsApp Web or losing session state.

### 3. Window Maximize State Synchronization
- **Decision**: Added `maximize` and `unmaximize` window event listeners on `mainWindow` in the main process (`src/main/index.ts`).
- **Implementation**: Emits `window:maximized-changed` IPC events to the renderer so `Titlebar.tsx` dynamically toggles between the `Square` (Maximize) and `Copy` (Restore Down) icons when windows are resized or double-clicked via window manager shortcuts.

### 4. ESM `__dirname` & Data URL Native Image Fixes
- **Decision**:
  - Constructed ESM-compatible `__filename` and `__dirname` variables in `src/main/index.ts` using Node.js `fileURLToPath` and `import.meta.url`.
  - Created native system tray icons using Base64-encoded SVG Data URLs (`nativeImage.createFromDataURL('data:image/svg+xml;base64,...')`) for cross-distro tray compatibility (GNOME, KDE Plasma, XFCE).

## Consequences
- **Functional Titlebar Controls**: Window controls (`_`, `□`, `✕`), tabs, and settings buttons work reliably across Linux GTK desktop environments (X11 and Wayland).
- **Flawless Modal UX**: Opening and closing Settings is fast, fluid, and free of view-layer soft locks or event blocking.
- **Clean Cross-Platform Execution**: Electron launches smoothly without ESM or buffer conversion crashes.
