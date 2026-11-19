# ADR 010: Decoupled Startup Preloading and Hardened Browser Permissions

## Status
Accepted

## Context
During feature design and a subsequent security audit of the settings drawer, we identified three areas for improvement:
1. **Inefficient Parallel Preloading**: The app had a single global toggle `"Load All Accounts on Launch"` that preloaded all accounts on startup. This lacked granularity for users who wanted to prioritize memory and CPU savings by only preloading specific primary accounts.
2. **Coupled UI Layout**: The per-account permissions configuration (Camera, Microphone, and Push Notifications) was coupled inline within the General Settings page, adding clutter.
3. **Implicit Auto-Approvals (Security Risk)**: A security audit of the Electron session permission handlers showed that permission requests originating from trusted WhatsApp domains that did not explicitly match `'notifications'` or `'media'` were automatically approved (`callback(true)`). This allowed pages or extensions to silently access sensitive APIs like `clipboard-read` (reading system clipboard contents) or `geolocation` (tracking location coordinates).

---

## Decisions
We implemented the following solutions:

1. **Selective Startup Preloading**:
   - Replaced `loadAllOnLaunch: boolean` in the `GlobalSettings` schema with a `preloadAccountIds: string[]` collection.
   - Introduced a migration mechanism in `loadSettings()`: if a user previously had `loadAllOnLaunch: true`, their `preloadAccountIds` list is automatically populated with all existing accounts.
   - Designed a new "Accounts to load on launch" checklist page in the Settings modal to allow users to toggle startup preloading per account.

2. **Decoupled Permissions Layout ("Browser permissions")**:
   - Decoupled per-account permissions from General Settings and created a dedicated "Browser permissions" settings page in the modal drawer.

3. **Hardened Permission Request Validation**:
   - Extended the per-account settings types to support `geolocationEnabled?: boolean` and `clipboardReadEnabled?: boolean` options, defaulting both to `false` (disabled) for privacy.
   - Rewrote `setPermissionRequestHandler` and `setPermissionCheckHandler` in `src/main/index.ts` to strictly enforce user preference checks for `geolocation` and `clipboard-read` requests.
   - Allowed standard browser capabilities (`background-sync` for offline worker caching and `fullscreen` for media playback) while rejecting all other untracked/experimental API permissions (e.g. `midi`, `sensors`, `paymentHandler`, etc.).
   - Explicitly cast permission parameters to `string` where necessary to bypass strict union typing restrictions.

---

## Consequences
- **Optimized Resources**: Memory and CPU usage on startup can now be tuned by selecting only active accounts to load in the background.
- **Enhanced Privacy & Security**: Geolocation tracking and silent clipboard reading are now blocked by default, and users can selectively toggle access per account.
- **Improved UX Flow**: The settings modal is now cleanly separated into target-focused screens: general configuration, startup preload lists, and device/browser permission control.
