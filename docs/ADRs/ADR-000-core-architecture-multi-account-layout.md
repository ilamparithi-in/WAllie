# ADR 000: Core Architecture, UI Layout, and Phased Roadmap

## Status
Accepted

## Context
We require a native-feeling, lightweight, multi-account WhatsApp Web client tailored for Linux desktop environments. Key requirements include:
- Support for Chrome Extensions (unpacked MV2/MV3 and Chrome Web Store CRX files).
- Multiple isolated account instances (multi-session).
- Custom CSS theme customization.
- Complete WebRTC audio/video calls permissions management.
- Persistent local notification history drawer and native desktop notifications.
- Lightweight background process with system tray integration.
- Distribution support targeting Arch Linux (`PKGBUILD`), `.deb`, `.rpm`, `AppImage`, and Flatpak.

## Architectural & Design Decisions

### 1. Core Framework: Electron + TypeScript
- **Decision**: Selected Electron over Tauri (WebKitGTK) and Qt WebEngine.
- **Rationale**: WebKitGTK on Linux lacks Chromium Extension APIs (`chrome.*` MV2/MV3 support), which breaks the core requirement for Chrome Extensions support. Electron provides native Chromium extension APIs (`session.loadExtension`), robust WebRTC capabilities, seamless native partition isolation, and built-in system tray integration.

### 2. Multi-Instance Session Isolation
- **Decision**: Use Electron's native session partitions (`session.fromPartition('persist:account_<uuid>')`).
- **Rationale**: Keeps cookies, LocalStorage, IndexedDB, site data, and Chrome extension instances strictly isolated per WhatsApp account without data leaks between accounts.

### 3. Native View Rendering: `WebContentsView`
- **Decision**: Use `WebContentsView` (Electron 30+ native view API) attached directly below the 28px custom titlebar.
- **Rationale**: Replaces deprecated `BrowserView` and high-overhead `webview` tags, providing optimal hardware acceleration, lower memory overhead, and smooth dynamic resize bounds handling.

### 4. UI Layout & Ultra-Thin Titlebar Design
- **Decision**: Option B (Multi-account tab switcher in titlebar) with a clean ~28px height.
  - **Left/Center**: Account tab buttons `[Acc 1]` `[Acc 2]` and `[+]` add account tab button.
  - **Right**: Tucked `[ ⚙ ]` Settings gear button next to window controls `[_]` `[□]` `[✕]`.
- **Rationale**: Tucking Chrome Extensions, Custom CSS Editor, Storage Manager, and Notification History inside a sleek Settings drawer overlay opened by `[ ⚙ ]` prevents titlebar clutter while preserving quick access to all utility controls.

### 5. Memory & CPU Optimization Strategy
- **Decision**: Enabled `backgroundThrottling: true`, GPU rasterization flags (`enable-gpu-rasterization`, `enable-zero-copy`), and a lightweight system tray daemon (`Tray` + `AppIndicator`).
- **Rationale**: Allows non-active WhatsApp Web views to throttle CPU/RAM consumption while continuing to receive WebSocket push events for native notifications.

### 6. Storage & Notification Persistence
- **Decision**: File-backed JSON store (`notification_history.json`) for notification logging instead of native binary SQLite bindings.
- **Rationale**: Avoids native binary compilation issues (`node-gyp`) across different Linux distributions, kernel versions, and sandboxed package managers (e.g. Flatpak).

### 7. Phased Implementation Roadmap
- **Decision**: Structured the implementation into 5 sequential, minimum viable phases:
  - **Phase 1**: Core Foundation, Ultra-Thin Titlebar & WhatsApp Web Rendering.
  - **Phase 2**: Multi-Account Partition Switcher & Chrome Extensions Engine.
  - **Phase 3**: WebRTC Calls, Permissions & Storage Management.
  - **Phase 4**: Custom CSS Theme Injector & Notification History System.
  - **Phase 5**: Packaging & Multi-Distro Distribution (Arch Linux `PKGBUILD`, `.deb`, `.rpm`, `AppImage`).

## Consequences
- **Extension Compatibility**: Full support for Chrome Web Store extensions (e.g., WA Web Plus, Privacy Extension for WhatsApp Web).
- **Clean Aesthetic**: Modern, ultra-compact titlebar design (~28px) maximizing vertical screen real estate for WhatsApp Web chats.
- **Multi-Account Capability**: Users can simultaneously log into multiple independent WhatsApp accounts with isolated data stores.
- **Distro Portability**: Zero native binary compilation issues, ensuring easy packaging for Arch Linux, Debian, Ubuntu, Fedora, and AppImage.
