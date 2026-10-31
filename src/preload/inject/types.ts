export interface WalinuxIpcBridge {
  onNotificationClicked: (callback: (data: any) => void) => void;
  onSendInlineReply: (callback: (data: { contactName: string; text: string; tag: string }) => void) => void;
  onAnchorDownload?: (filename: string, size?: number, hash?: string) => void;
  createNotification: (data: any) => void;
  closeNotification: (tag: string) => void;
  dismissChat?: (data: { tag?: string; contactName?: string }) => void;
  fetchLinkPreview?: (url: string) => Promise<any>;
  saveChatMedia?: (outputDirectory: string, filesDirName: string, subPath: string, data: string | ArrayBuffer) => Promise<string>;
  finalizeChatExport?: (outputDirectory: string, exportData: any, includeViewer: boolean) => Promise<{ jsonPath: string; htmlPath?: string }>;
  registerChatExportJob?: (exportId: string, options: any, totalChats: number, currentChatIndex: number) => Promise<boolean>;
  updateChatExportProgress?: (exportId: string, partial: any) => Promise<boolean>;
  completeChatExportJob?: (exportId: string) => Promise<boolean>;
  isChatExportAborted?: (exportId: string) => Promise<boolean>;
  stopChatExport?: (exportId?: string) => Promise<boolean>;
  openPath?: (targetPath: string) => Promise<boolean>;
  showInFolder?: (targetPath: string) => Promise<boolean>;
  openExportViewer?: (filePath: string) => Promise<void>;
  findExistingDownload?: (filename: string, size?: number) => Promise<{ found: boolean; path?: string }>;
  copyFileToExport?: (outputDirectory: string, filesDirName: string, subPath: string, sourcePath: string) => Promise<string>;
  prepareExportDownload?: (filename?: string, size?: number) => Promise<boolean>;
  waitForDownload?: (expectedFilename?: string, timeoutMs?: number) => Promise<{ success: boolean; savePath?: string; filename?: string }>;
}

declare global {
  interface Window {
    Notification: any;
    ServiceWorkerRegistration: any;
    HTMLAnchorElement: any;
    Store?: any;
    require?: (module: string) => any;
    __walinux_ipc?: WalinuxIpcBridge;
  }
}
