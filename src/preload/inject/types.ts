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
