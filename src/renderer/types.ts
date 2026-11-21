export interface DownloadState {
  id: number;
  filename: string;
  savePath?: string;
  percent: number;
  state: 'progressing' | 'completed' | 'failed' | 'cancelled';
  receivedBytes?: number;
  totalBytes?: number;
}

export interface ToastItem {
  id: number;
  message: string;
  url?: string;
  isExiting?: boolean;
}

export type SettingsPageType =
  | 'main'
  | 'extensions'
  | 'css'
  | 'storage'
  | 'notifications'
  | 'general'
  | 'preload'
  | 'permissions'
  | 'accounts'
  | 'downloads'
  | 'advanced';

