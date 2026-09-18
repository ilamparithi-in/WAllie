import React, { useState, useEffect } from 'react';
import { Palette, Type, Image as ImageIcon, Trash2, Upload, Monitor, Code, Sparkles } from 'lucide-react';
import type { AccountInfo } from '../../../preload';

interface ThemeSettingsPageProps {
  accounts: AccountInfo[];
  selectedAccountId: string;
  setSelectedAccountId: (id: string) => void;
  selectedAccount: AccountInfo | undefined;
  handleSelectPresetTheme: (themeName: string) => Promise<void> | void;
  customCss: string;
  handleCssChange: (newCss: string) => void;
  fontFamily: string;
  monoFontFamily: string;
  followSystemFont: boolean;
  customWallpaper: string;
  systemFonts: string[];
  onUpdateFont: (font: string) => void;
  onUpdateMonoFont: (monoFont: string) => void;
  onToggleFollowSystemFont: (enabled: boolean) => void;
  onSelectWallpaper: () => Promise<void>;
  onClearWallpaper: () => void;
  onImportCustomCss: () => Promise<void>;
  onClearCustomCss: () => void;
}

const POPULAR_BODY_FONTS = [
  { label: 'Default', value: '' },
  { label: 'Inter', value: 'Inter' },
  { label: 'Roboto', value: 'Roboto' },
  { label: 'Poppins', value: 'Poppins' },
  { label: 'Outfit', value: 'Outfit' },
  { label: 'Ubuntu', value: 'Ubuntu' },
  { label: 'Cantarell', value: 'Cantarell' },
  { label: 'Open Sans', value: 'Open Sans' },
];

const POPULAR_MONO_FONTS = [
  { label: 'Default', value: '' },
  { label: 'JetBrains Mono', value: 'JetBrains Mono' },
  { label: 'Fira Code', value: 'Fira Code' },
  { label: 'Source Code Pro', value: 'Source Code Pro' },
  { label: 'Ubuntu Mono', value: 'Ubuntu Mono' },
];

export const ThemeSettingsPage: React.FC<ThemeSettingsPageProps> = ({
  accounts,
  selectedAccountId,
  setSelectedAccountId,
  selectedAccount,
  handleSelectPresetTheme,
  customCss,
  handleCssChange,
  fontFamily,
  monoFontFamily,
  followSystemFont,
  customWallpaper,
  systemFonts,
  onUpdateFont,
  onUpdateMonoFont,
  onToggleFollowSystemFont,
  onSelectWallpaper,
  onClearWallpaper,
  onImportCustomCss,
  onClearCustomCss,
}) => {
  const [customFontInput, setCustomFontInput] = useState(fontFamily);
  const [customMonoInput, setCustomMonoInput] = useState(monoFontFamily);

  useEffect(() => {
    setCustomFontInput(fontFamily);
  }, [fontFamily]);

  useEffect(() => {
    setCustomMonoInput(monoFontFamily);
  }, [monoFontFamily]);

  // Dynamically load Google Font in preview if needed
  useEffect(() => {
    const fontsToLoad = [fontFamily, monoFontFamily].filter(Boolean);
    fontsToLoad.forEach((font) => {
      const id = `gfont-${font.replace(/\s+/g, '-').toLowerCase()}`;
      if (!document.getElementById(id)) {
        const link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:ital,wght@0,400..700;1,400..700&display=swap`;
        document.head.appendChild(link);
      }
    });
  }, [fontFamily, monoFontFamily]);

  return (
    <div className="flex flex-col h-full space-y-4 subpage-animate overflow-y-auto pr-1">
      {/* Header */}
      <div className="flex-shrink-0">
        <h3 className="text-sm font-semibold text-[#e9edef] border-b border-[#222d34] pb-2 flex items-center gap-1.5">
          <Palette className="w-4 h-4 text-[#00a884]" />
          <span>Appearance, Fonts & Wallpaper</span>
        </h3>
        <p className="text-[11px] text-[#8696a0] mt-2 leading-relaxed">
          Customize chat typography, wallpapers, and stylesheets per account with instant live application.
        </p>
      </div>

      {/* Target Account Selector Banner */}
      <div className="flex items-center justify-between p-3 bg-[#182229] border border-[#222d34] rounded-lg flex-shrink-0">
        <div>
          <span className="font-semibold text-xs text-[#e9edef] block">Target Account</span>
          <span className="text-[10px] text-[#8696a0]">Settings below apply exclusively to this account</span>
        </div>
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

      {/* Font Customization Section */}
      <div className="p-3 bg-[#182229] border border-[#222d34] rounded-lg space-y-3 flex-shrink-0">
        <div className="flex items-center justify-between border-b border-[#222d34] pb-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#e9edef]">
            <Type className="w-3.5 h-3.5 text-[#00a884]" />
            <span>Chat Typography</span>
          </div>
          <span className="text-[10px] text-[#8696a0] flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-[#00a884]" />
            Google Fonts & System Fonts supported
          </span>
        </div>

        {/* Follow Desktop System Font toggle */}
        <label className="flex items-center justify-between p-2 rounded bg-[#202c33] border border-[#222d34] cursor-pointer hover:bg-[#233138] transition-colors">
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4 text-[#8696a0]" />
            <div>
              <div className="text-xs font-medium text-[#e9edef]">Follow System Desktop Font</div>
              <div className="text-[10px] text-[#8696a0]">Apply native Linux desktop font stack to WhatsApp Web</div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={followSystemFont}
            onChange={(e) => onToggleFollowSystemFont(e.target.checked)}
            className="w-4 h-4 accent-[#00a884] cursor-pointer rounded"
          />
        </label>

        {!followSystemFont && (
          <div className="space-y-3 pt-1">
            {/* Primary Font */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-[#e9edef]">Primary Chat Font</span>
                <span className="text-[#8696a0] text-[10px]">
                  {fontFamily ? `Current: ${fontFamily}` : 'WhatsApp Default'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {POPULAR_BODY_FONTS.map((font) => (
                  <button
                    key={font.label}
                    onClick={() => onUpdateFont(font.value)}
                    className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors border ${
                      (font.value === '' && !fontFamily) || fontFamily === font.value
                        ? 'bg-[#00a884] text-[#111b21] border-[#00a884] font-semibold'
                        : 'bg-[#202c33] text-[#aebac1] border-[#222d34] hover:bg-[#2a3942]'
                    }`}
                  >
                    {font.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 items-center pt-1">
                <input
                  type="text"
                  value={customFontInput}
                  onChange={(e) => setCustomFontInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onUpdateFont(customFontInput.trim());
                  }}
                  placeholder="Type any Google Font or system font (e.g. Poppins, Outfit, Cantarell)..."
                  className="flex-grow bg-[#202c33] text-[#e9edef] px-2.5 py-1.5 rounded border border-[#222d34] text-[11px] outline-none focus:border-[#00a884] placeholder-[#667781]"
                />
                <button
                  onClick={() => onUpdateFont(customFontInput.trim())}
                  className="px-3 py-1.5 bg-[#202c33] hover:bg-[#2a3942] text-[#e9edef] border border-[#222d34] rounded text-[11px] font-medium transition-colors"
                >
                  Apply
                </button>
              </div>

              {systemFonts && systemFonts.length > 0 && (
                <div className="pt-1 flex items-center gap-2">
                  <span className="text-[10px] text-[#8696a0]">Or choose from installed system fonts:</span>
                  <select
                    value={systemFonts.includes(fontFamily) ? fontFamily : ''}
                    onChange={(e) => onUpdateFont(e.target.value)}
                    className="bg-[#202c33] text-[#e9edef] px-2 py-1 rounded border border-[#222d34] text-[10px] outline-none focus:border-[#00a884] cursor-pointer max-w-[200px]"
                  >
                    <option value="">Select system font...</option>
                    {systemFonts.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Monospace Code Font */}
            <div className="space-y-1.5 pt-2 border-t border-[#222d34]">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-[#e9edef] flex items-center gap-1">
                  <Code className="w-3 h-3 text-[#00a884]" />
                  Monospace Font (Code blocks in messages)
                </span>
                <span className="text-[#8696a0] text-[10px]">
                  {monoFontFamily ? `Current: ${monoFontFamily}` : 'Default Monospace'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {POPULAR_MONO_FONTS.map((mono) => (
                  <button
                    key={mono.label}
                    onClick={() => onUpdateMonoFont(mono.value)}
                    className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors border ${
                      (mono.value === '' && !monoFontFamily) || monoFontFamily === mono.value
                        ? 'bg-[#00a884] text-[#111b21] border-[#00a884] font-semibold'
                        : 'bg-[#202c33] text-[#aebac1] border-[#222d34] hover:bg-[#2a3942]'
                    }`}
                  >
                    {mono.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 items-center pt-1">
                <input
                  type="text"
                  value={customMonoInput}
                  onChange={(e) => setCustomMonoInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onUpdateMonoFont(customMonoInput.trim());
                  }}
                  placeholder="Type any monospace font (e.g. Fira Code, JetBrains Mono)..."
                  className="flex-grow bg-[#202c33] text-[#e9edef] px-2.5 py-1.5 rounded border border-[#222d34] text-[11px] outline-none focus:border-[#00a884] placeholder-[#667781]"
                />
                <button
                  onClick={() => onUpdateMonoFont(customMonoInput.trim())}
                  className="px-3 py-1.5 bg-[#202c33] hover:bg-[#2a3942] text-[#e9edef] border border-[#222d34] rounded text-[11px] font-medium transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>

            {/* Typography Live Preview Card */}
            <div className="p-3 bg-[#111b21] border border-[#222d34] rounded-lg space-y-1.5">
              <div className="text-[10px] text-[#8696a0] font-semibold tracking-wider uppercase">Live Typography Preview</div>
              <div
                className="text-[13px] text-[#e9edef] leading-relaxed"
                style={{
                  fontFamily: fontFamily
                    ? `"${fontFamily}", system-ui, sans-serif`
                    : 'inherit',
                }}
              >
                Hey there! Here is how your WhatsApp messages render with the chosen font.
              </div>
              <div
                className="text-[11px] text-[#00a884] bg-[#202c33] p-2 rounded border border-[#222d34] overflow-x-auto"
                style={{
                  fontFamily: monoFontFamily
                    ? `"${monoFontFamily}", monospace`
                    : 'monospace',
                }}
              >
                <code>const message = "Formatted code block with monospace font";</code>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chat Wallpaper Section */}
      <div className="p-3 bg-[#182229] border border-[#222d34] rounded-lg space-y-3 flex-shrink-0">
        <div className="flex items-center justify-between border-b border-[#222d34] pb-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#e9edef]">
            <ImageIcon className="w-3.5 h-3.5 text-[#00a884]" />
            <span>Chat Pane Wallpaper</span>
          </div>
          <span className="text-[10px] text-[#8696a0]">Applied to active conversation (#main)</span>
        </div>

        <div className="flex items-center gap-4">
          {/* Wallpaper Thumbnail Preview */}
          <div
            className="w-28 h-20 rounded-md border border-[#222d34] bg-[#111b21] flex items-center justify-center relative overflow-hidden flex-shrink-0"
            style={{
              backgroundImage: customWallpaper ? `url("${customWallpaper}")` : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            {!customWallpaper && (
              <span className="text-[9px] text-[#8696a0] text-center px-2">No custom wallpaper (Default)</span>
            )}
            {customWallpaper && (
              <div className="absolute inset-0 bg-black/25 flex items-end p-1">
                <span className="text-[9px] text-white/90 bg-black/50 px-1 rounded font-medium">Custom</span>
              </div>
            )}
          </div>

          <div className="space-y-2 flex-grow">
            <div className="flex gap-2">
              <button
                onClick={onSelectWallpaper}
                className="px-3 py-1.5 bg-[#00a884] hover:bg-[#02906f] text-[#111b21] font-semibold rounded text-[11px] flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Choose Image...</span>
              </button>
              {customWallpaper && (
                <button
                  onClick={onClearWallpaper}
                  className="px-3 py-1.5 bg-[#202c33] hover:bg-[#ef4444]/20 hover:text-[#ef4444] text-[#aebac1] border border-[#222d34] rounded text-[11px] font-medium flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear Wallpaper</span>
                </button>
              )}
            </div>
            <p className="text-[10px] text-[#8696a0] leading-normal">
              Supports JPEG, PNG, and WebP. Images are downscaled to 1920px max JPEG at 82% quality to keep WhatsApp Web fast and lightweight.
            </p>
          </div>
        </div>
      </div>

      {/* Preset Themes Section */}
      <div className="p-3 bg-[#182229] border border-[#222d34] rounded-lg space-y-2 flex-shrink-0">
        <div className="text-xs font-semibold text-[#e9edef]">Preset Themes</div>
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

      {/* Live Custom Stylesheet Editor */}
      <div className="p-3 bg-[#182229] border border-[#222d34] rounded-lg flex flex-col space-y-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-[#e9edef] block">Custom CSS Stylesheet</span>
            <span className="text-[10px] text-[#8696a0]">Paste raw CSS overrides or import community stylesheets (e.g. Catppuccin)</span>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={onImportCustomCss}
              className="px-2.5 py-1 bg-[#202c33] hover:bg-[#2a3942] text-[#e9edef] border border-[#222d34] rounded text-[10px] font-medium flex items-center gap-1 transition-colors"
            >
              <Upload className="w-3 h-3 text-[#00a884]" />
              <span>Import .css</span>
            </button>
            {customCss && (
              <button
                onClick={onClearCustomCss}
                className="px-2.5 py-1 bg-[#202c33] hover:bg-[#ef4444]/20 hover:text-[#ef4444] text-[#aebac1] border border-[#222d34] rounded text-[10px] font-medium flex items-center gap-1 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>

        <textarea
          value={customCss}
          onChange={(e) => handleCssChange(e.target.value)}
          placeholder="/* Type or paste custom CSS rules here. Injected instantly without page reload. */"
          className="w-full h-36 bg-[#111b21] text-[#e9edef] p-3 rounded border border-[#222d34] font-mono text-[11px] resize-none outline-none focus:border-[#00a884] placeholder-[#667781] leading-relaxed"
        />
      </div>
    </div>
  );
};
