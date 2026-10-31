import React, { useState, useEffect } from 'react';
import {
  FolderOpen,
  Download,
  Calendar,
  Search,
  CheckSquare,
  Square,
  Users,
  MessageSquare,
  FileText,
  Clock,
  X,
  Sparkles,
} from 'lucide-react';

interface ChatItem {
  jid: string;
  title: string;
  isGroup: boolean;
  isCommunity: boolean;
  isBroadcast: boolean;
  unreadCount: number;
  timestamp: number;
  avatarUrl?: string;
}

interface ChatExporterSettingsPageProps {
  onCloseSettings: () => void;
}

export const ChatExporterSettingsPage: React.FC<ChatExporterSettingsPageProps> = ({ onCloseSettings }) => {
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedJids, setSelectedJids] = useState<Set<string>>(new Set());
  const [includeViewer, setIncludeViewer] = useState<boolean>(true);

  // Timeframe modal state
  const [isTimeframeModalOpen, setIsTimeframeModalOpen] = useState<boolean>(false);
  const [targetExportChats, setTargetExportChats] = useState<ChatItem[]>([]);
  const [exportScope, setExportScope] = useState<'all' | 'custom'>('all');
  const [customDate, setCustomDate] = useState<string>(() => {
    // Default custom date to 30 days ago
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [isStartingExport, setIsStartingExport] = useState<boolean>(false);

  useEffect(() => {
    loadChats();
  }, []);

  const loadChats = async () => {
    setIsLoadingChats(true);
    try {
      if (window.electronAPI?.getExportableChats) {
        const list = await window.electronAPI.getExportableChats();
        setChats(list || []);
      }
    } catch (err) {
      console.error('Failed to load chats for exporter:', err);
    } finally {
      setIsLoadingChats(false);
    }
  };

  const handleOpenExportedFile = async () => {
    try {
      const filePath = await window.electronAPI?.promptOpenExportFile?.();
      if (filePath) {
        await window.electronAPI?.openExportViewer?.(filePath);
      }
    } catch (err) {
      console.error('Failed to open export viewer file:', err);
    }
  };

  const handleExportCurrentChat = async () => {
    try {
      const active = await window.electronAPI?.getActiveExportChat?.();
      if (!active) {
        window.electronAPI?.showToast?.('Please open a chat in WhatsApp Web first.');
        return;
      }
      const match = chats.find((c) => c.jid === active.jid) || {
        jid: active.jid,
        title: active.title,
        isGroup: active.isGroup,
        isCommunity: false,
        isBroadcast: false,
        unreadCount: 0,
        timestamp: Date.now() / 1000,
      };
      setTargetExportChats([match]);
      setIsTimeframeModalOpen(true);
    } catch (err) {
      console.error('Failed to export current chat:', err);
    }
  };

  const handleExportSelected = () => {
    const selected = chats.filter((c) => selectedJids.has(c.jid));
    if (selected.length === 0) return;
    setTargetExportChats(selected);
    setIsTimeframeModalOpen(true);
  };

  const handleToggleSelectChat = (jid: string) => {
    setSelectedJids((prev) => {
      const next = new Set(prev);
      if (next.has(jid)) {
        next.delete(jid);
      } else {
        next.add(jid);
      }
      return next;
    });
  };

  const handleSelectAll = (filtered: ChatItem[]) => {
    setSelectedJids((prev) => {
      const next = new Set(prev);
      filtered.forEach((c) => next.add(c.jid));
      return next;
    });
  };

  const handleDeselectAll = () => {
    setSelectedJids(new Set());
  };

  const handleConfirmExport = async () => {
    if (targetExportChats.length === 0 || isStartingExport) return;
    setIsStartingExport(true);

    try {
      const defaultName =
        targetExportChats.length === 1
          ? targetExportChats[0].title.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim()
          : `WhatsApp_Exports_${new Date().toISOString().slice(0, 10)}`;

      const outputDir = await window.electronAPI?.promptExportDirectory?.(defaultName);
      if (!outputDir) {
        setIsStartingExport(false);
        return;
      }

      const timeframeIso = exportScope === 'custom' && customDate ? new Date(customDate).toISOString() : null;

      if (targetExportChats.length === 1) {
        const single = targetExportChats[0];
        await window.electronAPI?.startChatExport?.({
          accountId: '',
          chatJid: single.jid,
          chatTitle: single.title,
          outputDirectory: outputDir,
          includeViewer,
          timeframeBoundary: timeframeIso,
        });
      } else {
        await window.electronAPI?.startMultiChatExport?.({
          accountId: '',
          chats: targetExportChats.map((c) => ({
            jid: c.jid,
            title: c.title,
            isGroup: c.isGroup,
            avatarUrl: c.avatarUrl,
          })),
          outputDirectory: outputDir,
          includeViewer,
          timeframeBoundary: timeframeIso,
        });
      }

      setIsTimeframeModalOpen(false);
      onCloseSettings();
    } catch (err) {
      console.error('Failed to initiate export:', err);
      window.electronAPI?.showToast?.(`Export failed to start: ${(err as Error).message}`);
    } finally {
      setIsStartingExport(false);
    }
  };

  const filteredChats = chats.filter((c) =>
    (c.title || '').toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col space-y-5 select-text pb-6">
      {/* Top Banner Card: Built-in Viewer */}
      <div className="p-4 rounded-xl bg-[#182229] border border-[#222d34] flex flex-col gap-3">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-full bg-[#00a884]/15 border border-[#00a884]/30 flex items-center justify-center text-[#00a884] flex-shrink-0 mt-0.5">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold text-[#e9edef] text-[13px]">Built-in Chat Viewer</div>
            <div className="text-[11px] text-[#8696a0] mt-0.5 leading-relaxed">
              Open and interact with previously exported WhatsApp chats in a dedicated window with full offline media, reactions, search, and audio waveform playback.
            </div>
          </div>
        </div>
        <div className="pt-1">
          <button
            onClick={handleOpenExportedFile}
            onMouseDown={(e) => e.preventDefault()}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#202c33] hover:bg-[#2a3942] border border-[#374248] text-[#e9edef] text-xs font-semibold transition-colors cursor-pointer w-full sm:w-auto"
          >
            <FolderOpen className="w-4 h-4 text-[#00a884]" />
            <span>Open Exported File...</span>
          </button>
        </div>
      </div>

      {/* Primary Actions & Preferences */}
      <div className="p-4 rounded-xl bg-[#182229] border border-[#222d34] flex flex-col gap-4">
        <div className="flex flex-col gap-2.5 pb-3 border-b border-[#222d34]">
          <div>
            <div className="font-semibold text-[#e9edef] text-[13px]">Export Currently Open Chat</div>
            <div className="text-[11px] text-[#8696a0] mt-0.5">
              Instantly export the conversation currently open in the active WhatsApp account.
            </div>
          </div>
          <div>
            <button
              onClick={handleExportCurrentChat}
              onMouseDown={(e) => e.preventDefault()}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#00a884] hover:bg-[#00c298] text-[#111b21] text-xs font-bold transition-all shadow-md cursor-pointer w-full sm:w-auto"
            >
              <Download className="w-4 h-4" />
              <span>Export Currently Open Chat</span>
            </button>
          </div>
        </div>

        {/* Include Viewer Checkbox */}
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeViewer}
            onChange={(e) => setIncludeViewer(e.target.checked)}
            className="w-4 h-4 rounded bg-[#111b21] border-[#222d34] text-[#00a884] focus:ring-[#00a884] cursor-pointer"
          />
          <div className="flex flex-col">
            <span className="text-xs font-medium text-[#e9edef]">
              Include offline HTML viewer in export (Recommended)
            </span>
            <span className="text-[10px] text-[#8696a0]">
              Drops a self-contained <code className="text-[#00a884]">&lt;ChatName&gt;.html</code> file alongside the JSON export that renders pixel-perfect without WAllie.
            </span>
          </div>
        </label>
      </div>

      {/* Multi-Chat Selection Section */}
      <div className="p-4 rounded-xl bg-[#182229] border border-[#222d34] flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="font-semibold text-[#e9edef] text-[13px]">Select Multiple Chats to Export</div>
            <div className="text-[11px] text-[#8696a0] mt-0.5">
              Choose one or more chats to export sequentially under a single timeframe prompt.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSelectAll(filteredChats)}
              className="text-[11px] text-[#00a884] hover:underline cursor-pointer bg-transparent border-none p-0"
            >
              Select All
            </button>
            <span className="text-[#374248]">•</span>
            <button
              onClick={handleDeselectAll}
              className="text-[11px] text-[#8696a0] hover:underline cursor-pointer bg-transparent border-none p-0"
            >
              Deselect All
            </button>
          </div>
        </div>

        {/* Search Input Bar */}
        <div className="relative mt-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8696a0]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats by name..."
            className="w-full bg-[#111b21] border border-[#222d34] rounded-lg pl-9 pr-8 py-2 text-xs text-[#e9edef] placeholder-[#8696a0] outline-none focus:border-[#00a884] transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8696a0] hover:text-[#e9edef]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Scrollable Chat List */}
        <div className="max-h-64 overflow-y-auto border border-[#222d34] rounded-lg bg-[#111b21] divide-y divide-[#222d34]/60">
          {isLoadingChats ? (
            <div className="p-8 text-center text-[#8696a0] text-xs flex flex-col items-center gap-2">
              <div className="w-5 h-5 rounded-full border-2 border-[#00a884] border-t-transparent animate-spin" />
              <span>Loading chats from WhatsApp Web...</span>
            </div>
          ) : filteredChats.length === 0 ? (
            <div className="p-8 text-center text-[#8696a0] text-xs">
              No matching chats found.
            </div>
          ) : (
            filteredChats.map((chat) => {
              const isSelected = selectedJids.has(chat.jid);
              return (
                <div
                  key={chat.jid}
                  onClick={() => handleToggleSelectChat(chat.jid)}
                  className={`flex items-center gap-3 p-2.5 hover:bg-[#202c33]/60 cursor-pointer transition-colors ${
                    isSelected ? 'bg-[#202c33]/90' : ''
                  }`}
                >
                  <div className="flex-shrink-0 text-[#00a884]">
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-[#00a884]" />
                    ) : (
                      <Square className="w-4 h-4 text-[#8696a0]" />
                    )}
                  </div>
                  <div className="w-7 h-7 rounded-full bg-[#202c33] border border-[#2c3943] flex items-center justify-center text-[11px] font-bold text-[#e9edef] flex-shrink-0 overflow-hidden">
                    {chat.avatarUrl ? (
                      <img src={chat.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : chat.isGroup ? (
                      <Users className="w-3.5 h-3.5 text-[#8696a0]" />
                    ) : (
                      <MessageSquare className="w-3.5 h-3.5 text-[#8696a0]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-xs text-[#e9edef] truncate">{chat.title}</span>
                      {chat.isCommunity && (
                        <span className="text-[9px] px-1.5 py-0.2 bg-[#00a884]/20 text-[#00a884] rounded font-semibold">
                          Community
                        </span>
                      )}
                      {chat.isGroup && !chat.isCommunity && (
                        <span className="text-[9px] px-1.5 py-0.2 bg-[#2a3942] text-[#8696a0] rounded">
                          Group
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Selection Summary Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <span className="text-xs text-[#8696a0]">
            {selectedJids.size} of {filteredChats.length} chats selected
          </span>
          <button
            onClick={handleExportSelected}
            disabled={selectedJids.size === 0}
            className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 w-full sm:w-auto ${
              selectedJids.size > 0
                ? 'bg-[#00a884] hover:bg-[#00c298] text-[#111b21] cursor-pointer'
                : 'bg-[#222d34] text-[#8696a0] cursor-not-allowed opacity-60'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>Export Selected Chats ({selectedJids.size})</span>
          </button>
        </div>
      </div>

      {/* Timeframe & Calendar Popup Modal */}
      {isTimeframeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#202c33] border border-[#2c3943] rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-[#2c3943]">
              <div className="flex items-center gap-2.5">
                <Calendar className="w-5 h-5 text-[#00a884]" />
                <h3 className="font-bold text-sm text-[#e9edef]">Select Export Timeframe</h3>
              </div>
              <button
                onClick={() => setIsTimeframeModalOpen(false)}
                className="text-[#8696a0] hover:text-[#e9edef] p-1 rounded hover:bg-[#111b21]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-[#8696a0] leading-relaxed">
              Exporting{' '}
              <strong className="text-[#e9edef]">
                {targetExportChats.length === 1
                  ? targetExportChats[0].title
                  : `${targetExportChats.length} chats`}
              </strong>
              . Choose how far back into the timeline to harvest messages:
            </div>

            <div className="space-y-3">
              {/* Option 1: Entire Available History */}
              <label
                onClick={() => setExportScope('all')}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  exportScope === 'all'
                    ? 'bg-[#111b21] border-[#00a884]'
                    : 'bg-[#182229] border-[#222d34] hover:border-[#374248]'
                }`}
              >
                <input
                  type="radio"
                  name="exportScope"
                  checked={exportScope === 'all'}
                  onChange={() => setExportScope('all')}
                  className="mt-0.5 text-[#00a884] focus:ring-[#00a884]"
                />
                <div>
                  <div className="font-semibold text-xs text-[#e9edef]">Entire available history</div>
                  <div className="text-[10px] text-[#8696a0] mt-0.5">
                    Extracts all messages backwards until reaching the very top of loaded conversation history.
                  </div>
                </div>
              </label>

              {/* Option 2: Back to specific Calendar Date */}
              <label
                onClick={() => setExportScope('custom')}
                className={`flex flex-col gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                  exportScope === 'custom'
                    ? 'bg-[#111b21] border-[#00a884]'
                    : 'bg-[#182229] border-[#222d34] hover:border-[#374248]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="exportScope"
                    checked={exportScope === 'custom'}
                    onChange={() => setExportScope('custom')}
                    className="mt-0.5 text-[#00a884] focus:ring-[#00a884]"
                  />
                  <div>
                    <div className="font-semibold text-xs text-[#e9edef]">Export messages back to date:</div>
                    <div className="text-[10px] text-[#8696a0] mt-0.5">
                      Halts traversal as soon as messages prior to this date boundary are reached.
                    </div>
                  </div>
                </div>

                {exportScope === 'custom' && (
                  <div className="pl-7 pt-1">
                    <input
                      type="date"
                      max={todayIso}
                      value={customDate}
                      onChange={(e) => setCustomDate(e.target.value)}
                      className="bg-[#202c33] border border-[#374248] text-[#e9edef] text-xs rounded-lg px-3 py-1.5 focus:border-[#00a884] outline-none"
                    />
                  </div>
                )}
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#2c3943]">
              <button
                type="button"
                onClick={() => setIsTimeframeModalOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-[#8696a0] hover:text-[#e9edef] hover:bg-[#111b21] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmExport}
                disabled={isStartingExport}
                className="px-4 py-2 rounded-lg bg-[#00a884] hover:bg-[#00c298] text-[#111b21] text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                {isStartingExport ? (
                  <>
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-[#111b21] border-t-transparent animate-spin" />
                    <span>Preparing...</span>
                  </>
                ) : (
                  <>
                    <FolderOpen className="w-4 h-4" />
                    <span>Choose Folder & Start Export</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

