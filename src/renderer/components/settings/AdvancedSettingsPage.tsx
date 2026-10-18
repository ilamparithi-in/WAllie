import React, { useState, useEffect } from 'react';
import { Sliders, Link, Trash2, Check, ShieldAlert, Cpu, Network, Terminal, Info } from 'lucide-react';
import type { GlobalSettings } from '../../../preload';

interface AdvancedSettingsPageProps {
  globalSettings: GlobalSettings | null;
  handleToggleGlobalSetting: (key: keyof GlobalSettings, value: any) => Promise<void> | void;
}

export const AdvancedSettingsPage: React.FC<AdvancedSettingsPageProps> = ({
  globalSettings,
  handleToggleGlobalSetting,
}) => {
  const isLinkPreviewEnabled = globalSettings?.standaloneLinkPreviewEnabled !== false;
  const [cacheCount, setCacheCount] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearedNotice, setClearedNotice] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI?.getLinkPreviewCacheSize?.().then((count) => {
      setCacheCount(count);
    }).catch(() => {});
  }, []);

  const handleClearCache = async () => {
    setClearing(true);
    try {
      const res = await window.electronAPI?.clearLinkPreviewCache?.();
      const count = res?.clearedCount ?? 0;
      setCacheCount(0);
      setClearedNotice(count > 0 ? `Cleared ${count} cached link${count === 1 ? '' : 's'}` : 'Cache is empty');
      setTimeout(() => setClearedNotice(null), 3000);
    } catch {
      setClearedNotice('Failed to clear');
      setTimeout(() => setClearedNotice(null), 3000);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-5 subpage-animate max-w-full">
      {/* Page Header */}
      <div>
        <h3 className="text-sm font-semibold text-[#e9edef] border-b border-[#222d34] pb-2 flex items-center gap-2">
          <Sliders className="w-4 h-4 text-[#00a884]" />
          <span>Advanced Settings</span>
        </h3>
        <p className="text-[11px] text-[#8696a0] mt-2 mb-1 leading-relaxed">
          Configure experimental desktop engine capabilities, network behavior, and client-side hooks.
        </p>
      </div>

      {/* Main Feature Container */}
      <div className="bg-[#182229] border border-[#222d34] rounded-xl overflow-hidden shadow-sm">
        {/* Top Feature Header & Toggle */}
        <div className="p-4 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-[#00a884]/10 text-[#00a884] border border-[#00a884]/20 shrink-0 mt-0.5">
              <Link className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-[#e9edef] text-[13px] tracking-tight">
                  Standalone Desktop Link Previews
                </span>
                <span
                  className={`text-[9px] font-semibold px-2 py-0.5 rounded-full transition-colors ${
                    isLinkPreviewEnabled
                      ? 'bg-[#00a884]/20 text-[#00a884] border border-[#00a884]/30'
                      : 'bg-[#8696a0]/20 text-[#8696a0] border border-[#8696a0]/30'
                  }`}
                >
                  {isLinkPreviewEnabled ? 'Active' : 'Disabled'}
                </span>
              </div>
              <p className="text-[11px] text-[#8696a0] leading-relaxed pr-2">
                Scrapes OpenGraph metadata and renders rich link cards locally on your Linux desktop without relying on peer-to-peer Signal requests to your primary phone. Eliminates 7-second timeouts when your phone is unreachable, offline, or being repaired.
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={isLinkPreviewEnabled}
              onChange={(e) => handleToggleGlobalSetting('standaloneLinkPreviewEnabled', e.target.checked)}
            />
            <div className="w-9 h-5 bg-[#2a3942] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#e9edef] after:border-[#2a3942] after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#00a884]"></div>
          </label>
        </div>

        {/* Feature Spec Badges */}
        <div className="px-4 py-2.5 bg-[#141d22] border-t border-b border-[#222d34]/70 flex flex-wrap items-center gap-2 text-[10px] text-[#8696a0]">
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#182229] border border-[#222d34] text-[#cfd9df]">
            <Network className="w-3 h-3 text-[#00a884]" />
            Direct Desktop HTTP Fetch
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#182229] border border-[#222d34] text-[#cfd9df]">
            <Cpu className="w-3 h-3 text-[#00a884]" />
            Local JPEG Thumbnailer (≤30KB)
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#182229] border border-[#222d34] text-[#cfd9df]">
            <Terminal className="w-3 h-3 text-[#00a884]" />
            Main-World Action Hook
          </span>
        </div>

        {/* Cache Management Row */}
        <div className="px-4 py-3 bg-[#182229] flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="text-[12px] font-medium text-[#e9edef] flex items-center gap-2">
              <span>Preview Cache</span>
              {cacheCount !== null && (
                <span className="text-[10px] text-[#8696a0] font-normal bg-[#111b21] px-2 py-0.5 rounded border border-[#222d34]">
                  {cacheCount} {cacheCount === 1 ? 'item' : 'items'} in memory
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#8696a0]">
              Flushes cached OpenGraph models and thumbnail buffers to force fresh re-scraping.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {clearedNotice && (
              <span className="text-[11px] text-[#00a884] flex items-center gap-1 font-medium">
                <Check className="w-3.5 h-3.5" />
                {clearedNotice}
              </span>
            )}
            <button
              type="button"
              onClick={handleClearCache}
              disabled={clearing}
              className="px-3 py-1.5 rounded-lg bg-[#222d34] hover:bg-[#2a3942] active:bg-[#32424b] text-[#e9edef] text-[11px] font-medium border border-[#2a3942] hover:border-[#00a884]/40 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
              title="Flush in-memory link preview cache"
            >
              <Trash2 className="w-3.5 h-3.5 text-[#f15c6d]" />
              <span>{clearing ? 'Clearing...' : 'Clear Cache'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Disclaimers & Security Details Callout */}
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.04] p-3.5 space-y-2.5">
        <div className="flex items-center gap-2 text-amber-400 font-medium text-[12px]">
          <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
          <span>Security & Privacy Disclaimers</span>
        </div>

        <ul className="space-y-2 text-[11px] text-[#8696a0] leading-relaxed pl-1">
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80 shrink-0 mt-1.5"></span>
            <span>
              <strong className="text-[#e9edef] font-medium">Client IP & Network Exposure:</strong> Generating previews locally causes your desktop client to send direct HTTP/HTTPS requests to the shared URL's host server. This exposes your device's public IP address, TLS fingerprint, and headers to that website before you even send the message. Native WhatsApp normally proxies these requests through your primary phone or WhatsApp infrastructure.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80 shrink-0 mt-1.5"></span>
            <span>
              <strong className="text-[#e9edef] font-medium">Client-Side JavaScript Hooking:</strong> WAllie injects an interceptor into WhatsApp Web's main-world JavaScript runtime (<code className="px-1.5 py-0.5 rounded bg-[#111b21] border border-[#222d34] text-[10px] text-[#cfd9df] font-mono">WAWebLinkPreviewChatAction.getLinkPreview</code>) to substitute desktop OpenGraph models directly into the message composer.
            </span>
          </li>
        </ul>
      </div>

      {/* Architecture Context Note */}
      <div className="p-3.5 rounded-xl bg-[#202c33]/30 border border-[#222d34] flex items-start gap-2.5 text-[11px] text-[#8696a0] leading-relaxed">
        <Info className="w-4 h-4 text-[#00a884] shrink-0 mt-0.5" />
        <div>
          <strong className="text-[#e9edef] font-medium">Desktop Parity Note:</strong> Official WhatsApp Web runs inside a browser sandbox and cannot make cross-origin requests. WhatsApp Desktop for Windows works around this by using a native C++ Edge WebView2 bridge (<code className="px-1 py-0.5 rounded bg-[#111b21] text-[10px] text-[#cfd9df] font-mono">cr:17219.getWindowsBridge().linksPreview</code>) to scrape previews locally. WAllie provides the equivalent bridge architecture on Linux.
        </div>
      </div>
    </div>
  );
};
