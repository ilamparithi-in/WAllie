import React, { useState, useEffect } from 'react';
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
  const [isAnimated, setIsAnimated] = useState(false);

  useEffect(() => {
    if (isLoadingStorage) {
      setIsAnimated(false);
      return;
    }
    const timer = setTimeout(() => {
      setIsAnimated(true);
    }, 60);
    return () => clearTimeout(timer);
  }, [isLoadingStorage, storageSizes, selectedAccountId]);

  const items = [
    {
      key: 'cache',
      label: 'HTTP Cache',
      value: storageSizes?.cache || 0,
      color: '#00a884',
      desc: 'Temporary browser cache assets',
    },
    {
      key: 'indexedDb',
      label: 'IndexedDB',
      value: storageSizes?.indexedDb || 0,
      color: '#34b7f1',
      desc: 'Message database and media blobs',
    },
    {
      key: 'localStorage',
      label: 'Local Storage',
      value: storageSizes?.localStorage || 0,
      color: '#a855f7',
      desc: 'Account credentials & session tokens',
    },
    {
      key: 'cookies',
      label: 'Cookies',
      value: storageSizes?.cookies || 0,
      color: '#f59e0b',
      desc: 'Authentication state databases',
    },
  ];

  const totalBytes = items.reduce((sum, item) => sum + item.value, 0);

  const RADIUS = 40;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  let currentOffset = 0;
  const chartSlices = items.map((item) => {
    const fraction = totalBytes > 0 ? item.value / totalBytes : 0;
    const dashLength = fraction * CIRCUMFERENCE;
    const gapLength = CIRCUMFERENCE - dashLength;
    const offset = currentOffset;
    currentOffset += dashLength;

    return {
      ...item,
      fraction,
      percentage: (fraction * 100).toFixed(1),
      dashArray: `${dashLength} ${gapLength}`,
      dashOffset: -offset,
    };
  });

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
          {/* Storage Breakdown Pie / Donut Chart Card */}
          <div className="p-3.5 bg-[#182229] border border-[#222d34] rounded-lg flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-[#222d34]/60 pb-2">
              <span className="text-[11px] font-semibold text-[#e9edef] uppercase tracking-wider">
                Storage Breakdown
              </span>
              <span className="text-[10px] text-[#8696a0]">
                Total: <span className="text-[#00a884] font-bold">{formatBytes(totalBytes)}</span>
              </span>
            </div>

            <div className="flex items-center gap-4">
              {/* Donut Chart with Radial Swipe-Open Mask */}
              <div className="relative flex-shrink-0 w-28 h-28 flex items-center justify-center">
                <svg viewBox="0 0 100 100" className="w-28 h-28 transform -rotate-90">
                  <defs>
                    <mask id="storage-pie-swipe-mask">
                      <rect width="100" height="100" fill="black" />
                      <circle
                        cx="50"
                        cy="50"
                        r={RADIUS}
                        fill="none"
                        stroke="white"
                        strokeWidth="20"
                        style={{
                          strokeDasharray: isAnimated ? `${CIRCUMFERENCE} 0` : `0 ${CIRCUMFERENCE}`,
                          transition: 'stroke-dasharray 850ms cubic-bezier(0.16, 1, 0.3, 1)',
                        }}
                      />
                    </mask>
                  </defs>

                  {/* Background track */}
                  <circle
                    cx="50"
                    cy="50"
                    r={RADIUS}
                    fill="none"
                    stroke="#202c33"
                    strokeWidth="14"
                  />

                  {/* Masked radial swipe-open slices */}
                  <g mask="url(#storage-pie-swipe-mask)">
                    {totalBytes > 0 &&
                      chartSlices.map((slice) =>
                        slice.fraction > 0 ? (
                          <circle
                            key={slice.key}
                            cx="50"
                            cy="50"
                            r={RADIUS}
                            fill="none"
                            stroke={slice.color}
                            strokeWidth="14"
                            strokeDasharray={slice.dashArray}
                            strokeDashoffset={slice.dashOffset}
                          />
                        ) : null
                      )}
                  </g>
                </svg>

                {/* Center text */}
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-1 transition-all duration-700 ease-out"
                  style={{
                    opacity: isAnimated ? 1 : 0,
                    transform: isAnimated ? 'scale(1)' : 'scale(0.85)',
                  }}
                >
                  <span className="text-[9px] text-[#8696a0] font-medium leading-none mb-0.5">Used</span>
                  <span className="text-[11px] font-bold text-[#e9edef] leading-tight truncate max-w-[65px]">
                    {formatBytes(totalBytes)}
                  </span>
                </div>
              </div>

              {/* Legend */}
              <div className="flex-1 min-w-0 space-y-2">
                {chartSlices.map((item, idx) => (
                  <div
                    key={item.key}
                    className="flex flex-col text-[10px] transition-all ease-out"
                    style={{
                      opacity: isAnimated ? 1 : 0,
                      transform: isAnimated ? 'translateX(0)' : 'translateX(8px)',
                      transitionDuration: '500ms',
                      transitionDelay: `${150 + idx * 80}ms`,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="font-semibold text-[#e9edef] truncate">{item.label}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                        <span className="text-[#8696a0] text-[9px]">
                          {totalBytes > 0 ? `${item.percentage}%` : '0%'}
                        </span>
                        <span className="font-bold text-[#e9edef]">
                          {formatBytes(item.value)}
                        </span>
                      </div>
                    </div>
                    <div className="text-[9px] text-[#8696a0] pl-4 truncate mt-0.5">
                      {item.desc}
                    </div>
                  </div>
                ))}
              </div>
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
