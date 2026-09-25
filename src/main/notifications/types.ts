export interface NotificationAction {
  id: string;
  label: string;
}

export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  actions?: NotificationAction[];
  canReply?: boolean;
  replyPlaceholder?: string;
  timeoutMs?: number;
  tag?: string;
  contactName?: string;
  accountId?: string;
  onAction?: (actionId: string) => void;
  onReply?: (replyText: string) => void;
  onClose?: (reason?: number | string) => void;
}

export interface NotificationCapabilities {
  actions: boolean;
  inlineReply: boolean;
  customIcons: boolean;
}

export interface NotificationProvider {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  getCapabilities(): NotificationCapabilities;
  notify(payload: NotificationPayload): Promise<string | number | null>;
  close(id: string | number): Promise<void>;
  dispose?(): Promise<void>;
}
