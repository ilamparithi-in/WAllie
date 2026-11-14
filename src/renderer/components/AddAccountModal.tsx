import React, { useState, useEffect, useRef } from 'react';
import { X, UserPlus, Check } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { AccountInfo, AddAccountOptions } from '../../preload';

const QUICK_EMOJIS = ['💬', '🏢', '🏠', '👥', '💼', '🔔', '🚀', '🟢', '🔵', '🔴'];

export function computeNextDefaultAccountName(accounts: AccountInfo[]): string {
  const existingNames = new Set(accounts.map((a) => a.name.trim().toLowerCase()));
  let idx = accounts.length + 1;
  while (existingNames.has(`account ${idx}`)) {
    idx++;
  }
  return `Account ${idx}`;
}

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (options: AddAccountOptions) => Promise<void> | void;
  accounts: AccountInfo[];
}

export const AddAccountModal: React.FC<AddAccountModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  accounts,
}) => {
  const defaultName = computeNextDefaultAccountName(accounts);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [preload, setPreload] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closingTimerRef = useRef<NodeJS.Timeout | null>(null);

  useFocusTrap(modalRef, isOpen && !isClosing);

  // Initialize values & autofocus when opening
  useEffect(() => {
    if (isOpen) {
      const nextDefault = computeNextDefaultAccountName(accounts);
      setName(nextDefault);
      setEmoji('');
      setPreload(false);
      setIsSubmitting(false);
      setIsClosing(false);

      window.electronAPI?.toggleAddAccountPrompt?.(true);

      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 60);
      return () => clearTimeout(timer);
    } else {
      window.electronAPI?.toggleAddAccountPrompt?.(false);
    }
  }, [isOpen, accounts]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (closingTimerRef.current) {
        clearTimeout(closingTimerRef.current);
      }
      window.electronAPI?.toggleAddAccountPrompt?.(false);
    };
  }, []);

  const handleClose = () => {
    if (isClosing || isSubmitting) return;
    setIsClosing(true);
    if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
    closingTimerRef.current = setTimeout(() => {
      setIsClosing(false);
      window.electronAPI?.toggleAddAccountPrompt?.(false);
      onClose();
    }, 180);
  };

  // Escape key handler
  useEffect(() => {
    if (!isOpen || isClosing) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isClosing, isSubmitting]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmedName = name.trim();
    const finalName = trimmedName || defaultName;

    setIsSubmitting(true);
    try {
      await onConfirm({
        name: finalName,
        emoji: emoji.trim(),
        preload,
      });
      handleClose();
    } catch (err) {
      console.error('Failed to create account:', err);
      setIsSubmitting(false);
    }
  };

  if (!isOpen && !isClosing) return null;

  const currentDisplayName = name.trim() || defaultName;
  const currentDisplayEmoji = emoji.trim();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-account-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          handleClose();
        }
      }}
      className={`fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm select-none font-sans p-4 ${
        isClosing ? 'win10-backdrop-exit' : 'win10-backdrop-enter'
      }`}
    >
      <div
        ref={modalRef}
        className={`bg-[#222e35] border border-[#2c3943] w-[460px] max-w-[94vw] rounded-xl shadow-2xl overflow-hidden flex flex-col p-5 select-text ${
          isClosing ? 'win10-window-exit' : 'win10-window-enter'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#2c3943]/70 select-none">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#00a884]/20 flex items-center justify-center text-[#00a884]">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h2 id="add-account-dialog-title" className="text-sm font-semibold text-[#e9edef]">
                Add WhatsApp Account
              </h2>
              <p className="text-[10px] text-[#8696a0]">
                Configure name and icon for your new WhatsApp profile
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            onMouseDown={(e) => e.preventDefault()}
            className="text-[#8696a0] hover:text-[#e9edef] transition-colors focus-visible:ring-2 focus-visible:ring-[#00a884] focus-visible:outline-none disabled:opacity-50 p-1 rounded-md hover:bg-[#202c33]"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live Preview Card */}
        <div className="p-3 bg-[#182229] border border-[#222d34] rounded-lg mb-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#202c33] border border-[#2c3943] flex items-center justify-center text-lg shadow-inner shrink-0 select-none">
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Account Name Field */}
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

          {/* Account Emoji Field */}
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

          {/* Load account on launch Checkbox */}
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

          {/* Action Footer */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#222d34]/60 select-none">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#8696a0] hover:text-[#e9edef] hover:bg-[#202c33] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-[#00a884] text-white hover:bg-[#02906f] active:bg-[#008069] transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
        </form>
      </div>
    </div>
  );
};
