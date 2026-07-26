# Phased Implementation Plan - WhatsApp Web Linux Client

Build a lightweight, feature-rich WhatsApp Web desktop client tailored for Linux, executed in strict functional phases.

---

## Clean Layout Architecture (~28px Ultra-Thin Titlebar)

To maintain a clean, uncluttered interface:
- **Left/Center**: Account tabs `[Acc 1]` `[Acc 2]` `[ + ]`
- **Right**: Settings Gear Icon `[ ⚙ ]` + Custom Window Controls `[ _ ] [ □ ] [ ✕ ]`
- All management features (Chrome Extensions, Custom CSS, Notification History, Storage Manager) are tucked cleanly inside the **Settings Overlay** opened by the `[ ⚙ ]` button.

```
+---------------------------------------------------------------------------------------+
|  [Acc 1: Personal *] [Acc 2: Work] [ + ]                            [ ⚙ ] [_][□][X]  | (28px Clean Titlebar)
+---------------------------------------------------------------------------------------+
|                                                                                       |
|                     WhatsApp Web View (Active WebContentsView)                        |
|                                                                                       |
+---------------------------------------------------------------------------------------+
```

---

## Phased Implementation Roadmap

Each phase delivers a fully functional, testable milestone before moving to the next.

### Phase 1: Core Foundation & WhatsApp Web Rendering
- **Goal**: Functional Electron base with ultra-thin titlebar rendering WhatsApp Web cleanly.
- **Deliverables**:
  1. Project setup (TypeScript, Electron, Vite UI bundler, CSS system).
  2. Frameless Electron `BrowserWindow` with custom ~28px titlebar (window drag, minimize, maximize, close).
  3. Single isolated `WebContentsView` loading WhatsApp Web (`https://web.whatsapp.com`) with optimal User-Agent header.
  4. System Tray integration (minimize to tray / restore).
- **Milestone Verification**: App launches, titlebar renders cleanly, WhatsApp Web QR code / login page displays and functions properly.

---

### Phase 2: Multi-Account Isolation & Chrome Extensions Engine
- **Goal**: Full multi-account tab switcher and Chrome Extension support.
- **Deliverables**:
  1. Account session partition manager (`session.fromPartition('persist:account_<id>')`).
  2. Multi-tab UI in titlebar: Add new account, switch active account view, remove account session.
  3. Chrome Extensions Engine: Load unpacked extension folders (`session.loadExtension()`) and Chrome Web Store CRX/ZIP loader.
  4. Extension Management UI: Enable/disable extensions per account.
- **Milestone Verification**: User can log into 2+ distinct WhatsApp accounts in separate tabs, and load Chrome extensions (e.g. WA Web Plus / Privacy Extensions) into an account session.

---

### Phase 3: WebRTC Calls, Permissions & Storage Management
- **Goal**: Seamless voice/video calls permissions and storage manager.
- **Deliverables**:
  1. Permission Request Handlers (`setPermissionRequestHandler`) for Microphone, Camera, and Notifications.
  2. Screen sharing / Desktop Capturer selection for Linux (PipeWire / X11).
  3. Storage Management Dashboard: Calculate per-account Cache, IndexedDB, Cookies, and LocalStorage sizes.
  4. One-click "Clear Cache" and "Clear Media Data" actions without unlinking WhatsApp accounts.
- **Milestone Verification**: Voice and video calls work cleanly with camera/mic permissions, and storage data can be inspected/cleared.

---

### Phase 4: Custom CSS Engine, Notification History & Settings Drawer
- **Goal**: Complete customization and notification history tracking tucked inside a unified Settings drawer.
- **Deliverables**:
  1. Settings Drawer UI toggled by the `[ ⚙ ]` titlebar button.
  2. Custom CSS Theme Injector (`webContents.insertCSS()`) with live CSS editor and preset themes (OLED Dark, Compact UI).
  3. Web Notification Interceptor & Native Linux `libnotify` integration (with sound and avatar).
  4. Local file-backed Notification History (`notification_history.json`) drawer with search and account filtering.
- **Milestone Verification**: CSS edits instantly update WhatsApp Web styling; incoming notifications trigger native Linux popups and are stored in the history drawer.

---

### Phase 5: Packaging & Multi-Distro Distribution
- **Goal**: Production-ready Linux builds and packaging scripts.
- **Deliverables**:
  1. Primary Arch Linux packaging target (`.pkg.tar.zst` / `.tar.xz` via `electron-builder`).
  2. Multi-distro build targets: Debian/Ubuntu (`.deb`), Fedora/RPM (`.rpm`), and `AppImage`.
  3. Desktop entry integration (`whatsapp-linux.desktop`) with protocol handling and custom icon set.
- **Milestone Verification**: Automated build generates clean, installable packages for Arch Linux and other target Linux distros.

---

## User Review Required

> [!IMPORTANT]
> The plan is broken down into 5 sequential phases. We will build and test Phase 1 first before proceeding to Phase 2.

---

## Verification Plan

### Phase 1 Verification
- Build and run: `npm run dev`
- Verify window framing, ~28px titlebar drag/minimize/close actions, and WhatsApp Web QR code load.

### Phase 2 Verification
- Create 2 account tabs, log into different accounts, load an unpacked Chrome extension directory into one account.

### Phase 3 Verification
- Test audio/video call permissions prompt and storage usage counter.

### Phase 4 Verification
- Open `[ ⚙ ]` Settings, inject custom CSS snippet, trigger notification log and check history drawer.

### Phase 5 Verification
- Run `npm run package` and test generated Arch `.pkg.tar.zst` / AppImage installation.
