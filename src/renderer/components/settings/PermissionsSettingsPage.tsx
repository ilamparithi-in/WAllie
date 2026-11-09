import React from 'react';
import { Shield } from 'lucide-react';
import type { AccountInfo } from '../../../preload';
import { SettingsToggle, SettingsSelect } from './common';

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
  const accountOptions = accounts.map((acc) => ({
    value: acc.id,
    label: `${acc.emoji ? `${acc.emoji} ` : ''}${acc.name}`,
  }));

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
        <SettingsSelect
          value={selectedAccountId}
          onChange={(val) => setSelectedAccountId(val)}
          options={accountOptions}
          ariaLabel="Target Account"
        />
      </div>

      {selectedAccount && (
        <div className="p-3 bg-[#182229] border border-[#222d34] rounded-lg space-y-3">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4 p-1.5 rounded hover:bg-[#202c33]/40 transition-colors">
              <div className="flex-1 min-w-0 pr-2">
                <div className="font-medium text-[#e9edef] text-[11px]">Push Notifications</div>
                <div className="text-[10px] text-[#8696a0] mt-0.5">Allow WhatsApp to show desktop notifications</div>
              </div>
              <SettingsToggle
                checked={selectedAccount.settings?.notificationsEnabled ?? true}
                onChange={(checked) => handleToggleAccountPermission('notificationsEnabled', checked)}
                ariaLabel="Toggle push notifications"
              />
            </div>

            <div className="flex items-center justify-between gap-4 p-1.5 rounded hover:bg-[#202c33]/40 transition-colors">
              <div className="flex-1 min-w-0 pr-2">
                <div className="font-medium text-[#e9edef] text-[11px]">Camera Access</div>
                <div className="text-[10px] text-[#8696a0] mt-0.5">Allow video capture for video calls</div>
              </div>
              <SettingsToggle
                checked={selectedAccount.settings?.cameraEnabled ?? true}
                onChange={(checked) => handleToggleAccountPermission('cameraEnabled', checked)}
                ariaLabel="Toggle camera access"
              />
            </div>

            <div className="flex items-center justify-between gap-4 p-1.5 rounded hover:bg-[#202c33]/40 transition-colors">
              <div className="flex-1 min-w-0 pr-2">
                <div className="font-medium text-[#e9edef] text-[11px]">Microphone Access</div>
                <div className="text-[10px] text-[#8696a0] mt-0.5">Allow audio capture for voice calls</div>
              </div>
              <SettingsToggle
                checked={selectedAccount.settings?.micEnabled ?? true}
                onChange={(checked) => handleToggleAccountPermission('micEnabled', checked)}
                ariaLabel="Toggle microphone access"
              />
            </div>

            <div className="flex items-center justify-between gap-4 p-1.5 rounded hover:bg-[#202c33]/40 transition-colors">
              <div className="flex-1 min-w-0 pr-2">
                <div className="font-medium text-[#e9edef] text-[11px]">Geolocation Access</div>
                <div className="text-[10px] text-[#8696a0] mt-0.5">Allow sharing current location inside chats</div>
              </div>
              <SettingsToggle
                checked={selectedAccount.settings?.geolocationEnabled ?? false}
                onChange={(checked) => handleToggleAccountPermission('geolocationEnabled', checked)}
                ariaLabel="Toggle geolocation access"
              />
            </div>

            <div className="flex items-center justify-between gap-4 p-1.5 rounded hover:bg-[#202c33]/40 transition-colors">
              <div className="flex-1 min-w-0 pr-2">
                <div className="font-medium text-[#e9edef] text-[11px]">Clipboard Access (Read)</div>
                <div className="text-[10px] text-[#8696a0] mt-0.5">Allow pages to read text and files from your system clipboard</div>
              </div>
              <SettingsToggle
                checked={selectedAccount.settings?.clipboardReadEnabled ?? false}
                onChange={(checked) => handleToggleAccountPermission('clipboardReadEnabled', checked)}
                ariaLabel="Toggle clipboard access"
              />
            </div>

            <div className="text-[10px] text-[#8696a0] italic text-center pt-2 border-t border-[#222d34]/60">
              * Toggling browser permissions reloads the account webview to apply changes.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
