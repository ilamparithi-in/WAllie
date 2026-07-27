# ADR 012: Wayland Screen Sharing and Call Popout Auto-Close Fixes

## Status
Accepted

## Context
During audio/video calling and screen-sharing workflows, we identified two main usability bugs:

1. **Wayland Screen Share Double-Prompt**:
   On Linux systems running under Wayland, when screen sharing was requested, Electron's `setDisplayMediaRequestHandler` called `desktopCapturer.getSources()`. Due to Wayland's security model, this immediately triggered the native system-level PipeWire (`xdg-desktop-portal`) screen selection dialog (first prompt). After the user made a choice, the app displayed its own custom context menu listing the captured sources. Selecting a source from the custom menu then started the actual capture stream, triggering the PipeWire portal picker a second time (second prompt).

2. **Call Popout Blank Window Hang**:
   When a call ended inside the popped-out call window (`/call/popout`), the window frequently remained entirely blank for approximately 2 seconds before closing automatically. This delay occurred because WhatsApp Web's closing scripts take time to teardown, leaving the user with a hung blank screen. If a call experience rating survey was displayed, the window should stay open so the user can rate it, but otherwise it should close immediately.

---

## Decisions
We implemented the following solutions:

1. **Wayland Display Handler Short-Circuit**:
   - Updated the `setDisplayMediaRequestHandler` in [src/main/index.ts](file:///home/ilam_common/DevHome/GitHub/walinux/src/main/index.ts#L356-L373) to detect if the OS is running under a Wayland session by verifying `process.platform === 'linux'` and checking if environment variables `WAYLAND_DISPLAY` or `XDG_SESSION_TYPE === 'wayland'` are set.
   - If Wayland is active, the handler skips querying `desktopCapturer.getSources` and avoids popping up the custom Electron menu. Instead, it immediately calls the handler callback with a placeholder/dummy source `{ id: 'screen:0:0', name: 'Entire Screen' } as any`.
   - Chromium's native PipeWire capturer then handles the request, displaying the system picker exactly once and starting the capture session immediately after the user makes a selection.
   - Preserved the existing custom menu selection logic as a fallback for X11/non-Wayland sessions.

2. **Call Popout Blank Screen Detection & Auto-Close**:
   - Introduced a lightweight monitoring function `monitorCallBlankScreen` inside the preload script [src/preload/index.ts](file:///home/ilam_common/DevHome/GitHub/walinux/src/preload/index.ts#L702-L760).
   - Once the call window is opened, the routine polls the DOM every 200ms:
     - **Active Call Detection**: Checks for active media tags (`video`, `audio`, `canvas`) or calling controls (elements matching `hangup`, `micro`, `video`). If found, flags `callWasActive = true`.
     - **Blank Auto-Close**: If the call was once active but has now stopped, checks if call survey keywords (e.g. "how was", "rate", "feedback", "stars") are present in the text content. If no survey keywords are present, it increments a blank check counter. If the screen remains blank for 3 consecutive checks (~600ms), it immediately calls `window.close()`.
     - **Fail-Safe Timeout**: If the window remains completely blank for 10 seconds without ever starting a call, it closes automatically to clean up stuck windows.

---

## Consequences
- **Improved Screen Sharing UX**: Linux Wayland users now only see the native OS-level screen picker once, with no redundant custom menus or duplicate selections.
- **Fast Call Teardown**: Popout call windows are closed cleanly within ~600ms of a call ending, removing the confusing 2-second blank window lag.
- **Intact Feedback Surveys**: Users can still interact with call rating feedback surveys when WhatsApp Web offers them.
