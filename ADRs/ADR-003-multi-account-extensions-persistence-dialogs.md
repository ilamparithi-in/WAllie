# ADR 003: Multi-Account Configuration Persistence, Dynamic Extension Loading, Linux File Selection Fixes, and Tab Context Controls

## Status
Accepted

## Context
During Phase 2 implementation of multi-account isolation and Chrome Extensions support, several structural and OS-specific challenges arose:

1. **Session & Configuration Persistence**:
   - In Phase 1, tabs and accounts were hardcoded. Restarting the client would lose all added account sessions and log out the user.
   - Accounts needed a persistent metadata store to track tab names, partition IDs, custom extensions list, and login states across restarts.

2. **Linux GTK File Chooser Restrictions**:
   - Attempting to support selecting both unpacked folders and ZIP/CRX files inside a single native `dialog.showOpenDialog` properties list (`['openFile', 'openDirectory']`) locked the dialog to folders-only mode on Linux GTK, making file selection impossible.

3. **Silent Deadlocks on Page Refreshes**:
   - If a user had unsaved drafts or page state, clicking the refresh button failed silently. Electron automatically cancels unloads when a page registers a `beforeunload` interceptor unless the `will-prevent-unload` event is explicitly handled and allowed.

4. **Annoying Warnings for Empty Tabs**:
   - Deleting a newly added tab that the user had not yet logged into was prompting with a destructive data-loss warning dialog, which hindered fast tab-management workflows.

5. **Tab Button Clutter**:
   - A close button ("X") showing up on hover inside thin (28px) titlebar tabs resulted in accidental deletion clicks and UI clutter.

## Decisions

To address these context issues, we made the following architectural and design decisions:

### 1. JSON Configuration Store (`accounts.json`)
- **Decision**: Implemented a file-backed persistence layer using a custom JSON schema loaded/saved via standard Node.js synchronous file system APIs (`fs.readFileSync` and `fs.writeFileSync`) during application boot and updates.
- **Implementation**: Configuration is written to `app.getPath('userData')/accounts.json`, storing custom tab names, partitions, imported extensions list, and verified login status.

### 2. Sandbox-Safe Chrome Extensions Engine
- **Decision**: Developed a local unpacked extension filesystem structure under `app.getPath('userData')/extensions/<accountId>/<extensionId>`.
- **Implementation**:
  - Unpacked directories are copied recursively via `fs.cpSync`.
  - ZIP and CRX packages are parsed via a custom buffer scanner that strips the binary signatures of CRX v2/v3 header structures and passes the raw ZIP payload to `adm-zip` for disk extraction.
  - Session extensions are loaded asynchronously via `session.loadExtension` before firing `view.webContents.loadURL` to ensure content scripts hook initial DOM painting.

### 3. Split Import Menus for Linux GTK
- **Decision**: Replaced the unified open dialog with a split menu popup overlay.
- **Implementation**:
  - The UI presents a dropdown under "Import Extension" with two options: **"Unpacked Folder..."** and **"ZIP / CRX File..."**.
  - Folder imports pass `'folder'` to properties (`['openDirectory']`), while archive imports pass `'archive'` to properties (`['openFile']` with `.zip/.crx` file filters).

### 4. DOM-based Login Checks & Confirmation Bypass
- **Decision**: Bypassed native warning prompts when removing fresh, unlogged-in tabs.
- **Implementation**:
  - Injected a DOM-check script running on intervals and page load events inside the isolated `WebContentsView` context to detect elements unique to the WhatsApp chat interface (`#pane-side` or `[data-testid="chat-list-search"]`).
  - Set `account.loggedIn = true` on success and persisted it.
  - Modified the tab deletion handler to skip displaying `dialog.showMessageBox` if `loggedIn` is false.

### 5. Pass-Through will-prevent-unload Event Handling
- **Decision**: Handled the `will-prevent-unload` WebContents event to proxy page-unload blocks to a native dialogue wrapper.
- **Implementation**: Opens a native dialogue query ("Reload site? Changes you made may not be saved") and fires `event.preventDefault()` (which permits page unload) if the user clicks "Reload".

### 6. Clean Titlebar Tabs with Context Menus
- **Decision**: Removed the hover close icon on titlebar tabs and delegated options to right-click menus.
- **Implementation**:
  - Captured `onContextMenu` React events on tabs and forwarded the trigger to the main process via IPC.
  - Displays a native template `Menu` featuring **"Rename Account"** (emits event to toggle inline React text inputs) and **"Remove Account"** (triggers confirm deletion) options.

## Consequences
- **Persistent Environment**: User logged-in sessions, tab names, and extension choices persist reliably between restarts.
- **Robust Imports**: Users can import unpacked, zipped, or CWS CRX extensions without hitches across all Linux distributions.
- **Streamlined Workflow**: Removing unused, unlogged-in tabs is immediate and silent, while active ones remain protected.
- **No Deadlocked Refreshes**: Refreshes complete successfully, warning the user if active chats have pending drafts.
- **Aesthetic Tabs**: Titlebar UI is minimalist, native-feeling, and less prone to misclicks.
