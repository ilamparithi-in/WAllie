# ADR 001: Preload Script Packaging, Viewport Resize Debouncing, and Zoom Controls Positioning

## Status
Accepted

## Context
During the initial build and validation of the lightweight multi-account WhatsApp Web client shell, several structural bugs emerged:
1. **Preload Script Crash**: The preload script failed to load in the renderer process with errors (`require is not defined` / `Unexpected token 'export'`). This occurred because the project configuration uses `"type": "module"` (ESM), but Electron expects preload scripts to use CommonJS format and require statements when sandbox integration is active. Vite's bundler compiled preload to ESM.
2. **Renderer Bundle Pollution**: Direct imports of interfaces/types from the preload script file into React components (`Titlebar.tsx`) caused Vite to bundle Node-specific code inside the web client renderer build, triggering runtime crashes.
3. **Viewport Sizing Swapping**: On Linux/GTK window managers, layout resizing and maximize/restore actions resulted in swapped viewport boundaries. The webview bounds were being queried and updated during transition animations, resulting in stale bounds calculations.
4. **Zoom Controls & Visual Tooltip Clipping**: Zoom shortcuts did not function consistently across keyboards/DPI scales. Additionally, drawing a floating zoom tooltip inside the React `<main>` panel was invisible because Electron's native child `WebContentsView` overlays the HTML content layer completely.

## Decisions
We made the following structural and layout decisions to resolve these issues:

1. **Preload Compilation via `tsc`**: Removed the preload entry point from Vite's compilation array. Added a custom NPM script `build:preload` that uses the TypeScript compiler (`tsc`) directly with `--module commonjs` to produce a clean CommonJS file, which is then renamed to `dist/preload/index.cjs`. This ensures Electron loads it using standard CommonJS rules.
2. **Type-Only Imports**: Enforced `import type` imports in all React components referencing definitions inside the preload script, ensuring they compile out entirely and do not pull preload module logic into the renderer.
3. **Hybrid Bounds Recalculation**: Implemented a hybrid sizing approach. In response to the `resize` event, the view bounds are updated synchronously to ensure that content scales instantly and smoothly with window dragging. A 50ms debounced trailing callback and explicit 100ms delays on maximize/unmaximize handlers are retained to allow GTK layouts to fully settle, guaranteeing final viewport accuracy.
4. **Step-Based Zoom Snapping**: Replaced floating-point increments with snap-based indexing on Chrome's standard zoom steps: `[0.5, 0.67, 0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0]`. Registered key handlers on the main window and views to direct zoom level changes to the active partition contents.
5. **Titlebar-Integrated Zoom Badge**: Moved the zoom indicator from the renderer container to the custom `Titlebar` layout (which sits in the uncovered top 28px region). The badge is fully interactive (resets to 100% on click), flashes on zoom updates, and automatically hides at standard 100% zoom.

## Consequences
- **Robust Startup**: The application starts up reliably with no renderer-side JavaScript failures.
- **Accurate Viewport bounds**: Resizing, maximizing, and restoring windows update the child views immediately with zero size swapping.
- **Chrome-Like Zoom UX**: Users gain keyboard shortcuts (`Ctrl +/-/0`) for zooming inside WhatsApp Web, with a visually integrated indicator badge inside the titlebar to show and reset current zoom factors.
