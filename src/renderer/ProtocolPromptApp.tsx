import React, { useState, useEffect } from 'react';
import { AlertTriangle, Users, MessageSquare, Link as LinkIcon, Maximize2, X } from 'lucide-react';
import { useTheme } from './hooks/useTheme';
import { parseProtocolUrl } from './utils/protocolUrl';
import { WhatsAppFormattedText } from './components/WhatsAppFormattedText';
import type { AccountInfo, GroupInviteDetails } from '../preload';

export const ProtocolPromptApp: React.FC = () => {
  useTheme();

  const params = new URLSearchParams(window.location.search);
  const [pendingUrl, setPendingUrl] = useState<string | null>(params.get('url') || null);
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [isHandlingProtocol, setIsHandlingProtocol] = useState(false);
  const [groupDetails, setGroupDetails] = useState<GroupInviteDetails | null>(null);
  const [isLoadingGroupDetails, setIsLoadingGroupDetails] = useState(false);

  useEffect(() => {
    window.electronAPI?.getAccounts?.().then((accs) => {
      setAccounts(accs || []);
    }).catch(console.error);
  }, []);

  // Listen for url updates if opened again with different url
  useEffect(() => {
    const unsub = (window as any).electronAPI?.onProtocolPendingUrl?.((url: string) => {
      setPendingUrl(url);
    });
    return () => unsub?.();
  }, []);

  // Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isHandlingProtocol) {
        e.preventDefault();
        window.electronAPI?.closeWindow?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isHandlingProtocol]);

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

  const handleSelectAccount = async (accountId: string) => {
    if (!pendingUrl || isHandlingProtocol) return;
    setIsHandlingProtocol(true);
    try {
      await window.electronAPI?.handleProtocolUrl?.(accountId, pendingUrl);
      window.electronAPI?.closeWindow?.();
    } catch (err) {
      console.error('Failed to handle protocol URL:', err);
      setIsHandlingProtocol(false);
    }
  };

  const handleOpenAvatar = (url: string, title?: string) => {
    window.electronAPI?.openAvatarZoomWindow?.(url, title);
  };

  const parsed = pendingUrl ? parseProtocolUrl(pendingUrl) : null;

  return (
    <div className="h-screen w-screen flex flex-col bg-[#111b21] p-5 select-text overflow-hidden font-sans justify-between">
      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        {/* Header */}
        <div className="flex justify-between items-center mb-3 pb-2 border-b border-[#2c3943]">
          <h2 className="text-[#e9edef] text-sm font-semibold">
            Open WhatsApp Link
          </h2>
          <button
            onClick={() => window.electronAPI?.closeWindow?.()}
            disabled={isHandlingProtocol}
            className="text-[#8696a0] hover:text-[#e9edef] transition-colors p-1 rounded-md hover:bg-[#202c33]"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Warning Banner */}
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-[#f15c6d]/10 border border-[#f15c6d]/30 text-[#f15c6d] text-xs mb-3.5 select-text">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#f15c6d]" />
          <div className="leading-relaxed">
            <span className="font-semibold text-[#f15c6d]">Page will be reloaded:</span> Opening this external link will refresh the selected WhatsApp account. Any unsaved drafts or active calls may be lost unless saved.
          </div>
        </div>

        {/* Formatted Link Preview Card */}
        {parsed && (
          <div className="bg-[#182229] border border-[#2c3943] rounded-lg p-3.5 mb-3.5 text-left space-y-2.5">
            <div className="flex items-center justify-between gap-2 border-b border-[#202c33] pb-2">
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
                        onClick={() => handleOpenAvatar(groupDetails.iconUrl!, groupDetails.name)}
                        className="relative group/avatar shrink-0 cursor-zoom-in rounded-full"
                        title="Click to enlarge display picture"
                      >
                        <img
                          src={groupDetails.iconUrl}
                          alt={groupDetails.name}
                          className="w-12 h-12 rounded-full object-cover border-2 border-[#2a3942] group-hover/avatar:border-[#00a884] transition-all shadow-md"
                        />
                        <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover/avatar:opacity-100 flex items-center justify-center transition-opacity text-white">
                          <Maximize2 className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-[#00a884]/20 border border-[#00a884]/30 flex items-center justify-center text-[#00a884] shrink-0">
                        <Users className="w-6 h-6" />
                      </div>
                    )}
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
                {parsed.text && (
                  <div className="space-y-1">
                    <span className="text-[#8696a0] text-[11px] font-medium">Prefilled Message:</span>
                    <div className="bg-[#202c33] p-3 rounded-lg border border-[#2c3943] max-h-36 overflow-y-auto">
                      <WhatsAppFormattedText text={parsed.text} className="text-[#d1d7db] text-xs" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {parsed.type === 'unknown' && (
              <div className="space-y-1">
                <span className="text-[#8696a0] text-[11px]">Requested URI:</span>
                <div className="font-mono text-[11px] text-[#8696a0] bg-[#202c33] p-2.5 rounded border border-[#2c3943] break-all select-all max-h-24 overflow-y-auto">
                  {parsed.rawUrl}
                </div>
              </div>
            )}
          </div>
        )}

        <p className="text-[#8696a0] text-xs leading-relaxed mb-2">
          Select which WhatsApp account to open this link in:
        </p>

        <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto pr-1">
          {accounts.map((account) => (
            <button
              key={account.id}
              onClick={() => handleSelectAccount(account.id)}
              disabled={isHandlingProtocol}
              className={`flex items-center gap-3 p-3 bg-[#182229] hover:bg-[#202c33] border border-[#2c3943] hover:border-[#00a884] rounded-lg text-left transition-all ${
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
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 pt-3 border-t border-[#2c3943] mt-3 shrink-0">
        <span className="text-[10px] text-[#8696a0] truncate">
          Default account can be set in Settings &gt; Manage Accounts
        </span>
        <button
          onClick={() => window.electronAPI?.closeWindow?.()}
          disabled={isHandlingProtocol}
          className="px-4 py-2 text-xs font-semibold text-[#8696a0] hover:text-[#e9edef] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
