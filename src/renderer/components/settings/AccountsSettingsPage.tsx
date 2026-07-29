import React from 'react';
import { User, Trash2, Database, Shield, Puzzle, Palette, Bell } from 'lucide-react';
import type { AccountInfo, GlobalSettings } from '../../../preload';

interface AccountsSettingsPageProps {
  accounts: AccountInfo[];
  setAccounts: React.Dispatch<React.SetStateAction<AccountInfo[]>>;
  globalSettings: GlobalSettings | null;
  handleToggleGlobalSetting: (key: keyof GlobalSettings, value: any) => Promise<void> | void;
  handleDeleteAccount: (id: string) => Promise<void> | void;
  setSelectedAccountId: (id: string) => void;
  setNotifAccountFilter: (filter: string) => void;
  setActivePage: (page: any) => void;
}

export const AccountsSettingsPage: React.FC<AccountsSettingsPageProps> = ({
  accounts,
  setAccounts,
  globalSettings,
  handleToggleGlobalSetting,
  handleDeleteAccount,
  setSelectedAccountId,
  setNotifAccountFilter,
  setActivePage,
}) => {
  return (
    <div className="space-y-5 subpage-animate">
      <div>
        <h3 className="text-sm font-semibold text-[#e9edef] border-b border-[#222d34] pb-2 flex items-center gap-1.5">
          <User className="w-4 h-4 text-[#00a884]" />
          <span>Manage Accounts</span>
        </h3>
        <p className="text-[11px] text-[#8696a0] mt-2 mb-4 leading-relaxed">
          Set custom names and emojis, configure startup preloading, delete accounts, or jump to profile-specific settings.
        </p>

        <div className="space-y-3 pb-4">
          {accounts.map((acc) => (
            <div key={acc.id} className="p-3 bg-[#182229] border border-[#222d34] rounded-lg space-y-3">
              {/* Row 1: Name and Emoji inputs */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-xs text-[#e9edef] block truncate">
                    {acc.emoji ? `${acc.emoji} ` : ''}{acc.name}
                  </span>
                  <span className="text-[10px] text-[#8696a0] block truncate">{acc.id}</span>
                </div>
                
                {/* Name Input */}
                <input
                  type="text"
                  value={acc.name}
                  onChange={async (e) => {
                    const newName = e.target.value;
                    setAccounts(prev => prev.map(a => a.id === acc.id ? { ...a, name: newName } : a));
                    await window.electronAPI.renameAccount(acc.id, newName);
                  }}
                  placeholder="Account Name"
                  className="bg-[#202c33] text-[#e9edef] px-2 py-1 rounded border border-[#222d34] text-[11px] outline-none focus:border-[#00a884] w-28"
                />
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-[#222d34]/60">
                <span className="text-[11px] text-[#8696a0]">Emoji:</span>
                
                {/* Emoji Input */}
                <input
                  type="text"
                  value={acc.emoji || ''}
                  onChange={async (e) => {
                    const emoji = e.target.value;
                    setAccounts(prev => prev.map(a => a.id === acc.id ? { ...a, emoji } : a));
                    await window.electronAPI.updateAccountEmoji(acc.id, emoji);
                  }}
                  placeholder="Emoji"
                  maxLength={8}
                  className="bg-[#202c33] text-[#e9edef] px-2 py-1 rounded border border-[#222d34] text-[11px] outline-none focus:border-[#00a884] w-14 text-center"
                />

                {/* Quick Emoji selection */}
                <div className="flex gap-1 overflow-x-auto no-scrollbar">
                  {['💬', '🏢', '🏠', '👥', '💼', '🔔', '🚀', '🟢', '🔵', '🔴'].map(em => (
                    <button
                      key={em}
                      onClick={async () => {
                        setAccounts(prev => prev.map(a => a.id === acc.id ? { ...a, emoji: em } : a));
                        await window.electronAPI.updateAccountEmoji(acc.id, em);
                      }}
                      className={`text-[12px] p-1 rounded hover:bg-[#202c33] transition-colors ${acc.emoji === em ? 'bg-[#202c33] border border-[#00a884]/40' : ''}`}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 2: Action Buttons */}
              <div className="flex items-center gap-1.5 pt-2 border-t border-[#222d34]/60">
                <span className="text-[10px] text-[#8696a0] mr-1">Actions:</span>
                <button
                  onClick={() => handleDeleteAccount(acc.id)}
                  disabled={accounts.length <= 1}
                  className={`p-1.5 rounded hover:bg-[#202c33] transition-colors ${
                    accounts.length <= 1 ? 'text-[#374248] cursor-not-allowed' : 'text-[#ea4335] hover:text-[#ff5c4c]'
                  }`}
                  title={accounts.length <= 1 ? "Cannot delete the last remaining account" : "Delete Account"}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    setSelectedAccountId(acc.id);
                    setActivePage('storage');
                  }}
                  className="p-1.5 rounded hover:bg-[#202c33] text-[#8696a0] hover:text-[#00a884] transition-colors"
                  title="Storage Usage"
                >
                  <Database className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    setSelectedAccountId(acc.id);
                    setActivePage('permissions');
                  }}
                  className="p-1.5 rounded hover:bg-[#202c33] text-[#8696a0] hover:text-[#00a884] transition-colors"
                  title="Browser Permissions"
                >
                  <Shield className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    setSelectedAccountId(acc.id);
                    setActivePage('extensions');
                  }}
                  className="p-1.5 rounded hover:bg-[#202c33] text-[#8696a0] hover:text-[#00a884] transition-colors"
                  title="Chrome Extensions"
                >
                  <Puzzle className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    setSelectedAccountId(acc.id);
                    setActivePage('css');
                  }}
                  className="p-1.5 rounded hover:bg-[#202c33] text-[#8696a0] hover:text-[#00a884] transition-colors"
                  title="Custom CSS / Theme"
                >
                  <Palette className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    setSelectedAccountId(acc.id);
                    setNotifAccountFilter(acc.id);
                    setActivePage('notifications');
                  }}
                  className="p-1.5 rounded hover:bg-[#202c33] text-[#8696a0] hover:text-[#00a884] transition-colors"
                  title="Notification History"
                >
                  <Bell className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Row 3: Load account on launch checkbox */}
              <div className="flex items-center justify-between pt-2 border-t border-[#222d34]/60">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={
                      globalSettings?.preloadAccountIds
                        ? globalSettings.preloadAccountIds.includes(acc.id)
                        : acc.id === 'acc_default'
                    }
                    onChange={(e) => {
                      if (!globalSettings) return;
                      const currentIds = globalSettings.preloadAccountIds || ['acc_default'];
                      const updatedIds = e.target.checked
                        ? [...currentIds, acc.id]
                        : currentIds.filter((id) => id !== acc.id);
                      handleToggleGlobalSetting('preloadAccountIds', updatedIds);
                    }}
                    className="accent-[#00a884] w-3.5 h-3.5 cursor-pointer rounded"
                  />
                  <span className="text-[11px] text-[#e9edef] font-medium">Load account on launch</span>
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
