# ADR 013: Unified Settings Design, Account Controls, and Tray/Relaunch Behaviors

## Status
Accepted

## Context
As the WAllie WhatsApp client grew, the visual design and management controls in the Settings Modal Drawer became fragmented:
1. **Design Inconsistency**: Subpages like General, Preload, Accounts, and Permissions featured standard green Lucide headers and descriptions, whereas Extensions, CSS, Storage, and Notification History had custom styles and lacked headers.
2. **Scattered Account Selectors**: Account-specific configuration pages (Permissions, Extensions, CSS, Storage) each used different layouts and padding to select the active account.
3. **Friction in Navigation**: There was no convenient way to jump directly from an account card in "Manage Accounts" to its specific custom CSS, storage, or permissions. Additionally, toggling whether an account preloaded on startup required jumping back and forth to a separate "Preload" subpage.
4. **Desktop Notification Clutter**: Native desktop alerts used a heavy title prefix containing both the account emoji and name, e.g. `<emoji> [<account name>] <chat name>`. Users requested a cleaner, simplified format.
5. **Missing Startup & Restart Controls**: Toggling hardware acceleration required a manual application restart, but the UI had no prompt or automated relaunch mechanism. There was also no option to start the app directly minimized to the system tray.
6. **Titlebar Integration**: Users wanted a way to right-click on an account tab in the window titlebar to open the Settings Modal directly focused on that account's management panel.
7. **Menu Priority**: "Manage Accounts" was nested below "General Settings" and "Accounts to load on launch" in the main settings drawer list, making it less accessible than it should be.
8. **Static Jumps**: Navigating between subpages (especially during direct jumps) felt jarring since the contents swapped instantly without transitions.

---

## Decisions
We implemented the following solutions:

1. **Settings Subpage Design & Transition Unification**:
   - Standardized all 8 settings drawer pages to utilize a uniform layout: a green-tinted Lucide icon, a bold page header, and a consistent description paragraph.
   - Standardized the account dropdown selector into a unified, card-like selector banner styled uniformly across Permissions, Extensions, CSS, and Storage sections.
   - Added a clickable text button to the Notification History warning notice, allowing users to jump directly to General settings to enable logging.
   - Introduced a CSS-based transition utility `.subpage-animate` inside `src/renderer/index.css` featuring a horizontal slide-in and opacity fade (`translateX(16px)` to `translateX(0)` over `0.22s` using `cubic-bezier`). Applied it to all 8 sub-pages to make section transitions feel smooth.

2. **Menu Ordering & Titlebar Right-Click Jump**:
   - Moved the **Manage Accounts** button to the very top of the settings modal's main menu list.
   - Integrated a **Manage Account** item inside the titlebar tab right-click context menu (defined in the main process).
   - Created a new IPC channel `settings:open-manage-accounts` that triggers a listener in `App.tsx` to launch the Settings Drawer, set the active page state to `'accounts'`, and focus the target account.

3. **Inline Account Management Controls**:
   - **Row 2 Actions**: Added inline jump buttons under each account card inside "Manage Accounts" representing Delete (red Trashcan), Storage, Permissions, Extensions, Custom CSS, and Notification History. Clicking these updates the active account context and slides to the correct settings page instantly.
   - **Row 3 Launch Checkbox**: Added a `Load account on launch` checkbox directly below each account's details to manage background preloading without forcing navigation to the preload page.
   - **Safe Deletion**: Connected the red trashcan button to the main process `account:remove` IPC handler, ensuring the native warning prompt is displayed before account metadata and session data directories are cleared.

4. **Start Minimized to Tray**:
   - Added a `startMinimized` boolean configuration option to the `GlobalSettings` interface.
   - Integrated a "Start Minimized" checkbox toggle inside the General settings page.
   - Modified `ready-to-show` inside `src/main/index.ts` to bypass `mainWindow?.show()` if `startMinimized` is checked, starting the app quietly in the tray.

5. **Hardware Acceleration Relaunch**:
   - Exposed a `relaunchApp` method over IPC (`app:relaunch`) calling Electron's `app.relaunch()` and `app.exit(0)`.
   - Prompt the user with a confirmation dialog when they toggle Hardware Acceleration off, offering to perform an immediate relaunch to apply the change.

6. **Notification Title Simplification**:
   - Re-styled the desktop notification titles constructed inside the main process from `${emojiPrefix}[${senderAccount.name}] ${data.title}` to:
     - `const brandedTitle = senderAccount.emoji ? `${senderAccount.emoji} | ${data.title}` : `| ${data.title}`;`

---

## Consequences
- **Sleek, Unified UX**: The entire settings suite follows a uniform layout pattern, conforming to WAllie's dark-mode/green-tint branding, with elegant page transitions.
- **Titlebar Right-Click Jump**: Users can directly enter an account's management panel simply by right-clicking its tab in the titlebar, reducing settings navigation friction.
- **Priority Drawer Routing**: "Manage Accounts" is now the primary entry point in settings.
- **Centralized Account Administration**: Managing settings for multiple accounts is centralized; jumping to specific sections or configuring startup options takes a single click.
- **Better App Control**: Users can cleanly configure silent tray starts and restart the app seamlessly when updating core graphics parameters.
- **Polished Notifications**: Incoming system alerts are shorter, cleaner, and display less repetitive text.
