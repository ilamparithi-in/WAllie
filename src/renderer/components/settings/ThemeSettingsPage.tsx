import React, { useState, useEffect, useRef } from 'react';
import { Palette, Type, Image as ImageIcon, Trash2, Upload, Monitor, Code, ChevronDown, Check, Loader2, AlertCircle, X, Info } from 'lucide-react';
import type { AccountInfo, SystemFontInfo } from '../../../preload';
import { resolveGoogleFont, resolveGoogleFontUrl } from '../../../shared/fonts';

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
  preferGoogleFont: boolean;
  onTogglePreferGoogleFont: (enabled: boolean) => void;
  preferGoogleMonoFont: boolean;
  onTogglePreferGoogleMonoFont: (enabled: boolean) => void;
  customWallpaper: string;
  systemFonts: string[];
  systemFontsMeta: SystemFontInfo[];
  desktopFont: { name: string; isVariable: boolean };
  onUpdateFont: (font: string, fontUrl?: string) => void;
  onUpdateMonoFont: (monoFont: string, monoFontUrl?: string) => void;
  onToggleFollowSystemFont: (enabled: boolean) => void;
  onSelectWallpaper: () => Promise<void>;
  onClearWallpaper: () => void;
  onImportCustomCss: () => Promise<void>;
  onClearCustomCss: () => void;
}

const cleanFamily = (font: string) => font.trim().replace(/^['"]+|['"]+$/g, '');

interface FontComboboxProps {
  label: string;
  sublabel: string;
  value: string;
  onChange: (newFont: string, fontUrl?: string) => void;
  systemFonts: string[];
  systemFontsMeta: SystemFontInfo[];
  placeholder?: string;
  icon: React.ElementType;
  defaultLabel: string;
  preferGoogleFont?: boolean;
  onTogglePreferGoogleFont?: (enabled: boolean) => void;
}

const FontCombobox: React.FC<FontComboboxProps> = ({
  label,
  sublabel,
  value,
  onChange,
  systemFonts,
  systemFontsMeta,
  placeholder,
  icon: Icon,
  defaultLabel,
  preferGoogleFont,
  onTogglePreferGoogleFont,
}) => {
  const [input, setInput] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isResolvingGFont, setIsResolvingGFont] = useState(false);
  const [gFontStatus, setGFontStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Find system font metadata for currently selected font
  const activeClean = cleanFamily(value);
  const matchedSystemFont = activeClean
    ? systemFontsMeta.find((f) => f.name.toLowerCase() === activeClean.toLowerCase())
    : undefined;
  const isSystemFont = Boolean(matchedSystemFont);
  const isSystemFontVariable = Boolean(matchedSystemFont?.isVariable);

  useEffect(() => {
    setInput(value);
    setError(null);
    if (preferGoogleFont && isSystemFont && !isSystemFontVariable) {
      setGFontStatus({
        success: true,
        message: 'Google Fonts version active.',
      });
    } else {
      setGFontStatus(null);
    }
  }, [value, preferGoogleFont, isSystemFont, isSystemFontVariable]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const trimmedInput = input.trim();
  const filteredFonts = trimmedInput
    ? systemFonts.filter((f) => f.toLowerCase().includes(trimmedInput.toLowerCase())).slice(0, 30)
    : systemFonts.slice(0, 30);

  const handleApply = async (rawFont: string) => {
    const target = cleanFamily(rawFont);
    setError(null);
    setGFontStatus(null);

    // If empty or default
    if (!target) {
      setInput('');
      onChange('');
      setIsOpen(false);
      return;
    }

    // 1. Check if it's already an installed system font
    const systemMatch = systemFontsMeta.find(
      (f) => f.name.toLowerCase() === target.toLowerCase()
    );
    if (systemMatch) {
      setInput(systemMatch.name);
      if (preferGoogleFont) {
        setIsChecking(true);
        try {
          const res = await resolveGoogleFont(systemMatch.name);
          if (res) {
            onChange(systemMatch.name, res.url);
          } else {
            onChange(systemMatch.name, '');
          }
        } finally {
          setIsChecking(false);
        }
      } else {
        onChange(systemMatch.name, '');
      }
      setIsOpen(false);
      return;
    }

    // 2. Generic web fallback fonts
    if (/^(serif|sans-serif|monospace|cursive|fantasy|system-ui|-apple-system)$/i.test(target)) {
      setInput(target);
      onChange(target);
      setIsOpen(false);
      return;
    }

    // 3. Assume Google Font and verify online with variable font range
    setIsChecking(true);
    try {
      const res = await resolveGoogleFont(target);
      if (res) {
        const id = `gfont-${target.replace(/\s+/g, '-').toLowerCase()}`;
        let link = document.getElementById(id) as HTMLLinkElement | null;
        if (!link) {
          link = document.createElement('link');
          link.id = id;
          link.rel = 'stylesheet';
          document.head.appendChild(link);
        }
        link.href = res.url;
        setInput(target);
        onChange(target, res.url);
        setIsOpen(false);
      } else {
        setError(`Font "${target}" does not exist on your system or Google Fonts.`);
      }
    } catch (e) {
      setError(`Unable to check online font for "${target}". Check your internet connection.`);
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="space-y-1.5 relative" ref={containerRef}>
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-semibold text-[#e9edef] flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5 text-[#00a884]" />
          {label}
        </span>
        <span className="text-[#8696a0] text-[10px]">
          {value ? `Active: ${value}` : defaultLabel}
        </span>
      </div>

      {/* Input Group */}
      <div className="flex gap-1.5 items-center">
        <div className="relative flex-grow flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError(null);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleApply(input);
              } else if (e.key === 'Escape') {
                setIsOpen(false);
              }
            }}
            placeholder={placeholder}
            className="w-full bg-[#202c33] text-[#e9edef] pl-3 pr-8 py-2 rounded border border-[#222d34] text-xs outline-none focus:border-[#00a884] placeholder-[#667781] transition-colors"
          />

          {input && (
            <button
              type="button"
              onClick={() => {
                setInput('');
                handleApply('');
              }}
              className="absolute right-2.5 text-[#8696a0] hover:text-[#e9edef] p-0.5"
              title="Clear font"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => handleApply(input)}
          disabled={isChecking}
          className="px-3.5 py-2 bg-[#00a884] hover:bg-[#02906f] disabled:opacity-50 text-[#111b21] font-semibold rounded text-xs inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 shadow-sm"
        >
          {isChecking ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Checking...</span>
            </>
          ) : (
            <span>Apply</span>
          )}
        </button>
      </div>

      {/* Non-variable system font notice & Google Fonts replacement checkbox */}
      {isSystemFont && !isSystemFontVariable && (
        <div className="p-2.5 rounded bg-[#182229] border border-[#222d34] space-y-2 mt-1">
          {!preferGoogleFont && (
            <div className="text-[10.5px] text-[#e5a50a] flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                <strong>Note:</strong> "{value}" is not a variable-width system font. Custom weights (like WhatsApp's 545 button weight) may not render properly.
              </span>
            </div>
          )}

          <label className="flex items-center gap-2 text-xs text-[#e9edef] cursor-pointer">
            <input
              type="checkbox"
              checked={preferGoogleFont || false}
              disabled={isResolvingGFont}
              onChange={async (e) => {
                const checked = e.target.checked;
                onTogglePreferGoogleFont?.(checked);
                setGFontStatus(null);
                if (checked) {
                  setIsResolvingGFont(true);
                  try {
                    const res = await resolveGoogleFont(value);
                    if (res) {
                      onChange(value, res.url);
                      const id = `gfont-${value.replace(/\s+/g, '-').toLowerCase()}`;
                      let link = document.getElementById(id) as HTMLLinkElement | null;
                      if (!link) {
                        link = document.createElement('link');
                        link.id = id;
                        link.rel = 'stylesheet';
                        document.head.appendChild(link);
                      }
                      link.href = res.url;
                      setGFontStatus({
                        success: true,
                        message: res.isVariable
                          ? `Using variable-weight version from Google Fonts (continuous range active)!`
                          : `Loaded from Google Fonts (standard discrete weights).`,
                      });
                    } else {
                      setGFontStatus({ success: false, message: `"${value}" is not available on Google Fonts.` });
                    }
                  } catch {
                    setGFontStatus({ success: false, message: `Failed to connect to Google Fonts.` });
                  } finally {
                    setIsResolvingGFont(false);
                  }
                } else {
                  onChange(value, '');
                  setGFontStatus(null);
                }
              }}
              className="w-3.5 h-3.5 accent-[#00a884] cursor-pointer rounded"
            />
            <span className="text-[11px] text-[#c2c5d1]">
              Fetch "{value}" from Google Fonts instead {isResolvingGFont ? '(checking...)' : '(to get variable weight file if available)'}
            </span>
          </label>

          {gFontStatus && (
            <div className={`text-[10px] pl-5.5 flex items-center gap-1 ${gFontStatus.success ? 'text-[#00a884]' : 'text-[#f87171]'}`}>
              {gFontStatus.success ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
              <span>{gFontStatus.message}</span>
            </div>
          )}
        </div>
      )}

      {isSystemFont && isSystemFontVariable && (
        <div className="text-[10.5px] text-[#00a884] flex items-center gap-1.5 pt-0.5">
          <Check className="w-3 h-3 shrink-0" />
          <span>Variable-width system font detected. Custom 545 weight supported.</span>
        </div>
      )}

      {/* Error Notice */}
      {error && (
        <div className="p-2 rounded bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#f87171] text-[11px] flex items-center justify-between gap-2 animate-fadeIn">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-[#f87171] hover:text-white p-0.5"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Autocomplete Dropdown */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-[#182229] border border-[#222d34] rounded-lg shadow-2xl max-h-56 overflow-y-auto divide-y divide-[#222d34]/50">
          {/* Default Option */}
          <button
            type="button"
            onClick={() => handleApply('')}
            className="w-full text-left px-3 py-2 text-xs text-[#aebac1] hover:bg-[#202c33] flex items-center justify-between transition-colors"
          >
            <span>{defaultLabel}</span>
            {!value && <Check className="w-3.5 h-3.5 text-[#00a884]" />}
          </button>

          {/* Filtered System Fonts */}
          {filteredFonts.length > 0 ? (
            filteredFonts.map((font) => {
              const meta = systemFontsMeta.find((f) => f.name.toLowerCase() === font.toLowerCase());
              const isVar = meta?.isVariable;
              return (
                <button
                  type="button"
                  key={font}
                  onClick={() => handleApply(font)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-[#202c33] flex items-center justify-between transition-colors group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="text-[#e9edef] group-hover:text-white truncate"
                      style={{ fontFamily: `"${font}", sans-serif` }}
                    >
                      {font}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border shrink-0 font-sans ${isVar ? 'text-[#00a884] border-[#00a884]/30 bg-[#00a884]/10' : 'text-[#8696a0] border-[#222d34] bg-[#111b21]'}`}>
                      {isVar ? 'Variable' : 'System'}
                    </span>
                  </div>
                  {value === font && <Check className="w-3.5 h-3.5 text-[#00a884] shrink-0" />}
                </button>
              );
            })
          ) : (
            <div className="px-3 py-2.5 text-[11px] text-[#8696a0] bg-[#111b21]">
              <span>No local system font matches "{trimmedInput}".</span>
              <div className="text-[10px] text-[#00a884] mt-0.5">
                Press <strong>Apply</strong> to fetch it directly from Google Fonts.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

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
  preferGoogleFont,
  onTogglePreferGoogleFont,
  preferGoogleMonoFont,
  onTogglePreferGoogleMonoFont,
  customWallpaper,
  systemFonts,
  systemFontsMeta,
  desktopFont,
  onUpdateFont,
  onUpdateMonoFont,
  onToggleFollowSystemFont,
  onSelectWallpaper,
  onClearWallpaper,
  onImportCustomCss,
  onClearCustomCss,
}) => {
  const [previewWeight, setPreviewWeight] = useState<number>(545);

  // Dynamically load Google Fonts stylesheet in the settings window for preview
  useEffect(() => {
    const fonts = [
      { name: cleanFamily(fontFamily), preferGoogle: preferGoogleFont },
      { name: cleanFamily(monoFontFamily), preferGoogle: preferGoogleMonoFont },
    ].filter((f) => Boolean(f.name));

    fonts.forEach(async ({ name, preferGoogle }) => {
      const isGeneric = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|-apple-system|Segoe UI|Arial|Helvetica|Times New Roman|Courier New)$/i.test(name);
      if (isGeneric || name.includes(',')) return;

      const isSystem = systemFontsMeta.some((f) => f.name.toLowerCase() === name.toLowerCase());
      if (isSystem && !preferGoogle) return;

      const url = await resolveGoogleFontUrl(name);
      if (!url) return;

      const id = `gfont-${name.replace(/\s+/g, '-').toLowerCase()}`;
      let link = document.getElementById(id) as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        document.head.appendChild(link);
      }
      link.href = url;
    });
  }, [fontFamily, monoFontFamily, preferGoogleFont, preferGoogleMonoFont, systemFontsMeta]);

  const activeBodyFont = cleanFamily(fontFamily);
  const activeMonoFont = cleanFamily(monoFontFamily);

  return (
    <div className="flex flex-col h-full space-y-4 subpage-animate overflow-y-auto pr-1">
      {/* Header */}
      <div className="flex-shrink-0">
        <h3 className="text-sm font-semibold text-[#e9edef] border-b border-[#222d34] pb-2 flex items-center gap-1.5">
          <Palette className="w-4 h-4 text-[#00a884]" />
          <span>Appearance, Fonts & Wallpaper</span>
        </h3>
        <p className="text-[11px] text-[#8696a0] mt-2 leading-relaxed">
          Customize typography, wallpapers, and custom CSS per account.
        </p>
      </div>

      {/* Target Account Selector Banner */}
      <div className="flex items-center justify-between p-3 bg-[#182229] border border-[#222d34] rounded-lg flex-shrink-0">
        <div>
          <span className="font-semibold text-xs text-[#e9edef] block">Target Account</span>
          <span className="text-[10px] text-[#8696a0]">Settings below apply to this account</span>
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
      <div className="p-3.5 bg-[#182229] border border-[#222d34] rounded-lg space-y-3.5 flex-shrink-0">
        <div className="flex items-center justify-between border-b border-[#222d34] pb-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#e9edef]">
            <Type className="w-3.5 h-3.5 text-[#00a884]" />
            <span>Chat Typography</span>
          </div>
        </div>

        {/* Follow Desktop System Font toggle */}
        <label className="flex items-center justify-between p-2.5 rounded bg-[#202c33] border border-[#222d34] cursor-pointer hover:bg-[#233138] transition-colors">
          <div className="flex items-center gap-2.5">
            <Monitor className="w-4 h-4 text-[#8696a0]" />
            <div>
              <div className="text-xs font-medium text-[#e9edef]">Follow System Desktop Font</div>
              <div className="text-[10px] text-[#8696a0]">
                Apply native desktop UI font stack to WhatsApp Web
                {desktopFont?.name ? ` (${desktopFont.name}${desktopFont.isVariable ? ' - Variable' : ' - Static'})` : ''}
              </div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={followSystemFont}
            onChange={(e) => onToggleFollowSystemFont(e.target.checked)}
            className="w-4 h-4 accent-[#00a884] cursor-pointer rounded"
          />
        </label>

        {followSystemFont && desktopFont?.name && !desktopFont.isVariable && (
          <div className="p-2.5 rounded bg-[#182229] border border-[#222d34] text-[10.5px] text-[#e5a50a] flex items-start gap-2">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              <strong>Note:</strong> Your desktop font "{desktopFont.name}" is not a variable-width font. WhatsApp Web uses custom font weights (like 545 for buttons and tabs), which may not render at their intended intermediate weight.
            </span>
          </div>
        )}

        {followSystemFont && desktopFont?.name && desktopFont.isVariable && (
          <div className="text-[10.5px] text-[#00a884] flex items-center gap-1.5 px-1">
            <Check className="w-3.5 h-3.5 shrink-0" />
            <span>Your desktop font "{desktopFont.name}" is a variable-width font. Custom 545 weight supported.</span>
          </div>
        )}

        {!followSystemFont && (
          <div className="space-y-4 pt-1">
            {/* Unified Primary Font Picker */}
            <FontCombobox
              label="Primary Chat Font"
              sublabel="Type to search system fonts or enter any Google Font"
              value={fontFamily}
              onChange={onUpdateFont}
              systemFonts={systemFonts}
              systemFontsMeta={systemFontsMeta}
              preferGoogleFont={preferGoogleFont}
              onTogglePreferGoogleFont={onTogglePreferGoogleFont}
              placeholder="Search system fonts or type Google Font (e.g. Poppins, Outfit, Inter)..."
              icon={Type}
              defaultLabel="WhatsApp Default Font"
            />

            {/* Unified Monospace Code Font Picker */}
            <div className="pt-2 border-t border-[#222d34]">
              <FontCombobox
                label="Monospace Font (Code Blocks)"
                sublabel="Used for formatted code snippets and monospace text"
                value={monoFontFamily}
                onChange={onUpdateMonoFont}
                systemFonts={systemFonts}
                systemFontsMeta={systemFontsMeta}
                preferGoogleFont={preferGoogleMonoFont}
                onTogglePreferGoogleFont={onTogglePreferGoogleMonoFont}
                placeholder="Search system fonts or type Google Font (e.g. JetBrains Mono, Fira Code)..."
                icon={Code}
                defaultLabel="Default Monospace Font"
              />
            </div>

            {/* Authentic WhatsApp Chat Conversation Preview */}
            <div className="rounded-lg border border-[#222d34] bg-[#0b141a] p-3 space-y-2.5 overflow-hidden shadow-sm">
              <div className="flex items-center justify-between text-[11px] text-[#8696a0] pb-1 border-b border-[#182229]">
                <span className="font-medium text-[#c2c5d1]">Conversation Preview</span>
                <span className="text-[10px] text-[#8696a0] font-mono truncate max-w-[240px]">
                  {activeBodyFont || 'Default'} • {activeMonoFont || 'Default Code'}
                </span>
              </div>

              {/* Message Bubbles Container */}
              <div className="space-y-2 py-1">
                {/* Outgoing Message Bubble */}
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-lg rounded-tr-none bg-[#005c4b] px-3 py-1.5 text-[#e9edef] shadow-sm">
                    <div
                      className="text-[13px] leading-relaxed"
                      style={{
                        fontFamily: activeBodyFont
                          ? `"${activeBodyFont}", system-ui, sans-serif`
                          : 'inherit',
                      }}
                    >
                      Hey! How does the new chat typography look?
                    </div>
                    <div className="flex items-center justify-end gap-1 text-[10px] text-[#8696a0] mt-0.5">
                      <span>10:42 AM</span>
                      <span className="text-[#53bdeb] text-[11px] font-bold">✓✓</span>
                    </div>
                  </div>
                </div>

                {/* Incoming Message Bubble */}
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-lg rounded-tl-none bg-[#202c33] px-3 py-1.5 text-[#e9edef] shadow-sm space-y-1.5">
                    <div
                      className="text-[13px] leading-relaxed"
                      style={{
                        fontFamily: activeBodyFont
                          ? `"${activeBodyFont}", system-ui, sans-serif`
                          : 'inherit',
                      }}
                    >
                      Looks clean! Here is a code block test:
                    </div>

                    {/* Monospace Code Block */}
                    <div
                      className="bg-[#111b21] p-2 rounded border border-[#2a3942] text-[11.5px] text-[#00a884] overflow-x-auto leading-normal"
                      style={{
                        fontFamily: activeMonoFont
                          ? `"${activeMonoFont}", ui-monospace, monospace`
                          : 'ui-monospace, monospace',
                      }}
                    >
                      <code>const status = "Font active &amp; ready!";</code>
                    </div>

                    <div className="flex items-center justify-end text-[10px] text-[#8696a0]">
                      <span>10:43 AM</span>
                    </div>
                  </div>
                </div>

                {/* Weight Verification & Slider Bar */}
                <div className="pt-2.5 border-t border-[#182229] space-y-2 px-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="text-[#8696a0] font-medium">Weight Slider:</span>
                      <span className="font-mono text-[#00a884] font-bold bg-[#00a884]/10 px-1.5 py-0.5 rounded border border-[#00a884]/20 text-[10px]">
                        {previewWeight}
                      </span>
                    </div>
                    {/* Quick presets */}
                    <div className="flex items-center gap-1">
                      {[300, 400, 500, 545, 600, 700].map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => setPreviewWeight(w)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                            previewWeight === w
                              ? 'bg-[#00a884] text-[#111b21] font-bold'
                              : 'bg-[#202c33] text-[#8696a0] hover:text-[#e9edef] hover:bg-[#233138]'
                          }`}
                        >
                          {w}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span className="text-[10px] text-[#8696a0] font-mono">100</span>
                    <input
                      type="range"
                      min={100}
                      max={900}
                      step={1}
                      value={previewWeight}
                      onChange={(e) => setPreviewWeight(Number(e.target.value))}
                      className="flex-1 accent-[#00a884] h-1.5 bg-[#202c33] rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-[10px] text-[#8696a0] font-mono">900</span>
                  </div>

                  {/* Sample WhatsApp UI Button & Text rendered at current preview weight */}
                  <div className="flex items-center justify-between pt-1">
                    <div
                      className="text-[12px] text-[#e9edef] truncate mr-2"
                      style={{
                        fontFamily: activeBodyFont ? `"${activeBodyFont}", system-ui, sans-serif` : 'inherit',
                        fontWeight: previewWeight,
                      }}
                    >
                      Sample text at weight {previewWeight}: The quick brown fox jumps over the lazy dog.
                    </div>
                    <button
                      type="button"
                      className="px-3 py-1 rounded-full bg-[#00a884] text-[#111b21] text-[12px] shrink-0 font-medium shadow-sm transition-all"
                      style={{
                        fontFamily: activeBodyFont ? `"${activeBodyFont}", system-ui, sans-serif` : 'inherit',
                        fontWeight: previewWeight,
                      }}
                    >
                      Join community ({previewWeight})
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chat Wallpaper Section */}
      <div className="p-3.5 bg-[#182229] border border-[#222d34] rounded-lg space-y-3 flex-shrink-0">
        <div className="flex items-center justify-between border-b border-[#222d34] pb-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#e9edef]">
            <ImageIcon className="w-3.5 h-3.5 text-[#00a884]" />
            <span>Chat Pane Wallpaper</span>
          </div>
          <span className="text-[10px] text-[#8696a0]">Applied to active conversation (#main)</span>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3.5">
          {/* Wallpaper Thumbnail Preview */}
          <div
            className="w-24 h-20 rounded-md border border-[#222d34] bg-[#111b21] flex items-center justify-center relative overflow-hidden shrink-0 shadow-inner"
            style={{
              backgroundImage: customWallpaper ? `url("${customWallpaper}")` : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            {!customWallpaper ? (
              <span className="text-[9px] text-[#8696a0] text-center px-1">Default Pattern</span>
            ) : (
              <div className="absolute inset-0 bg-black/30 flex items-end p-1">
                <span className="text-[9px] text-white bg-black/60 px-1 rounded font-medium">Custom</span>
              </div>
            )}
          </div>

          <div className="space-y-2 flex-grow min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={onSelectWallpaper}
                className="px-3.5 py-1.5 bg-[#00a884] hover:bg-[#02906f] text-[#111b21] font-semibold rounded text-xs inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 shadow-sm"
              >
                <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                <span>Choose Image...</span>
              </button>
              {customWallpaper && (
                <button
                  onClick={onClearWallpaper}
                  className="px-3 py-1.5 bg-[#202c33] hover:bg-[#ef4444]/20 hover:text-[#ef4444] text-[#aebac1] border border-[#222d34] rounded text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Clear Wallpaper</span>
                </button>
              )}
            </div>
            <p className="text-[10px] text-[#8696a0] leading-normal">
              Supports JPEG, PNG, and WebP. Automatically downscaled to 1920px max JPEG at 82% quality to keep WhatsApp Web fast.
            </p>
          </div>
        </div>
      </div>

      {/* Preset Themes Section */}
      <div className="p-3.5 bg-[#182229] border border-[#222d34] rounded-lg space-y-2 flex-shrink-0">
        <div className="text-xs font-semibold text-[#e9edef]">Preset Themes</div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => handleSelectPresetTheme('none')}
            className={`px-3 py-1.5 rounded text-[10px] font-semibold transition-colors border whitespace-nowrap ${
              selectedAccount?.settings?.selectedTheme === 'none' || !selectedAccount?.settings?.selectedTheme
                ? 'bg-[#00a884] text-[#111b21] border-[#00a884]'
                : 'bg-[#202c33] text-[#aebac1] border-[#222d34] hover:bg-[#2a3942]'
            }`}
          >
            Default Theme
          </button>
          <button
            onClick={() => handleSelectPresetTheme('oled')}
            className={`px-3 py-1.5 rounded text-[10px] font-semibold transition-colors border whitespace-nowrap ${
              selectedAccount?.settings?.selectedTheme === 'oled'
                ? 'bg-[#00a884] text-[#111b21] border-[#00a884]'
                : 'bg-[#202c33] text-[#aebac1] border-[#222d34] hover:bg-[#2a3942]'
            }`}
          >
            OLED Dark
          </button>
          <button
            onClick={() => handleSelectPresetTheme('compact')}
            className={`px-3 py-1.5 rounded text-[10px] font-semibold transition-colors border whitespace-nowrap ${
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
      <div className="p-3.5 bg-[#182229] border border-[#222d34] rounded-lg flex flex-col space-y-2.5 flex-shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-xs font-semibold text-[#e9edef] block">Custom CSS Stylesheet</span>
            <span className="text-[10px] text-[#8696a0] block truncate">Paste raw CSS overrides or import community stylesheets (e.g. Catppuccin)</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
            <button
              onClick={onImportCustomCss}
              className="px-3 py-1.5 bg-[#202c33] hover:bg-[#2a3942] text-[#e9edef] border border-[#222d34] rounded text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5 text-[#00a884] shrink-0" />
              <span>Import .css</span>
            </button>
            {customCss && (
              <button
                onClick={onClearCustomCss}
                className="px-2.5 py-1.5 bg-[#202c33] hover:bg-[#ef4444]/20 hover:text-[#ef4444] text-[#aebac1] border border-[#222d34] rounded text-xs font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
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
