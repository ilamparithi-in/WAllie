import React, { useState, useEffect, useRef } from 'react';
import { X, AlertTriangle, Users, MessageSquare, Link as LinkIcon, Maximize2 } from 'lucide-react';
import { parseProtocolUrl } from '../utils/protocolUrl';
import { WhatsAppFormattedText } from './WhatsAppFormattedText';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { AccountInfo, GroupInviteDetails } from '../../preload';

interface ProtocolPromptModalProps {
  pendingUrl: string | null;
  accounts: AccountInfo[];
  isHandlingProtocol: boolean;
  onSelectAccount: (accountId: string) => void;
  onClose: (isCancelled?: boolean) => void;
  onOpenAvatar: (url: string, title?: string) => void;
  disableEscape?: boolean;
}

export const ProtocolPromptModal: React.FC<ProtocolPromptModalProps> = ({
  pendingUrl,
  accounts,
  isHandlingProtocol,
  onSelectAccount,
  onClose,
  onOpenAvatar,
  disableEscape = false,
}) => {
  const [isClosing, setIsClosing] = useState(false);
  const closingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const [groupDetails, setGroupDetails] = useState<GroupInviteDetails | null>(null);
  const [isLoadingGroupDetails, setIsLoadingGroupDetails] = useState(false);

  const isActive = Boolean(pendingUrl && modalRef.current && !disableEscape && !isClosing);
  useFocusTrap(modalRef, isActive);

  const handleClose = (isCancelled = true) => {
    if (isClosing) return;
    setIsClosing(true);
    if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
    closingTimerRef.current = setTimeout(() => {
      setIsClosing(false);
      onClose(isCancelled);
    }, 180);
  };

  // Keyboard navigation & Escape handler
  useEffect(() => {
    if (!pendingUrl || disableEscape) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isHandlingProtocol) {
        e.preventDefault();
        handleClose(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingUrl, disableEscape, isHandlingProtocol, isClosing]);

  // Fetch group invite details if a group invite link is pending
  useEffect(() => {
    if (!pendingUrl) {
      setGroupDetails(null);
      setIsLoadingGroupDetails(false);
      return;
    }
    const parsed = parseProtocolUrl(pendingUrl);
    if (parsed.type === 'group_invite' && parsed.code) {
      setIsLoadingGroupDetails(true);
      setGroupDetails(null);
      let isCancelled = false;
      window.electronAPI?.getGroupInviteDetails?.(parsed.code)
        .then((details) => {
          if (!isCancelled) {
            setGroupDetails(details);
            setIsLoadingGroupDetails(false);
          }
        })
        .catch(() => {
          if (!isCancelled) {
            setIsLoadingGroupDetails(false);
          }
        });
      return () => {
        isCancelled = true;
      };
    } else {
      setGroupDetails(null);
      setIsLoadingGroupDetails(false);
    }
  }, [pendingUrl]);

  if (!pendingUrl && !isClosing) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="protocol-prompt-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isHandlingProtocol) {
          handleClose(true);
        }
      }}
      className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm select-text font-sans p-4 ${
        isClosing ? 'win10-backdrop-exit' : 'win10-backdrop-enter'
      }`}
    >
      <div
        ref={modalRef}
        className={`bg-[#222e35] border border-[#2c3943] w-[540px] max-w-[94vw] max-h-[90vh] rounded-xl shadow-2xl overflow-hidden flex flex-col p-6 ${
          isClosing ? 'win10-window-exit' : 'win10-window-enter'
        }`}
      >
        <div className="flex justify-between items-center mb-3">
          <h2 id="protocol-prompt-title" className="text-[#e9edef] text-sm font-semibold">
            Open WhatsApp Link
          </h2>
          <button
            onClick={() => handleClose(true)}
            disabled={isHandlingProtocol}
            onMouseDown={(e) => e.preventDefault()}
            tabIndex={-1}
            className="text-[#8696a0] hover:text-[#e9edef] transition-colors focus-visible:ring-2 focus-visible:ring-[#00a884] focus-visible:outline-none disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* High-Visibility Warning Banner About Page Reload */}
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-[#f15c6d]/10 border border-[#f15c6d]/30 text-[#f15c6d] text-xs mb-3.5 select-text">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#f15c6d]" />
          <div className="leading-relaxed">
            <span className="font-semibold text-[#f15c6d]">Page will be reloaded:</span> Opening this external link will refresh the selected WhatsApp account. Any unsaved drafts or active calls may be lost unless saved. If a confirmation prompt appears, you can choose whether to reload (without losing this link) or stay (cancel).
          </div>
        </div>

        {/* Formatted Link Preview Card */}
        {pendingUrl && (() => {
          const parsed = parseProtocolUrl(pendingUrl);
          return (
            <div className="bg-[#111b21] border border-[#2c3943] rounded-lg p-3.5 mb-3.5 text-left">
              <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-[#202c33]">
                <div className="flex items-center gap-2 min-w-0">
                  {parsed.type === 'group_invite' ? (
                    <Users className="w-4 h-4 text-[#00a884] shrink-0" />
                  ) : parsed.type === 'send_message' ? (
                    <MessageSquare className="w-4 h-4 text-[#00a884] shrink-0" />
                  ) : (
                    <LinkIcon className="w-4 h-4 text-[#8696a0] shrink-0" />
                  )}
                  <span className="text-[#e9edef] text-xs font-semibold truncate">
                    {parsed.type === 'group_invite' ? 'Join Group/Community' : parsed.title}
                  </span>
                </div>
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${
                    parsed.type === 'unknown'
                      ? 'bg-[#202c33] text-[#8696a0] border border-[#2a3942]'
                      : 'bg-[#00a884]/15 text-[#00a884] border border-[#00a884]/30'
                  }`}
                >
                  {parsed.badge}
                </span>
              </div>

              {parsed.type === 'group_invite' && (
                <div className="space-y-3">
                  {isLoadingGroupDetails && (
                    <div className="flex items-center gap-2 p-2 bg-[#202c33]/50 rounded-lg border border-[#2c3943]/60 text-xs text-[#8696a0]">
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-[#00a884] border-t-transparent animate-spin shrink-0" />
                      <span>Fetching group details...</span>
                    </div>
                  )}

                  {groupDetails?.name && (
                    <div className="flex items-center gap-3.5 p-3 bg-[#202c33] rounded-lg border border-[#2c3943]">
                      {groupDetails.iconUrl ? (
                        <div
                          onClick={() => onOpenAvatar(groupDetails.iconUrl!, groupDetails.name)}
                          className="relative group/avatar shrink-0 cursor-zoom-in rounded-full"
                          title="Click to enlarge display picture"
                        >
                          <img
                            src={groupDetails.iconUrl}
                            alt={groupDetails.name}
                            className="w-13 h-13 rounded-full object-cover border-2 border-[#2a3942] group-hover/avatar:border-[#00a884] transition-all shadow-md"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const fallback = e.currentTarget.parentElement?.nextElementSibling as HTMLElement | null;
                              if (fallback) fallback.style.display = 'flex';
                            }}
                          />
                          <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover/avatar:opacity-100 flex items-center justify-center transition-opacity text-white">
                            <Maximize2 className="w-3.5 h-3.5" />
                          </div>
                        </div>
                      ) : null}
                      <div
                        className="w-13 h-13 rounded-full bg-[#00a884]/20 border border-[#00a884]/30 items-center justify-center text-[#00a884] shrink-0"
                        style={{ display: groupDetails.iconUrl ? 'none' : 'flex' }}
                      >
                        <Users className="w-6 h-6" />
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <h3 className="text-[#e9edef] text-sm font-semibold leading-snug break-words">
                          {groupDetails.name}
                        </h3>
                        {groupDetails.description && groupDetails.description !== groupDetails.name && (
                          <p className="text-[#8696a0] text-[11px] line-clamp-2 mt-1 leading-relaxed">
                            {groupDetails.description}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-[#8696a0] text-[11px] shrink-0">Invite Code:</span>
                    <code className="text-[#00a884] bg-[#202c33] px-2 py-0.5 rounded text-[11px] font-mono border border-[#2c3943] break-all select-all">
                      {parsed.code}
                    </code>
                  </div>

                  <p className="text-[#8696a0] text-[11px] leading-relaxed">
                    Opens the group invite preview to let you join this group chat.
                  </p>
                </div>
              )}

              {parsed.type === 'send_message' && (
                <div className="space-y-2.5">
                  {parsed.phone && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-[#8696a0] text-[11px] shrink-0">Recipient:</span>
                      <span className="text-[#e9edef] text-xs font-semibold font-mono">
                        {parsed.phone.startsWith('+') ? parsed.phone : `+${parsed.phone}`}
                      </span>
                    </div>
                  )}
                  {parsed.text ? (
                    <div className="space-y-1">
                      <span className="text-[#8696a0] text-[11px] font-medium">Prefilled Message:</span>
                      <div className="bg-[#202c33] p-3 rounded-lg border border-[#2c3943] max-h-48 overflow-y-auto">
                        <WhatsAppFormattedText text={parsed.text} className="text-[#d1d7db] text-xs" />
                      </div>
                    </div>
                  ) : (
                    <p className="text-[#8696a0] text-[11px] leading-relaxed">
                      Opens a direct chat with the recipient.
                    </p>
                  )}
                </div>
              )}

              {parsed.type === 'unknown' && (
                <div className="space-y-1">
                  <span className="text-[#8696a0] text-[11px]">Requested URI:</span>
                  <div className="font-mono text-[11px] text-[#8696a0] bg-[#202c33] p-2.5 rounded border border-[#2c3943] break-all select-all max-h-28 overflow-y-auto">
                    {parsed.rawUrl}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        <p className="text-[#8696a0] text-xs leading-relaxed mb-2.5">
          Select which WhatsApp account you'd like to open this link in:
        </p>

        <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
          {accounts.map((account) => (
            <button
              key={account.id}
              onClick={() => onSelectAccount(account.id)}
              disabled={isHandlingProtocol}
              onMouseDown={(e) => e.preventDefault()}
              className={`flex items-center gap-3 p-3 bg-[#111b21] hover:bg-[#202c33] border border-[#2c3943] hover:border-[#00a884] rounded-lg text-left transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[#00a884] focus-visible:outline-none ${
                isHandlingProtocol ? 'opacity-60 cursor-wait' : ''
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-[#00a884]/10 border border-[#00a884]/20 flex items-center justify-center text-[#00a884] font-semibold text-xs shrink-0">
                {account.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[#e9edef] text-xs font-semibold truncate">{account.name}</div>
                <div className="text-[#8696a0] text-[10px] truncate">
                  {account.loggedIn ? 'Logged in' : 'Not logged in'}
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-[#2c3943]">
          <span className="text-[10px] text-[#8696a0] truncate">
            Default account can be set in Settings &gt; Manage Accounts
          </span>
          <button
            onClick={() => handleClose(true)}
            disabled={isHandlingProtocol}
            onMouseDown={(e) => e.preventDefault()}
            className="px-4 py-2 text-xs font-semibold text-[#8696a0] hover:text-[#e9edef] transition-colors focus-visible:ring-2 focus-visible:ring-[#00a884] focus-visible:outline-none disabled:opacity-50 shrink-0"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
