import React from 'react';
import { Bell } from 'lucide-react';
import type { AccountInfo, GlobalSettings } from '../../../preload';

interface NotificationSettingsPageProps {
  accounts: AccountInfo[];
  globalSettings: GlobalSettings | null;
  setActivePage: (page: any) => void;
  notifSearch: string;
  setNotifSearch: (search: string) => void;
  notifAccountFilter: string;
  setNotifAccountFilter: (filter: string) => void;
  handleClearHistory: () => Promise<void> | void;
  notificationHistory: any[];
  filteredNotifications: any[];
}

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
  return (
    <div className="flex flex-col h-full space-y-4 subpage-animate">
      <div className="flex-shrink-0">
        <h3 className="text-sm font-semibold text-[#e9edef] border-b border-[#222d34] pb-2 flex items-center gap-1.5">
          <Bell className="w-4 h-4 text-[#00a884]" />
          <span>Notification History</span>
        </h3>
        <p className="text-[11px] text-[#8696a0] mt-2 mb-3 leading-relaxed">
          Browse, filter, and search through logs of desktop notifications, message edits, and deletions.
        </p>
      </div>

      {globalSettings?.notificationLoggingEnabled === false && (
        <div className="flex-shrink-0 bg-[#ea4335]/15 border border-[#ea4335]/30 text-[#ea4335] px-3 py-2 rounded text-[11px] leading-normal font-medium">
          ⚠️ Notification logging is currently disabled. Go to the{' '}
          <button
            onClick={() => setActivePage('general')}
            className="underline font-semibold hover:text-[#ff5c4c] transition-colors cursor-pointer"
          >
            General settings page
          </button>{' '}
          to enable it so notifications, edits, and deletions can be recorded.
        </div>
      )}

      <div className="flex-shrink-0 flex items-center justify-between gap-3 border-b border-[#222d34] pb-3">
        <div className="flex items-center gap-2 flex-grow">
          <input
            type="text"
            value={notifSearch}
            onChange={(e) => setNotifSearch(e.target.value)}
            placeholder="Search notifications..."
            className="w-1/2 bg-[#182229] text-[#e9edef] px-2.5 py-1.5 rounded border border-[#222d34] text-[11px] outline-none focus:border-[#00a884] placeholder-[#667781]"
          />
          <select
            value={notifAccountFilter}
            onChange={(e) => setNotifAccountFilter(e.target.value)}
            className="w-1/2 bg-[#202c33] text-[#e9edef] px-2 py-1.5 rounded border border-[#222d34] text-[11px] outline-none focus:border-[#00a884]"
          >
            <option value="all">All Accounts</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.emoji ? `${acc.emoji} ` : ''}{acc.name}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleClearHistory}
          disabled={notificationHistory.length === 0}
          className="px-2.5 py-1.5 bg-[#ea4335]/10 border border-[#ea4335]/30 text-[#ea4335] hover:bg-[#ea4335]/25 disabled:opacity-50 font-bold rounded transition-colors text-[10px] flex-shrink-0"
        >
          Clear History
        </button>
      </div>

      <div className="flex-grow overflow-y-auto space-y-2 pr-1 pb-4">
        {filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-[#8696a0]">
            <Bell className="w-10 h-10 mb-2.5 text-[#202c33]" />
            <p className="font-semibold text-[#d1d7db] mb-0.5 text-xs">No Notification Logs</p>
            <p className="text-[10px] max-w-[200px] leading-normal">
              {notifSearch || notifAccountFilter !== 'all'
                ? 'No logs match your filter'
                : 'Desktop alerts are logged here'}
            </p>
          </div>
        ) : (
          filteredNotifications.map((notif) => {
            const date = new Date(notif.timestamp);
            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });

            return (
              <div
                key={notif.id}
                className="flex items-start gap-2.5 p-2.5 bg-[#182229] border border-[#222d34] rounded-lg hover:border-[#374248] transition-colors text-[11px]"
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
                  <div className="flex items-baseline justify-between gap-1.5">
                    <span className="font-semibold text-xs text-[#e9edef] truncate">
                      {notif.title}
                    </span>
                    <span className="text-[9px] text-[#8696a0] flex-shrink-0 whitespace-nowrap">
                      {dateStr}, {timeStr}
                    </span>
                  </div>
                  <div className="text-[10px] text-[#8696a0] mt-0.5 break-words max-h-16 overflow-y-auto no-scrollbar">
                    {notif.body}
                  </div>
                  <div className="mt-1 flex items-center">
                    <span className="bg-[#202c33] text-[#00a884] font-medium text-[8px] px-1 py-0.5 rounded border border-[#222d34]">
                      {notif.accountName}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
