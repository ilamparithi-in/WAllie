import { registerWindowHandlers } from './windowHandlers';
import { registerAccountHandlers } from './accountHandlers';
import { registerSettingsHandlers } from './settingsHandlers';
import { registerExtensionHandlers } from './extensionHandlers';
import { registerNotificationHandlers } from './notificationHandlers';
import { registerSystemHandlers } from './systemHandlers';
import { registerDownloadHandlers } from './downloadHandlers';
import { registerProtocolHandlers } from './protocolHandlers';
import { registerChatExportHandlers } from './chatExportHandlers';

/**
 * Registers all modular IPC handlers across the main process.
 * Input validation is enforced on all channels via Zod schemas.
 */
export function registerIpcHandlers(): void {
  registerWindowHandlers();
  registerAccountHandlers();
  registerSettingsHandlers();
  registerExtensionHandlers();
  registerNotificationHandlers();
  registerSystemHandlers();
  registerDownloadHandlers();
  registerProtocolHandlers();
  registerChatExportHandlers();
}

export * from './schemas';

