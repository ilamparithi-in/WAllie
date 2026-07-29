import React from 'react';
import { Users } from 'lucide-react';
import type { AccountInfo, GlobalSettings } from '../../../preload';

interface PreloadSettingsPageProps {
  accounts: AccountInfo[];
  globalSettings: GlobalSettings | null;
  handleToggleGlobalSetting: (key: keyof GlobalSettings, value: any) => Promise<void> | void;
}

export const PreloadSettingsPage: React.FC<PreloadSettingsPageProps> = ({
  accounts,
  globalSettings,
  handleToggleGlobalSetting,
}) => {
  return (
    <div className="space-y-5 subpage-animate">
      <div>
        <h3 className="text-sm font-semibold text-[#e9edef] border-b border-[#222d34] pb-2 flex items-center gap-1.5">
          <Users className="w-4 h-4 text-[#00a884]" />
          <span>Accounts to load on launch</span>
        </h3>
        <p className="text-[11px] text-[#8696a0] mt-2 mb-4 leading-relaxed">
          Select which WhatsApp accounts should preload in the background when the application starts.
          Preloading allows you to receive instant notifications without opening each account manually.
        </p>

        {accounts.length === 0 ? (
          <div className="text-center py-6 text-[#8696a0] bg-[#182229] border border-[#222d34] rounded-lg">
            No accounts added yet.
          </div>
        ) : (
          <div className="bg-[#182229] border border-[#222d34] rounded-lg divide-y divide-[#222d34]/60">
            {accounts.map((acc) => {
              const isPreloaded = globalSettings?.preloadAccountIds
                ? globalSettings.preloadAccountIds.includes(acc.id)
                : acc.id === 'acc_default';
              return (
                <label
                  key={acc.id}
                  className="flex items-center justify-between cursor-pointer p-3 hover:bg-[#202c33]/50 transition-colors"
                >
                  <div className="flex flex-col min-w-0 pr-4">
                    <span className="font-medium text-[#e9edef] text-[12px] truncate">
                      {acc.emoji ? `${acc.emoji} ` : ''}{acc.name}
                    </span>
                    <span className="text-[10px] text-[#8696a0] truncate mt-0.5">
                      {acc.id}
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={isPreloaded}
                    onChange={(e) => {
                      if (!globalSettings) return;
                      const currentIds = globalSettings.preloadAccountIds || ['acc_default'];
                      const updatedIds = e.target.checked
                        ? [...currentIds, acc.id]
                        : currentIds.filter((id) => id !== acc.id);
                      handleToggleGlobalSetting('preloadAccountIds', updatedIds);
                    }}
                    className="accent-[#00a884] w-4 h-4 cursor-pointer"
                  />
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
