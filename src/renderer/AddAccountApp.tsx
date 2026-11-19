import React, { useState, useEffect, useRef } from 'react';
import { UserPlus, Check, X } from 'lucide-react';
import { useTheme } from './hooks/useTheme';
import { computeNextDefaultAccountName } from './components/AddAccountModal';
import type { AccountInfo } from '../preload';

const QUICK_EMOJIS = ['💬', '🏢', '🏠', '👥', '💼', '🔔', '🚀', '🟢', '🔵', '🔴'];

export const AddAccountApp: React.FC = () => {
  useTheme();

  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [preload, setPreload] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.electronAPI?.getAccounts?.().then((accs) => {
      setAccounts(accs || []);
      const nextDefault = computeNextDefaultAccountName(accs || []);
      setName(nextDefault);
    }).catch(console.error);

    const timer = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, 80);
    return () => clearTimeout(timer);
  }, []);

  // Escape key to close window
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        e.preventDefault();
        window.electronAPI?.closeWindow?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSubmitting]);

  const defaultName = computeNextDefaultAccountName(accounts);
  const currentDisplayName = name.trim() || defaultName;
  const currentDisplayEmoji = emoji.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmedName = name.trim();
    const finalName = trimmedName || defaultName;

    setIsSubmitting(true);
    try {
      await window.electronAPI?.addAccount({
        name: finalName,
        emoji: emoji.trim(),
        preload,
      });
      window.electronAPI?.closeWindow?.();
    } catch (err) {
      console.error('Failed to create account:', err);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#111b21] p-5 select-text overflow-y-auto font-sans justify-between">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#2c3943]/70 select-none">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#00a884]/20 flex items-center justify-center text-[#00a884] shrink-0">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#e9edef]">
                Add WhatsApp Account
              </h2>
              <p className="text-[10px] text-[#8696a0]">
                Configure name and icon for your new WhatsApp profile
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => window.electronAPI?.closeWindow?.()}
            disabled={isSubmitting}
            className="text-[#8696a0] hover:text-[#e9edef] transition-colors p-1.5 rounded-lg hover:bg-[#202c33]"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live Preview Card */}
        <div className="p-3 bg-[#182229] border border-[#222d34] rounded-lg mb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#202c33] border border-[#2c3943] flex items-center justify-center text-xl shadow-inner shrink-0 select-none">
            {currentDisplayEmoji || '💬'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs text-[#e9edef] truncate">
                {currentDisplayEmoji ? `${currentDisplayEmoji} ` : ''}
                {currentDisplayName}
              </span>
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-[#00a884]/20 text-[#00a884] border border-[#00a884]/30 select-none shrink-0">
                New Profile
              </span>
            </div>
            <span className="text-[10px] text-[#8696a0] block truncate mt-0.5">
              Isolated session, cookies, and chat cache
            </span>
          </div>
        </div>

        {/* Form Fields */}
        <form id="add-account-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="add-account-name-input"
              className="text-xs font-semibold text-[#e9edef] flex items-center justify-between"
            >
              <span>Account Name</span>
              <span className="text-[10px] font-normal text-[#8696a0]">
                e.g., Personal, Work, Family
              </span>
            </label>
            <input
              id="add-account-name-input"
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={defaultName}
              maxLength={100}
              disabled={isSubmitting}
              className="w-full bg-[#202c33] text-[#e9edef] px-3 py-2 rounded-lg border border-[#2c3943] text-xs outline-none focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884] transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="add-account-emoji-input" className="text-xs font-semibold text-[#e9edef]">
                Account Emoji / Icon
              </label>
              {emoji && (
                <button
                  type="button"
                  onClick={() => setEmoji('')}
                  disabled={isSubmitting}
                  className="text-[10px] text-[#8696a0] hover:text-[#e9edef] transition-colors underline"
                >
                  Clear Emoji
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                id="add-account-emoji-input"
                type="text"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                placeholder="Emoji"
                maxLength={8}
                disabled={isSubmitting}
                className="bg-[#202c33] text-[#e9edef] px-2 py-1.5 rounded-lg border border-[#2c3943] text-xs outline-none focus:border-[#00a884] w-14 text-center shrink-0"
              />
              <div className="flex gap-1 overflow-x-auto no-scrollbar py-0.5">
                {QUICK_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setEmoji(emoji === em ? '' : em)}
                    disabled={isSubmitting}
                    className={`text-sm p-1.5 rounded-md hover:bg-[#202c33] transition-colors ${
                      emoji === em
                        ? 'bg-[#202c33] border border-[#00a884]/60'
                        : 'border border-transparent'
                    }`}
                    title={`Select ${em}`}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-[#222d34]/60">
            <label className="flex items-start gap-2.5 p-3 rounded-lg bg-[#182229] border border-[#222d34] cursor-pointer select-none hover:border-[#00a884]/40 transition-colors">
              <input
                type="checkbox"
                checked={preload}
                onChange={(e) => setPreload(e.target.checked)}
                disabled={isSubmitting}
                className="accent-[#00a884] w-4 h-4 cursor-pointer rounded mt-0.5 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <span className="text-xs text-[#e9edef] font-medium block">
                  Load account on launch
                </span>
                <span className="text-[10px] text-[#8696a0] block mt-0.5 leading-relaxed">
                  Start loading this account in the background when WAllie opens so it is ready immediately.
                </span>
              </div>
            </label>
          </div>
        </form>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#222d34]/60 select-none mt-4">
        <button
          type="button"
          onClick={() => window.electronAPI?.closeWindow?.()}
          disabled={isSubmitting}
          className="px-4 py-2 rounded-lg text-xs font-medium text-[#8696a0] hover:text-[#e9edef] hover:bg-[#202c33] transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          form="add-account-form"
          disabled={isSubmitting}
          className="px-5 py-2 rounded-lg text-xs font-medium bg-[#00a884] text-white hover:bg-[#02906f] active:bg-[#008069] transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
              <span>Creating...</span>
            </>
          ) : (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Create Account</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
