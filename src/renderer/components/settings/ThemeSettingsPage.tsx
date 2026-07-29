import React from 'react';
import { Palette } from 'lucide-react';
import type { AccountInfo } from '../../../preload';

interface ThemeSettingsPageProps {
  accounts: AccountInfo[];
  selectedAccountId: string;
  setSelectedAccountId: (id: string) => void;
  selectedAccount: AccountInfo | undefined;
  handleSelectPresetTheme: (themeName: string) => Promise<void> | void;
  customCss: string;
  handleCssChange: (newCss: string) => void;
}

export const ThemeSettingsPage: React.FC<ThemeSettingsPageProps> = ({
  accounts,
  selectedAccountId,
  setSelectedAccountId,
  selectedAccount,
  handleSelectPresetTheme,
  customCss,
  handleCssChange,
}) => {
  return (
    <div className="flex flex-col h-full space-y-4 subpage-animate">
      <div className="flex-shrink-0">
        <h3 className="text-sm font-semibold text-[#e9edef] border-b border-[#222d34] pb-2 flex items-center gap-1.5">
          <Palette className="w-4 h-4 text-[#00a884]" />
          <span>Custom CSS & Themes</span>
        </h3>
        <p className="text-[11px] text-[#8696a0] mt-2 mb-3 leading-relaxed">
          Inject custom stylesheets or select preset themes to customize the appearance of each account.
        </p>
      </div>

      {/* Unified Account Selector Banner */}
      <div className="flex items-center justify-between p-3 bg-[#182229] border border-[#222d34] rounded-lg mb-4 flex-shrink-0">
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

      <div className="flex-shrink-0 space-y-2">
        <div className="text-[11px] font-semibold text-[#e9edef]">Preset Themes</div>
        <div className="flex gap-2">
          <button
            onClick={() => handleSelectPresetTheme('none')}
            className={`px-3 py-1.5 rounded text-[10px] font-semibold transition-colors border ${
              selectedAccount?.settings?.selectedTheme === 'none' || !selectedAccount?.settings?.selectedTheme
                ? 'bg-[#00a884] text-[#111b21] border-[#00a884]'
                : 'bg-[#202c33] text-[#aebac1] border-[#222d34] hover:bg-[#2a3942]'
            }`}
          >
            Default Theme
          </button>
          <button
            onClick={() => handleSelectPresetTheme('oled')}
            className={`px-3 py-1.5 rounded text-[10px] font-semibold transition-colors border ${
              selectedAccount?.settings?.selectedTheme === 'oled'
                ? 'bg-[#00a884] text-[#111b21] border-[#00a884]'
                : 'bg-[#202c33] text-[#aebac1] border-[#222d34] hover:bg-[#2a3942]'
            }`}
          >
            OLED Dark
          </button>
          <button
            onClick={() => handleSelectPresetTheme('compact')}
            className={`px-3 py-1.5 rounded text-[10px] font-semibold transition-colors border ${
              selectedAccount?.settings?.selectedTheme === 'compact'
                ? 'bg-[#00a884] text-[#111b21] border-[#00a884]'
                : 'bg-[#202c33] text-[#aebac1] border-[#222d34] hover:bg-[#2a3942]'
            }`}
          >
            Compact UI
          </button>
        </div>
      </div>

      <div className="flex-grow flex flex-col min-h-0 pt-2 pb-4">
        <div className="text-[11px] font-semibold text-[#e9edef] mb-1.5 flex items-center justify-between">
          <span>Live Stylesheet Editor</span>
          <span className="text-[9px] text-[#8696a0] font-normal italic">Changes inject instantly</span>
        </div>
        <textarea
          value={customCss}
          onChange={(e) => handleCssChange(e.target.value)}
          placeholder="/* Type custom CSS overrides here. e.g. body { filter: invert(1); } */"
          className="flex-grow w-full bg-[#182229] text-[#e9edef] p-3 rounded border border-[#222d34] font-mono text-[11px] resize-none outline-none focus:border-[#00a884] placeholder-[#667781] leading-relaxed"
        />
      </div>
    </div>
  );
};
