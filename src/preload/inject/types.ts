export interface WalinuxIpcBridge {
  onNotificationClicked: (callback: (data: any) => void) => void;
  onSendInlineReply: (callback: (data: { contactName: string; text: string; tag: string }) => void) => void;
  onAnchorDownload?: (filename: string, size?: number, hash?: string) => void;
  createNotification: (data: any) => void;
  closeNotification: (tag: string) => void;
  dismissChat?: (data: { tag?: string; contactName?: string }) => void;
  fetchLinkPreview?: (url: string) => Promise<any>;
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
