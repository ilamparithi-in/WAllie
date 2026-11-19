# ADR 006: Linux Packaging, Custom Protocols, Call Windows, Detached DevTools, and Message Modification Tracking

## Status
Accepted

## Context
As the project transitioned to Phase 5 and neared publication readiness, we needed to address app packaging, desktop integration, custom protocol scheme associations, child calling window behaviors, custom DevTools styling, selective media cache clearing, and chat auditing:
1. **Linux Distribution Packaging**: Configurations were required to build native installers for Arch Linux (`pacman`), Debian (`deb`), Fedora (`rpm`), `AppImage`, and `flatpak`.
2. **AUR Integration**: We needed a standard AUR package definition (`PKGBUILD` and `.desktop` template) to compile from source using system Electron runtimes.
3. **MIME Association & custom protocol URL handling**: Opening links using the `whatsapp://` or `wali://` protocols from external programs needed to open or focus the client, route correctly in a single-instance pattern, and offer the user an account selection dialog if multiple profiles were configured.
4. **WhatsApp Web Call Windows**: Standard browser popups for voice/video calls triggered "Allow popups" blocks, lacked native frame integration, and lagged when focused away. Also, playing YouTube or other media inside WhatsApp chat tabs during calls was noisy.
5. **Detached DevTools Window**: Detached Chrome DevTools lacked titlebar styling consistency and did not convey which WhatsApp account context they applied to.
6. **Destructive Media Clearing**: Clearing data folders logged users out of WhatsApp Web because standard folder deletion removed crucial `wawc` and `signal-storage` authentication states in IndexedDB.
7. **Auditing Deleted & Edited Messages**: Deleted messages disappear from view, and edited messages override content history. We needed a way to log message versions locally for auditing.

## Decisions
We implemented the following solutions:

1. **Multi-Distro Packaging Targets**:
   - Integrated `electron-builder` configuration in `electron-builder.yml` to package target distributions: `pacman` (Arch Linux), `deb` (Debian/Ubuntu), `rpm` (Fedora), `AppImage`, and `flatpak` under `dev.ilamparithi.wali`.
   - Created standardized placeholder icons from sizes `16x16` to `512x512` in `build/icons/`.
   - Added `PKGBUILD` and `build/wali.desktop` template targeting system Electron binaries.
2. **Custom Protocol Association & Single-Instance Lock**:
   - Handled single-instance lock (`app.requestSingleInstanceLock()`) inside `src/main/index.ts` to pass startup and runtime protocol links via IPC.
   - Designed a custom account-prompting overlay modal in `src/renderer/App.tsx` listing all configured accounts, allowing interactive selection of account routing for `whatsapp://send?...` paths.
3. **Optimized Call Popouts & Background Execution**:
   - Overrode `setWindowOpenHandler` for internal child windows, forcing options such as `frame: false`, `titleBarStyle: 'hidden'`, and `backgroundThrottling: false` to ensure calls stay smooth when backgrounded.
   - Automatically paused other active media playback (`pauseAllMedia()`) across all tabs when a call window is created.
   - Styled call windows with custom titlebars (`injectUnifiedTitlebar`) containing always-on-top toggles.
4. **Branded Custom DevTools**:
   - Created a custom detached BrowserWindow for DevTools (`toggleDevToolsForAccount`). It loads a custom HTML view that registers the unified titlebar styled with the target account's name.
   - Listens to account renaming IPC events to update the DevTools title bar badge dynamically.
5. **Selective Media Storage Clearing**:
   - Replaced folder deletion for media clear requests with a DOM-based JavaScript runner script that lists IndexedDB databases and deletes everything *except* `wawc` and `signal-storage` to preserve authentication session state.
6. **Main-World Message modification tracking**:
   - Injected a `MutationObserver` audit script into the main world (worldId 0) from the isolated preload script.
   - Listens to message DOM structures (`[data-id]`).
   - Detects original message contents and records modifications or deletions directly into the local notification log system, safeguarding message history.

## Consequences
- **Distribution Ready**: The application compiles and packages into all primary Linux packaging systems, with AUR compilation templates included.
- **Improved Call UX**: Calling screens open in standalone native frames with system decoration and always-on-top pinning, avoiding audio lags or competing media sources.
- **Accurate Profile DevTools**: Clicking the inspect shortcut opens a window matching the host theme and clearly indicates which account's DOM is inspected.
- **Data Protection**: Users can clear media cache space safely without being logged out.
- **Audit Logging**: Users can inspect deleted or edited message logs directly inside the notification history panel.
