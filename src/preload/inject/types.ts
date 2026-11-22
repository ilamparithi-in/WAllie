export interface WallieIpcBridge {
  onNotificationClicked: (callback: (data: any) => void) => (() => void) | void;
  onSendInlineReply: (callback: (data: { contactName: string; text: string; tag: string }) => void) => void;
  onAnchorDownload?: (filename: string, size?: number, hash?: string) => void;
  createNotification: (data: { title: string; body: string; icon: string; tag: string; canReply?: boolean; isEdit?: boolean }) => void;
  closeNotification: (tag: string) => void;
  dismissChat?: (data: { tag?: string; contactName?: string }) => void;
  fetchLinkPreview?: (url: string) => Promise<any>;
  getResponsiveLayoutMode?: () => Promise<'disabled' | 'auto' | 'portrait'>;
  onResponsiveLayoutModeChanged?: (callback: (mode: 'disabled' | 'auto' | 'portrait') => void) => () => void;
}

declare global {
  interface Window {
    Notification: any;
    ServiceWorkerRegistration: any;
    HTMLAnchorElement: any;
    Store?: any;
    require?: (module: string) => any;
    __wallie_ipc?: WallieIpcBridge;
  }
}
