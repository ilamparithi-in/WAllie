import React, { useState, useMemo } from 'react';
import {
  Bell,
  Download,
  Calendar,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Trash2,
  Search,
  X,
  AlertTriangle,
} from 'lucide-react';
import type { AccountInfo, GlobalSettings, HistoricalNotification } from '../../../preload';

interface NotificationSettingsPageProps {
  accounts: AccountInfo[];
  globalSettings: GlobalSettings | null;
  setActivePage: (page: any) => void;
  notifSearch: string;
  setNotifSearch: (search: string) => void;
  notifAccountFilter: string;
  setNotifAccountFilter: (filter: string) => void;
  handleClearHistory: (options?: any) => Promise<void> | void;
  notificationHistory: HistoricalNotification[];
  filteredNotifications: HistoricalNotification[];
}

type DateQuickFilter = 'all' | 'today' | 'yesterday' | '7days' | 'custom';

const getLocalDateKey = (timestamp: number): string => {
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatHeaderDate = (dateKey: string): string => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const targetDate = new Date(year, month - 1, day);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (
    targetDate.getFullYear() === today.getFullYear() &&
    targetDate.getMonth() === today.getMonth() &&
    targetDate.getDate() === today.getDate()
  ) {
    return 'Today';
  }

  if (
    targetDate.getFullYear() === yesterday.getFullYear() &&
    targetDate.getMonth() === yesterday.getMonth() &&
    targetDate.getDate() === yesterday.getDate()
  ) {
    return 'Yesterday';
  }

  return targetDate.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export const NotificationSettingsPage: React.FC<NotificationSettingsPageProps> = ({
  accounts,
  globalSettings,
  setActivePage,
  notifSearch,
  setNotifSearch,
  notifAccountFilter,
  setNotifAccountFilter,
  handleClearHistory,
  notificationHistory,
  filteredNotifications,
}) => {
  const [dateQuickFilter, setDateQuickFilter] = useState<DateQuickFilter>('all');
  const [selectedDate, setSelectedDate] = useState<string>(''); // YYYY-MM-DD
  const [collapsedDates, setCollapsedDates] = useState<Record<string, boolean>>({});
  const [datePage, setDatePage] = useState<number>(1);
  const [showAllPages, setShowAllPages] = useState<boolean>(false);
  const [expandedSectionItems, setExpandedSectionItems] = useState<Record<string, number>>({});

  // Inline Clear panel & date range state
  const [showClearPanel, setShowClearPanel] = useState<boolean>(false);
  const [clearMode, setClearMode] = useState<string>('all');
  const [clearStartDate, setClearStartDate] = useState<string>('');
  const [clearEndDate, setClearEndDate] = useState<string>('');

  const DAYS_PER_PAGE = 5;
  const ITEMS_PER_SECTION_INITIAL = 20;

  // Compute today & yesterday date strings
  const todayStr = useMemo(() => getLocalDateKey(Date.now()), []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return getLocalDateKey(d.getTime());
  }, []);

  // Filter by date
  const dateFilteredNotifications = useMemo(() => {
    if (dateQuickFilter === 'today') {
      return filteredNotifications.filter((n) => getLocalDateKey(n.timestamp) === todayStr);
    }
    if (dateQuickFilter === 'yesterday') {
      return filteredNotifications.filter((n) => getLocalDateKey(n.timestamp) === yesterdayStr);
    }
    if (dateQuickFilter === '7days') {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      return filteredNotifications.filter((n) => n.timestamp >= sevenDaysAgo);
    }
    if (dateQuickFilter === 'custom' && selectedDate) {
      return filteredNotifications.filter((n) => getLocalDateKey(n.timestamp) === selectedDate);
    }
    return filteredNotifications;
  }, [filteredNotifications, dateQuickFilter, selectedDate, todayStr, yesterdayStr]);

  // Group notifications by date key
  const dateGroups = useMemo(() => {
    const groupsMap = new Map<string, HistoricalNotification[]>();
    for (const notif of dateFilteredNotifications) {
      const key = getLocalDateKey(notif.timestamp);
      if (!groupsMap.has(key)) {
        groupsMap.set(key, []);
      }
      groupsMap.get(key)!.push(notif);
    }

    const result: { dateKey: string; formattedDate: string; items: HistoricalNotification[] }[] = [];
    for (const [dateKey, items] of groupsMap.entries()) {
      result.push({
        dateKey,
        formattedDate: formatHeaderDate(dateKey),
        items,
      });
    }

    result.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
    return result;
  }, [dateFilteredNotifications]);

  // Date Pagination calculation
  const totalDatePages = Math.max(1, Math.ceil(dateGroups.length / DAYS_PER_PAGE));
  const currentSafePage = Math.min(datePage, totalDatePages);

  const visibleDateGroups = useMemo(() => {
    if (showAllPages || dateGroups.length <= DAYS_PER_PAGE) {
      return dateGroups;
    }
    const startIndex = (currentSafePage - 1) * DAYS_PER_PAGE;
    return dateGroups.slice(startIndex, startIndex + DAYS_PER_PAGE);
  }, [dateGroups, showAllPages, currentSafePage]);

  // Calculate items to remove based on selected clear mode & date range
  const countToRemove = useMemo(() => {
    if (!notificationHistory || notificationHistory.length === 0) return 0;
    const now = Date.now();

    if (clearMode === 'range') {
      const startMs = clearStartDate ? new Date(`${clearStartDate}T00:00:00`).getTime() : 0;
      const endMs = clearEndDate ? new Date(`${clearEndDate}T23:59:59.999`).getTime() : Date.now();
      return notificationHistory.filter((item) => item.timestamp >= startMs && item.timestamp <= endMs).length;
    }

    if (clearMode === 'single') {
      const startMs = clearStartDate ? new Date(`${clearStartDate}T00:00:00`).getTime() : 0;
      const endMs = clearStartDate ? new Date(`${clearStartDate}T23:59:59.999`).getTime() : Date.now();
      return notificationHistory.filter((item) => item.timestamp >= startMs && item.timestamp <= endMs).length;
    }

    switch (clearMode) {
      case '24h':
        return notificationHistory.filter((item) => now - item.timestamp <= 24 * 3600 * 1000).length;
      case '7d':
        return notificationHistory.filter((item) => now - item.timestamp <= 7 * 24 * 3600 * 1000).length;
      case '30d':
        return notificationHistory.filter((item) => now - item.timestamp <= 30 * 24 * 3600 * 1000).length;
      case 'older7d':
        return notificationHistory.filter((item) => now - item.timestamp > 7 * 24 * 3600 * 1000).length;
      case 'older30d':
        return notificationHistory.filter((item) => now - item.timestamp > 30 * 24 * 3600 * 1000).length;
      case 'all':
      default:
        return notificationHistory.length;
    }
  }, [notificationHistory, clearMode, clearStartDate, clearEndDate]);

  // Export handler
  const handleExportHistory = () => {
    if (!notificationHistory || notificationHistory.length === 0) return;
    const jsonString = JSON.stringify(notificationHistory, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const fileDateStr = getLocalDateKey(Date.now());
    a.download = `notification-history-${fileDateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const toggleSectionCollapse = (dateKey: string) => {
    setCollapsedDates((prev) => ({ ...prev, [dateKey]: !prev[dateKey] }));
  };

  const handleStepDate = (offsetDays: number) => {
    let baseDate: Date;
    if (selectedDate) {
      const [y, m, d] = selectedDate.split('-').map(Number);
      baseDate = new Date(y, m - 1, d);
    } else {
      baseDate = new Date();
    }
    baseDate.setDate(baseDate.getDate() + offsetDays);
    const newDateStr = getLocalDateKey(baseDate.getTime());
    setSelectedDate(newDateStr);
    setDateQuickFilter('custom');
  };

  return (
    <div className="flex flex-col h-full space-y-3 subpage-animate">
      {/* Subpage Intro Header */}
      <div className="flex-shrink-0">
        <p className="text-[11px] text-[#8696a0] leading-relaxed">
          Browse, filter, search, export, or prune logs of desktop notifications, message edits, and deletions.
        </p>
      </div>

      {/* Warning banner when notification logging is disabled */}
      {globalSettings?.notificationLoggingEnabled === false && (
        <div className="flex-shrink-0 bg-[#ea4335]/15 border border-[#ea4335]/30 text-[#ea4335] px-3 py-2 rounded-lg text-[11px] leading-normal font-medium flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <div>
            Notification logging is currently disabled. Go to the{' '}
            <button
              onClick={() => setActivePage('general')}
              className="underline font-semibold hover:text-[#ff5c4c] transition-colors cursor-pointer"
            >
              General settings page
            </button>{' '}
            to enable it.
          </div>
        </div>
      )}

      {/* Primary Search & Filter Bar */}
      <div className="flex-shrink-0 flex items-center gap-2">
        {/* Search Input */}
        <div className="relative flex-grow">
          <Search className="w-3.5 h-3.5 text-[#667781] absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={notifSearch}
            onChange={(e) => setNotifSearch(e.target.value)}
            placeholder="Search title or body..."
            className="w-full bg-[#182229] text-[#e9edef] pl-8 pr-7 py-1.5 rounded-lg border border-[#222d34] text-[11px] outline-none focus:border-[#00a884] placeholder-[#667781] transition-colors"
          />
          {notifSearch && (
            <button
              onClick={() => setNotifSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8696a0] hover:text-[#e9edef]"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Account Selector */}
        <select
          value={notifAccountFilter}
          onChange={(e) => setNotifAccountFilter(e.target.value)}
          className="w-36 bg-[#202c33] text-[#e9edef] px-2 py-1.5 rounded-lg border border-[#222d34] text-[11px] outline-none focus:border-[#00a884] flex-shrink-0 cursor-pointer"
        >
          <option value="all">All Accounts</option>
          {accounts.map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.emoji ? `${acc.emoji} ` : ''}
              {acc.name}
            </option>
          ))}
        </select>
      </div>

      {/* Date Filter & Action Toolbar */}
      <div className="flex-shrink-0 bg-[#182229] border border-[#222d34] rounded-lg p-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        {/* Left: Quick Date Filters */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          <button
            onClick={() => {
              setDateQuickFilter('all');
              setSelectedDate('');
            }}
            className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all cursor-pointer ${
              dateQuickFilter === 'all'
                ? 'bg-[#00a884] text-[#111b21] font-semibold shadow-xs'
                : 'bg-[#202c33] text-[#8696a0] hover:text-[#e9edef] hover:bg-[#26343d]'
            }`}
          >
            All
          </button>
          <button
            onClick={() => {
              setDateQuickFilter('today');
              setSelectedDate(todayStr);
            }}
            className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all cursor-pointer ${
              dateQuickFilter === 'today'
                ? 'bg-[#00a884] text-[#111b21] font-semibold shadow-xs'
                : 'bg-[#202c33] text-[#8696a0] hover:text-[#e9edef] hover:bg-[#26343d]'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => {
              setDateQuickFilter('yesterday');
              setSelectedDate(yesterdayStr);
            }}
            className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all cursor-pointer ${
              dateQuickFilter === 'yesterday'
                ? 'bg-[#00a884] text-[#111b21] font-semibold shadow-xs'
                : 'bg-[#202c33] text-[#8696a0] hover:text-[#e9edef] hover:bg-[#26343d]'
            }`}
          >
            Yesterday
          </button>
          <button
            onClick={() => {
              setDateQuickFilter('7days');
            }}
            className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all cursor-pointer ${
              dateQuickFilter === '7days'
                ? 'bg-[#00a884] text-[#111b21] font-semibold shadow-xs'
                : 'bg-[#202c33] text-[#8696a0] hover:text-[#e9edef] hover:bg-[#26343d]'
            }`}
          >
            Past 7 Days
          </button>
        </div>

        {/* Center: Calendar Picker */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleStepDate(-1)}
            title="Previous Day"
            className="p-1 bg-[#202c33] text-[#8696a0] hover:text-[#e9edef] hover:bg-[#2a3942] rounded-md transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <div className="flex items-center gap-1.5 bg-[#202c33] border border-[#222d34] rounded-md px-2 py-0.5">
            <Calendar className="w-3 h-3 text-[#00a884]" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                if (e.target.value) {
                  setDateQuickFilter('custom');
                } else {
                  setDateQuickFilter('all');
                }
              }}
              className="bg-transparent text-[#e9edef] text-[10px] outline-none cursor-pointer [color-scheme:dark]"
            />
          </div>
          <button
            onClick={() => handleStepDate(1)}
            title="Next Day"
            className="p-1 bg-[#202c33] text-[#8696a0] hover:text-[#e9edef] hover:bg-[#2a3942] rounded-md transition-colors cursor-pointer"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: Actions (Export & Clear) */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleExportHistory}
            disabled={notificationHistory.length === 0}
            className="px-2.5 py-1 bg-[#00a884]/15 border border-[#00a884]/40 text-[#00a884] hover:bg-[#00a884]/25 disabled:opacity-40 font-semibold rounded-md transition-colors text-[10px] flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
            title="Export notification history as JSON"
          >
            <Download className="w-3 h-3" />
            <span>Export</span>
          </button>

          <button
            onClick={() => setShowClearPanel(!showClearPanel)}
            disabled={notificationHistory.length === 0}
            className={`px-2.5 py-1 border font-bold rounded-md transition-colors text-[10px] flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed ${
              showClearPanel
                ? 'bg-[#ea4335] text-white border-[#ea4335]'
                : 'bg-[#ea4335]/10 border-[#ea4335]/30 text-[#ea4335] hover:bg-[#ea4335]/25 disabled:opacity-40'
            }`}
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear...</span>
          </button>
        </div>
      </div>

      {/* Integrated Date Range Clear Panel */}
      {showClearPanel && (
        <div className="flex-shrink-0 bg-[#ea4335]/10 border border-[#ea4335]/30 rounded-xl p-3.5 space-y-3 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[#ea4335]">
              <Trash2 className="w-4 h-4" />
              <h4 className="font-semibold text-xs">Clear Notification History</h4>
            </div>
            <button
              onClick={() => setShowClearPanel(false)}
              className="text-[#8696a0] hover:text-[#e9edef] p-0.5 rounded transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Quick Removal Period Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setClearMode('24h')}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                clearMode === '24h'
                  ? 'bg-[#ea4335] text-white font-semibold'
                  : 'bg-[#202c33] text-[#e9edef] hover:bg-[#2a3942]'
              }`}
            >
              Last 24 Hours
            </button>
            <button
              onClick={() => setClearMode('7d')}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                clearMode === '7d'
                  ? 'bg-[#ea4335] text-white font-semibold'
                  : 'bg-[#202c33] text-[#e9edef] hover:bg-[#2a3942]'
              }`}
            >
              Last 7 Days
            </button>
            <button
              onClick={() => setClearMode('30d')}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                clearMode === '30d'
                  ? 'bg-[#ea4335] text-white font-semibold'
                  : 'bg-[#202c33] text-[#e9edef] hover:bg-[#2a3942]'
              }`}
            >
              Last Month
            </button>
            <button
              onClick={() => setClearMode('older7d')}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                clearMode === 'older7d'
                  ? 'bg-[#ea4335] text-white font-semibold'
                  : 'bg-[#202c33] text-[#e9edef] hover:bg-[#2a3942]'
              }`}
            >
              Older than 7 Days
            </button>
            <button
              onClick={() => setClearMode('older30d')}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                clearMode === 'older30d'
                  ? 'bg-[#ea4335] text-white font-semibold'
                  : 'bg-[#202c33] text-[#e9edef] hover:bg-[#2a3942]'
              }`}
            >
              Older than 30 Days
            </button>
            <button
              onClick={() => setClearMode('all')}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                clearMode === 'all'
                  ? 'bg-[#ea4335] text-white font-semibold'
                  : 'bg-[#202c33] text-[#e9edef] hover:bg-[#2a3942]'
              }`}
            >
              All Time
            </button>
            <button
              onClick={() => setClearMode('range')}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                clearMode === 'range' || clearMode === 'single'
                  ? 'bg-[#ea4335] text-white font-semibold'
                  : 'bg-[#202c33] text-[#e9edef] hover:bg-[#2a3942]'
              }`}
            >
              Custom Range
            </button>
          </div>

          {/* Show dropdown and date inputs only when Custom Range is selected */}
          {(clearMode === 'range' || clearMode === 'single') && (
            <div className="space-y-2 animate-in fade-in duration-150">
              <select
                value={clearMode}
                onChange={(e) => setClearMode(e.target.value)}
                className="w-full bg-[#202c33] text-[#e9edef] text-xs px-2.5 py-1.5 rounded-lg border border-[#222d34] outline-none focus:border-[#ea4335] cursor-pointer"
              >
                <option value="range">Custom Date Range (From - To)</option>
                <option value="single">Single Specific Day</option>
              </select>

              {clearMode === 'range' && (
                <div className="grid grid-cols-2 gap-2 bg-[#111b21]/60 p-2 rounded-lg border border-[#222d34]">
                  <div>
                    <label className="text-[9px] text-[#8696a0] block mb-0.5">From Date</label>
                    <input
                      type="date"
                      value={clearStartDate}
                      onChange={(e) => setClearStartDate(e.target.value)}
                      className="w-full bg-[#202c33] text-[#e9edef] text-[11px] p-1.5 rounded border border-[#222d34] outline-none focus:border-[#ea4335] [color-scheme:dark]"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-[#8696a0] block mb-0.5">To Date</label>
                    <input
                      type="date"
                      value={clearEndDate}
                      onChange={(e) => setClearEndDate(e.target.value)}
                      className="w-full bg-[#202c33] text-[#e9edef] text-[11px] p-1.5 rounded border border-[#222d34] outline-none focus:border-[#ea4335] [color-scheme:dark]"
                    />
                  </div>
                </div>
              )}

              {clearMode === 'single' && (
                <div className="bg-[#111b21]/60 p-2 rounded-lg border border-[#222d34]">
                  <label className="text-[9px] text-[#8696a0] block mb-0.5">Select Day to Clear</label>
                  <input
                    type="date"
                    value={clearStartDate}
                    onChange={(e) => setClearStartDate(e.target.value)}
                    className="w-full bg-[#202c33] text-[#e9edef] text-[11px] p-1.5 rounded border border-[#222d34] outline-none focus:border-[#ea4335] [color-scheme:dark]"
                  />
                </div>
              )}
            </div>
          )}

          <div className="bg-[#111b21]/80 border border-[#222d34] p-2.5 rounded-lg flex items-center justify-between text-[11px] text-[#8696a0]">
            <span>Logs matching range:</span>
            <span className="font-bold text-[#ea4335] text-xs">
              {countToRemove} of {notificationHistory.length}
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#ea4335]/20">
            <button
              onClick={() => setShowClearPanel(false)}
              className="px-3 py-1 bg-[#202c33] hover:bg-[#2a3942] text-[#e9edef] rounded-md text-[11px] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                await handleClearHistory({
                  mode: clearMode,
                  startDate: clearStartDate,
                  endDate: clearEndDate,
                });
                setShowClearPanel(false);
              }}
              disabled={countToRemove === 0}
              className="px-3 py-1 bg-[#ea4335] hover:bg-[#ff5c4c] disabled:opacity-50 text-white font-semibold rounded-md text-[11px] transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Confirm Clear ({countToRemove})</span>
            </button>
          </div>
        </div>
      )}

      {/* Date Pagination Controls (when multiple date sections exist) */}
      {dateGroups.length > DAYS_PER_PAGE && dateQuickFilter === 'all' && (
        <div className="flex-shrink-0 flex items-center justify-between text-[10px] text-[#8696a0] bg-[#111b21] border border-[#222d34] px-2.5 py-1 rounded-md">
          <span>
            Days{' '}
            {showAllPages
              ? `1–${dateGroups.length}`
              : `${(currentSafePage - 1) * DAYS_PER_PAGE + 1}–${Math.min(currentSafePage * DAYS_PER_PAGE, dateGroups.length)}`}{' '}
            of {dateGroups.length}
          </span>
          <div className="flex items-center gap-2">
            {!showAllPages && (
              <div className="flex items-center gap-1">
                <button
                  disabled={currentSafePage <= 1}
                  onClick={() => setDatePage((p) => Math.max(1, p - 1))}
                  className="px-1.5 py-0.5 bg-[#202c33] text-[#e9edef] rounded disabled:opacity-40 hover:bg-[#2a3942] transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  ◀ Prev
                </button>
                <span>
                  {currentSafePage} / {totalDatePages}
                </span>
                <button
                  disabled={currentSafePage >= totalDatePages}
                  onClick={() => setDatePage((p) => Math.min(totalDatePages, p + 1))}
                  className="px-1.5 py-0.5 bg-[#202c33] text-[#e9edef] rounded disabled:opacity-40 hover:bg-[#2a3942] transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  Next ▶
                </button>
              </div>
            )}
            <button
              onClick={() => setShowAllPages(!showAllPages)}
              className="text-[#00a884] hover:underline font-medium cursor-pointer"
            >
              {showAllPages ? 'Paginate Days' : 'Show All Days'}
            </button>
          </div>
        </div>
      )}

      {/* Notification Logs List */}
      <div className="flex-grow overflow-y-auto space-y-3 pr-1 pb-4">
        {visibleDateGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-[#8696a0]">
            <Bell className="w-10 h-10 mb-2.5 text-[#202c33]" />
            <p className="font-semibold text-[#d1d7db] mb-0.5 text-xs">No Notification Logs</p>
            <p className="text-[10px] max-w-[220px] leading-normal">
              {notifSearch || notifAccountFilter !== 'all' || dateQuickFilter !== 'all'
                ? 'No logs match your selected filter'
                : 'Desktop alerts are logged here'}
            </p>
          </div>
        ) : (
          visibleDateGroups.map((group) => {
            const isCollapsed = collapsedDates[group.dateKey] || false;
            const itemsLimit = expandedSectionItems[group.dateKey] || ITEMS_PER_SECTION_INITIAL;
            const displayedItems = group.items.slice(0, itemsLimit);
            const remainingCount = group.items.length - displayedItems.length;

            return (
              <div key={group.dateKey} className="space-y-1.5">
                {/* Date Section Header */}
                <div
                  onClick={() => toggleSectionCollapse(group.dateKey)}
                  className="sticky top-0 z-10 flex items-center justify-between bg-[#1f2c34]/95 backdrop-blur-sm hover:bg-[#26353d] border border-[#222d34] px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors select-none"
                >
                  <div className="flex items-center gap-1.5">
                    {isCollapsed ? (
                      <ChevronRight className="w-3.5 h-3.5 text-[#8696a0]" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-[#00a884]" />
                    )}
                    <Calendar className="w-3.5 h-3.5 text-[#00a884]" />
                    <span className="font-semibold text-xs text-[#e9edef]">{group.formattedDate}</span>
                  </div>
                  <span className="bg-[#111b21] text-[#00a884] text-[9px] font-bold px-2 py-0.5 rounded-full border border-[#222d34]">
                    {group.items.length} {group.items.length === 1 ? 'log' : 'logs'}
                  </span>
                </div>

                {/* Date Section Items */}
                {!isCollapsed && (
                  <div className="space-y-1.5 pl-1">
                    {displayedItems.map((notif) => {
                      const date = new Date(notif.timestamp);
                      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                      return (
                        <div
                          key={notif.id}
                          style={{ contentVisibility: 'auto', containIntrinsicSize: '0 64px' }}
                          className="flex items-start gap-2.5 p-2.5 bg-[#182229] border border-[#222d34] rounded-xl hover:border-[#374248] transition-all text-[11px] shadow-xs"
                        >
                          {notif.icon ? (
                            <img
                              src={notif.icon}
                              alt=""
                              className="w-7 h-7 rounded-full flex-shrink-0 object-cover bg-[#202c33]"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const parent = e.currentTarget.parentElement;
                                if (parent) {
                                  const fb = parent.querySelector('.avatar-fallback');
                                  if (fb) (fb as HTMLElement).style.display = 'flex';
                                }
                              }}
                            />
                          ) : null}
                          <div
                            className="avatar-fallback w-7 h-7 rounded-full bg-[#202c33] flex items-center justify-center text-[#00a884] flex-shrink-0"
                            style={{ display: notif.icon ? 'none' : 'flex' }}
                          >
                            <Bell className="w-3.5 h-3.5" />
                          </div>

                          <div className="min-w-0 flex-grow">
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="font-semibold text-xs text-[#e9edef] truncate">{notif.title}</span>
                              <div className="flex items-center gap-1.5 flex-shrink-0 whitespace-nowrap">
                                <span className="bg-[#202c33] text-[#00a884] font-medium text-[8px] px-1.5 py-0.5 rounded-md border border-[#222d34]">
                                  {notif.accountName}
                                </span>
                                <span className="text-[9px] text-[#8696a0]">
                                  {timeStr}
                                </span>
                              </div>
                            </div>
                            <div className="text-[10px] text-[#8696a0] mt-0.5 break-words max-h-16 overflow-y-auto no-scrollbar">
                              {notif.body}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Section Item Pagination / Load More */}
                    {remainingCount > 0 && (
                      <button
                        onClick={() =>
                          setExpandedSectionItems((prev) => ({
                            ...prev,
                            [group.dateKey]: itemsLimit + 20,
                          }))
                        }
                        className="w-full py-1 text-[10px] text-[#00a884] bg-[#182229] hover:bg-[#202c33] border border-[#222d34] rounded-lg transition-colors font-medium cursor-pointer"
                      >
                        Show {remainingCount} more logs for {group.formattedDate}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
