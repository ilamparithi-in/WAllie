import React, { useState, useEffect, useRef } from 'react';
import { Palette, Type, Image as ImageIcon, Trash2, Upload, Monitor, Code, Sparkles, ChevronDown, Check, Loader2, AlertCircle, X } from 'lucide-react';
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

const cleanFamily = (font: string) => font.trim().replace(/^['"]+|['"]+$/g, '');

interface FontComboboxProps {
  label: string;
  sublabel: string;
  value: string;
  onChange: (newFont: string) => void;
  systemFonts: string[];
  placeholder?: string;
  icon: React.ElementType;
  defaultLabel: string;
}

const FontCombobox: React.FC<FontComboboxProps> = ({
  label,
  sublabel,
  value,
  onChange,
  systemFonts,
  placeholder,
  icon: Icon,
  defaultLabel,
}) => {
  const [input, setInput] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInput(value);
    setError(null);
  }, [value]);

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

    // If empty or default
    if (!target) {
      setInput('');
      onChange('');
      setIsOpen(false);
      return;
    }

    // 1. Check if it's already an installed system font
    const systemMatch = systemFonts.find(
      (f) => f.toLowerCase() === target.toLowerCase()
    );
    if (systemMatch) {
      setInput(systemMatch);
      onChange(systemMatch);
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

    // 3. Assume Google Font and verify online
    setIsChecking(true);
    try {
      const gParam = target.replace(/\s+/g, '+');
      const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(gParam)}&display=swap`;
      const res = await fetch(url, { method: 'HEAD' });

      if (res.ok) {
        // Success: Inject link immediately for preview
        const id = `gfont-${target.replace(/\s+/g, '-').toLowerCase()}`;
        if (!document.getElementById(id)) {
          const link = document.createElement('link');
          link.id = id;
          link.rel = 'stylesheet';
          link.href = url;
          document.head.appendChild(link);
        }
        setInput(target);
        onChange(target);
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
            filteredFonts.map((font) => (
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
                  <span className="text-[9px] text-[#8696a0] bg-[#111b21] px-1.5 py-0.5 rounded border border-[#222d34] shrink-0 font-sans">
                    System
                  </span>
                </div>
                {value === font && <Check className="w-3.5 h-3.5 text-[#00a884] shrink-0" />}
              </button>
            ))
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
  // Dynamically load Google Fonts stylesheet in the settings window for preview
  useEffect(() => {
    const fonts = [cleanFamily(fontFamily), cleanFamily(monoFontFamily)].filter(Boolean);
    fonts.forEach((font) => {
      const isGeneric = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|-apple-system|Segoe UI|Arial|Helvetica|Times New Roman|Courier New)$/i.test(font);
      if (isGeneric || font.includes(',')) return;

      const id = `gfont-${font.replace(/\s+/g, '-').toLowerCase()}`;
      if (!document.getElementById(id)) {
        const link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        const gParam = font.replace(/\s+/g, '+');
        link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(gParam)}&display=swap`;
        document.head.appendChild(link);
      }
    });
  }, [fontFamily, monoFontFamily]);

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
          <span className="text-[10px] text-[#8696a0] flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-[#00a884]" />
            Unified System & Google Fonts
          </span>
        </div>

        {/* Follow Desktop System Font toggle */}
        <label className="flex items-center justify-between p-2.5 rounded bg-[#202c33] border border-[#222d34] cursor-pointer hover:bg-[#233138] transition-colors">
          <div className="flex items-center gap-2.5">
            <Monitor className="w-4 h-4 text-[#8696a0]" />
            <div>
              <div className="text-xs font-medium text-[#e9edef]">Follow System Desktop Font</div>
              <div className="text-[10px] text-[#8696a0]">Apply native desktop UI font stack to WhatsApp Web</div>
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
          <div className="space-y-4 pt-1">
            {/* Unified Primary Font Picker */}
            <FontCombobox
              label="Primary Chat Font"
              sublabel="Type to search system fonts or enter any Google Font"
              value={fontFamily}
              onChange={onUpdateFont}
              systemFonts={systemFonts}
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
                placeholder="Search system fonts or type Google Font (e.g. JetBrains Mono, Fira Code)..."
                icon={Code}
                defaultLabel="Default Monospace Font"
              />
            </div>

            {/* Authentic WhatsApp Chat Conversation Preview */}
            <div className="rounded-lg border border-[#222d34] bg-[#0b141a] p-3 space-y-2 overflow-hidden shadow-sm">
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
