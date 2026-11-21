/**
 * Central IPC Entrypoint (Modularized)
 *
 * Handlers are organized into domain-specific modules in `./ipc/`:
 * - windowHandlers.ts
 * - accountHandlers.ts
 * - settingsHandlers.ts
 * - extensionHandlers.ts
 * - notificationHandlers.ts
 * - systemHandlers.ts
 * - downloadHandlers.ts
 * - protocolHandlers.ts
 * - schemas.ts (Zod input validation)
 */
export { registerIpcHandlers } from './ipc/index';
export * from './ipc/schemas';
