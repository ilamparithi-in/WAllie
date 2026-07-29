import React from 'react';
import { Database } from 'lucide-react';
import type { AccountInfo } from '../../../preload';

interface StorageSettingsPageProps {
  accounts: AccountInfo[];
  selectedAccountId: string;
  setSelectedAccountId: (id: string) => void;
  isLoadingStorage: boolean;
  storageSizes: {
    cache: number;
    localStorage: number;
    indexedDb: number;
    cookies: number;
  } | null;
  formatBytes: (bytes: number) => string;
  isClearing: boolean;
  handleClearStorage: (type: 'cache' | 'media') => Promise<void> | void;
}

export const StorageSettingsPage: React.FC<StorageSettingsPageProps> = ({
  accounts,
  selectedAccountId,
  setSelectedAccountId,
  isLoadingStorage,
  storageSizes,
  formatBytes,
  isClearing,
  handleClearStorage,
}) => {
  return (
    <div className="flex flex-col h-full space-y-4 subpage-animate">
      <div className="flex-shrink-0">
        <h3 className="text-sm font-semibold text-[#e9edef] border-b border-[#222d34] pb-2 flex items-center gap-1.5">
          <Database className="w-4 h-4 text-[#00a884]" />
          <span>Storage & Cache</span>
        </h3>
        <p className="text-[11px] text-[#8696a0] mt-2 mb-3 leading-relaxed">
          Inspect disk usage, clear application caches, or remove local storage data.
        </p>
      </div>

      {/* Unified Account Selector Banner */}
      <div className="flex items-center justify-between p-3 bg-[#182229] border border-[#222d34] rounded-lg mb-4 flex-shrink-0">
        <span className="font-semibold text-xs text-[#e9edef]">Target Account:</span>
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

      {isLoadingStorage ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center text-[#8696a0] py-12 gap-2">
          <div className="w-6 h-6 rounded-full border-2 border-[#00a884] border-t-transparent animate-spin" />
          <span>Calculating storage sizes...</span>
        </div>
      ) : (
        <div className="flex-grow overflow-y-auto space-y-4 pr-1">
          {/* Storage grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-[#182229] border border-[#222d34] rounded-lg">
              <div className="text-[10px] text-[#8696a0] uppercase font-bold tracking-wider mb-1">HTTP Cache</div>
              <div className="text-lg font-semibold text-[#e9edef]">
                {storageSizes ? formatBytes(storageSizes.cache) : '0 B'}
              </div>
              <div className="text-[10px] text-[#8696a0] mt-1">Temporary browser cache assets</div>
            </div>

            <div className="p-3 bg-[#182229] border border-[#222d34] rounded-lg">
              <div className="text-[10px] text-[#8696a0] uppercase font-bold tracking-wider mb-1">IndexedDB</div>
              <div className="text-lg font-semibold text-[#e9edef]">
                {storageSizes ? formatBytes(storageSizes.indexedDb) : '0 B'}
              </div>
              <div className="text-[10px] text-[#8696a0] mt-1">Message database and media blobs</div>
            </div>

            <div className="p-3 bg-[#182229] border border-[#222d34] rounded-lg">
              <div className="text-[10px] text-[#8696a0] uppercase font-bold tracking-wider mb-1">Local Storage</div>
              <div className="text-lg font-semibold text-[#e9edef]">
                {storageSizes ? formatBytes(storageSizes.localStorage) : '0 B'}
              </div>
              <div className="text-[10px] text-[#8696a0] mt-1">Account credentials & session tokens</div>
            </div>

            <div className="p-3 bg-[#182229] border border-[#222d34] rounded-lg">
              <div className="text-[10px] text-[#8696a0] uppercase font-bold tracking-wider mb-1">Cookies</div>
              <div className="text-lg font-semibold text-[#e9edef]">
                {storageSizes ? formatBytes(storageSizes.cookies) : '0 B'}
              </div>
              <div className="text-[10px] text-[#8696a0] mt-1">Authentication state databases</div>
            </div>
          </div>

          {/* Actions */}
          <div className="p-3 bg-[#202c33]/40 border border-[#222d34] rounded-lg space-y-3">
            <div className="font-semibold text-xs text-[#e9edef]">Management Actions</div>
            
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between p-2 rounded bg-[#182229] border border-[#222d34]">
                <div className="pr-4 min-w-0 flex-1">
                  <div className="font-semibold text-xs text-[#e9edef]">Clear Cache</div>
                  <div className="text-[10px] text-[#8696a0] mt-0.5 break-words">Wipes temporary asset cache. Safe to do anytime.</div>
                </div>
                <button
                  disabled={isClearing}
                  onClick={() => handleClearStorage('cache')}
                  className="px-3 py-1.5 bg-[#202c33] border border-[#374248] text-[#e9edef] hover:bg-[#2a3942] hover:text-[#00a884] disabled:opacity-50 font-bold rounded transition-colors text-[11px] whitespace-nowrap"
                >
                  Clear Cache
                </button>
              </div>

              <div className="flex items-center justify-between p-2 rounded bg-[#182229] border border-[#222d34]">
                <div className="pr-4 min-w-0 flex-1">
                  <div className="font-semibold text-xs text-[#e9edef]">Clear Media & Databases</div>
                  <div className="text-[10px] text-[#ea4335] mt-0.5 break-words">Wipes local chat history & media cache. Keeps you logged in, but page will reload and sync.</div>
                </div>
                <button
                  disabled={isClearing}
                  onClick={() => handleClearStorage('media')}
                  className="px-3 py-1.5 bg-[#ea4335]/10 border border-[#ea4335]/30 text-[#ea4335] hover:bg-[#ea4335]/25 disabled:opacity-50 font-bold rounded transition-colors text-[11px] whitespace-nowrap"
                >
                  Clear Media
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
