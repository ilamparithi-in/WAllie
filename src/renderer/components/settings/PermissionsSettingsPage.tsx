import React from 'react';
import { Shield } from 'lucide-react';
import type { AccountInfo } from '../../../preload';

interface PermissionsSettingsPageProps {
  accounts: AccountInfo[];
  selectedAccountId: string;
  setSelectedAccountId: (id: string) => void;
  selectedAccount: AccountInfo | undefined;
  handleToggleAccountPermission: (
    permission: 'cameraEnabled' | 'micEnabled' | 'notificationsEnabled' | 'geolocationEnabled' | 'clipboardReadEnabled',
    value: boolean
  ) => Promise<void> | void;
}

export const PermissionsSettingsPage: React.FC<PermissionsSettingsPageProps> = ({
  accounts,
  selectedAccountId,
  setSelectedAccountId,
  selectedAccount,
  handleToggleAccountPermission,
}) => {
  return (
    <div className="space-y-4 subpage-animate">
      <div>
        <h3 className="text-sm font-semibold text-[#e9edef] border-b border-[#222d34] pb-2 flex items-center gap-1.5">
          <Shield className="w-4 h-4 text-[#00a884]" />
          <span>Browser permissions</span>
        </h3>
        <p className="text-[11px] text-[#8696a0] mt-2 mb-4 leading-relaxed">
          Configure web feature permissions for each account. Disabling unused permissions prevents scripts from accessing sensitive resources.
        </p>
      </div>

      {/* Unified Account Selector Banner */}
      <div className="flex items-center justify-between p-3 bg-[#182229] border border-[#222d34] rounded-lg">
        <span className="font-semibold text-xs text-[#e9edef]">Target Account:</span>
        <select
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value)}
          className="bg-[#202c33] text-[#e9edef] px-3 py-1.5 rounded border border-[#222d34] text-[11px] outline-none focus:border-[#00a884] cursor-pointer font-medium"
        >
          {accounts.map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.emoji ? `${acc.emoji} ` : ''}{acc.name}
            </option>
          ))}
        </select>
      </div>

      {selectedAccount && (
        <div className="p-3 bg-[#182229] border border-[#222d34] rounded-lg space-y-3">
          <div className="space-y-3">
            <label className="flex items-center justify-between cursor-pointer p-1.5 rounded hover:bg-[#202c33]/40 transition-colors">
              <div>
                <div className="font-medium text-[#e9edef] text-[11px]">Push Notifications</div>
                <div className="text-[10px] text-[#8696a0] mt-0.5">Allow WhatsApp to show desktop notifications</div>
              </div>
              <input
                type="checkbox"
                checked={selectedAccount.settings?.notificationsEnabled ?? true}
                onChange={(e) => handleToggleAccountPermission('notificationsEnabled', e.target.checked)}
                className="accent-[#00a884] w-4 h-4 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer p-1.5 rounded hover:bg-[#202c33]/40 transition-colors">
              <div>
                <div className="font-medium text-[#e9edef] text-[11px]">Camera Access</div>
                <div className="text-[10px] text-[#8696a0] mt-0.5">Allow video capture for video calls</div>
              </div>
              <input
                type="checkbox"
                checked={selectedAccount.settings?.cameraEnabled ?? true}
                onChange={(e) => handleToggleAccountPermission('cameraEnabled', e.target.checked)}
                className="accent-[#00a884] w-4 h-4 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer p-1.5 rounded hover:bg-[#202c33]/40 transition-colors">
              <div>
                <div className="font-medium text-[#e9edef] text-[11px]">Microphone Access</div>
                <div className="text-[10px] text-[#8696a0] mt-0.5">Allow audio capture for voice calls</div>
              </div>
              <input
                type="checkbox"
                checked={selectedAccount.settings?.micEnabled ?? true}
                onChange={(e) => handleToggleAccountPermission('micEnabled', e.target.checked)}
                className="accent-[#00a884] w-4 h-4 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer p-1.5 rounded hover:bg-[#202c33]/40 transition-colors">
              <div>
                <div className="font-medium text-[#e9edef] text-[11px]">Geolocation Access</div>
                <div className="text-[10px] text-[#8696a0] mt-0.5">Allow sharing current location inside chats</div>
              </div>
              <input
                type="checkbox"
                checked={selectedAccount.settings?.geolocationEnabled ?? false}
                onChange={(e) => handleToggleAccountPermission('geolocationEnabled', e.target.checked)}
                className="accent-[#00a884] w-4 h-4 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer p-1.5 rounded hover:bg-[#202c33]/40 transition-colors">
              <div>
                <div className="font-medium text-[#e9edef] text-[11px]">Clipboard Access (Read)</div>
                <div className="text-[10px] text-[#8696a0] mt-0.5">Allow pages to read text and files from your system clipboard</div>
              </div>
              <input
                type="checkbox"
                checked={selectedAccount.settings?.clipboardReadEnabled ?? false}
                onChange={(e) => handleToggleAccountPermission('clipboardReadEnabled', e.target.checked)}
                className="accent-[#00a884] w-4 h-4 cursor-pointer"
              />
            </label>

            <div className="text-[10px] text-[#8696a0] italic text-center pt-2 border-t border-[#222d34]/60">
              * Toggling browser permissions reloads the account webview to apply changes.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
