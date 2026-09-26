import React, { useState, useMemo, useEffect } from 'react';
import { Settings as SettingsIcon, Shield, ExternalLink, Plus, Trash2, Search, ChevronLeft, ChevronRight, X, Bell } from 'lucide-react';
import type { GlobalSettings, AccountInfo } from '../../../preload';

interface GeneralSettingsPageProps {
  globalSettings: GlobalSettings | null;
  handleToggleGlobalSetting: (key: keyof GlobalSettings, value: any) => Promise<void> | void;
  accounts?: AccountInfo[];
}

const DOMAINS_PER_PAGE = 5;
const PRESET_SCALES = [80, 90, 100, 110, 125, 150, 200];
const PRESET_DISMISSAL_TIMES = [
  { value: -1, label: 'System Default' },
  { value: 5, label: '5 seconds' },
  { value: 10, label: '10 seconds (Default)' },
  { value: 20, label: '20 seconds' },
  { value: 0, label: 'Never auto-dismiss (Persistent)' },
];

export const GeneralSettingsPage: React.FC<GeneralSettingsPageProps> = ({
  globalSettings,
  handleToggleGlobalSetting,
  accounts = [],
}) => {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const currentScale = globalSettings?.appScale ?? 100;
  const isCustomScale = !PRESET_SCALES.includes(currentScale);
  const [selectValue, setSelectValue] = useState<string>(isCustomScale ? 'custom' : currentScale.toString());
  const [customScaleInput, setCustomScaleInput] = useState<string>(currentScale.toString());

  useEffect(() => {
    setSelectValue(isCustomScale ? 'custom' : currentScale.toString());
    setCustomScaleInput(currentScale.toString());
  }, [currentScale, isCustomScale]);

  const handleSelectScaleChange = (val: string) => {
    setSelectValue(val);
    if (val !== 'custom') {
      const num = parseInt(val, 10);
      handleToggleGlobalSetting('appScale', num);
    }
  };

  const handleApplyCustomScale = () => {
    let num = parseInt(customScaleInput, 10);
    if (isNaN(num)) num = 100;
    num = Math.max(50, Math.min(300, num));
    handleToggleGlobalSetting('appScale', num);
  };

  const currentDismissalTime = globalSettings?.notificationDismissalTime ?? 10;
  const isCustomDismissal = !PRESET_DISMISSAL_TIMES.some((p) => p.value === currentDismissalTime);
  const [dismissalSelectValue, setDismissalSelectValue] = useState<string>(
    isCustomDismissal ? 'custom' : currentDismissalTime.toString()
  );
  const [customDismissalInput, setCustomDismissalInput] = useState<string>(currentDismissalTime.toString());

  useEffect(() => {
    setDismissalSelectValue(isCustomDismissal ? 'custom' : currentDismissalTime.toString());
    setCustomDismissalInput(currentDismissalTime.toString());
  }, [currentDismissalTime, isCustomDismissal]);

  const handleSelectDismissalChange = (val: string) => {
    setDismissalSelectValue(val);
    if (val !== 'custom') {
      const num = parseInt(val, 10);
      handleToggleGlobalSetting('notificationDismissalTime', num);
    }
  };

  const handleApplyCustomDismissal = () => {
    let num = parseInt(customDismissalInput, 10);
    if (isNaN(num)) num = 10;
    num = Math.max(0, Math.min(300, num));
    handleToggleGlobalSetting('notificationDismissalTime', num);
  };

  const trustedDomains = useMemo(() => {
    return globalSettings?.trustedDomains || ['whatsapp.com', 'whatsapp.net'];
  }, [globalSettings]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const candidateDomain = useMemo(() => {
    return debouncedQuery.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  }, [debouncedQuery]);

  const isAddEnabled = useMemo(() => {
    if (!candidateDomain) return false;
    return !trustedDomains.includes(candidateDomain);
  }, [candidateDomain, trustedDomains]);

  const filteredDomains = useMemo(() => {
    if (!query.trim()) return trustedDomains;
    const q = query.trim().toLowerCase();
    return trustedDomains.filter((d) => d.toLowerCase().includes(q));
  }, [trustedDomains, query]);

  const totalPages = Math.ceil(filteredDomains.length / DOMAINS_PER_PAGE) || 1;

  const paginatedDomains = useMemo(() => {
    const validPage = Math.min(currentPage, totalPages);
    const start = (validPage - 1) * DOMAINS_PER_PAGE;
    return filteredDomains.slice(start, start + DOMAINS_PER_PAGE);
  }, [filteredDomains, currentPage, totalPages]);

  const handleAddDomain = async () => {
    const candidate = query.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
    if (!candidate) return;
    if (!trustedDomains.includes(candidate)) {
      const updated = [...trustedDomains, candidate];
      await handleToggleGlobalSetting('trustedDomains', updated);
    }
    setQuery('');
    setDebouncedQuery('');
    setCurrentPage(1);
    window.electronAPI?.focusActiveAccount?.();
  };

  const handleRemoveDomain = async (domainToRemove: string) => {
    const updated = trustedDomains.filter((d) => d !== domainToRemove);
    await handleToggleGlobalSetting('trustedDomains', updated);
  };

  return (
    <div className="space-y-5 subpage-animate">
      <div>
        <h3 className="text-sm font-semibold text-[#e9edef] border-b border-[#222d34] pb-2 flex items-center gap-1.5">
          <SettingsIcon className="w-4 h-4 text-[#00a884]" />
          <span>General Settings</span>
        </h3>
        <p className="text-[11px] text-[#8696a0] mt-2 mb-4 leading-relaxed">
          Configure global behavior, system tray preferences, and hardware acceleration.
        </p>
        <div className="mt-2 space-y-2">
          <label className="flex items-center justify-between gap-4 cursor-pointer p-2 rounded hover:bg-[#182229] transition-colors">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-[#e9edef] text-[11px]">Close to System Tray</div>
              <div className="text-[10px] text-[#8696a0]">
                Keep app running in background tray icon mode on close
              </div>
            </div>
            <input
              type="checkbox"
              checked={globalSettings?.closeToTray ?? true}
              onChange={(e) => handleToggleGlobalSetting('closeToTray', e.target.checked)}
              className="accent-[#00a884] w-4 h-4 cursor-pointer flex-shrink-0 ml-2"
            />
          </label>

          <label className="flex items-center justify-between gap-4 cursor-pointer p-2 rounded hover:bg-[#182229] transition-colors">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-[#e9edef] text-[11px]">Start Minimized</div>
              <div className="text-[10px] text-[#8696a0]">
                Start application minimized to the system tray on launch
              </div>
            </div>
            <input
              type="checkbox"
              checked={globalSettings?.startMinimized ?? false}
              onChange={(e) => handleToggleGlobalSetting('startMinimized', e.target.checked)}
              className="accent-[#00a884] w-4 h-4 cursor-pointer flex-shrink-0 ml-2"
            />
          </label>

          <label className="flex items-center justify-between gap-4 cursor-pointer p-2 rounded hover:bg-[#182229] transition-colors">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-[#e9edef] text-[11px]">Hardware Acceleration</div>
              <div className="text-[10px] text-[#8696a0]">
                Use GPU acceleration (requires restart to apply)
              </div>
            </div>
            <input
              type="checkbox"
              checked={globalSettings?.hardwareAcceleration ?? true}
              onChange={(e) => handleToggleGlobalSetting('hardwareAcceleration', e.target.checked)}
              className="accent-[#00a884] w-4 h-4 cursor-pointer flex-shrink-0 ml-2"
            />
          </label>

          <div className="p-2 rounded hover:bg-[#182229] transition-colors space-y-2">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-[#e9edef] text-[11px]">App Scale (UI Zoom)</div>
                <div className="text-[10px] text-[#8696a0]">
                  Scale WAllie UI and default zoom level for WhatsApp viewports
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selectValue}
                  onChange={(e) => handleSelectScaleChange(e.target.value)}
                  className="bg-[#202c33] text-[#e9edef] text-xs px-2 py-1 rounded border border-[#2c3943] focus:border-[#00a884] focus:outline-none cursor-pointer"
                >
                  <option value="80">80%</option>
                  <option value="90">90%</option>
                  <option value="100">100% (Default)</option>
                  <option value="110">110%</option>
                  <option value="125">125%</option>
                  <option value="150">150%</option>
                  <option value="200">200%</option>
                  <option value="custom">Custom...</option>
                </select>

                {currentScale !== 100 && (
                  <button
                    type="button"
                    onClick={() => {
                      window.electronAPI?.resetAppScale();
                    }}
                    title="Reset App Scale to 100%"
                    className="px-2 py-1 bg-[#202c33] text-[#ea4335] border border-[#ea4335]/40 hover:bg-[#ea4335] hover:text-white transition-colors rounded text-[10px] font-semibold cursor-pointer shrink-0"
                  >
                    Reset (100%)
                  </button>
                )}
              </div>
            </div>

            {selectValue === 'custom' && (
              <div className="flex items-center justify-end gap-2 pt-1">
                <span className="text-[10px] text-[#8696a0]">Custom Percentage (%):</span>
                <input
                  type="number"
                  min={50}
                  max={300}
                  value={customScaleInput}
                  onChange={(e) => setCustomScaleInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleApplyCustomScale();
                  }}
                  className="w-20 bg-[#202c33] text-[#e9edef] text-xs px-2 py-1 rounded border border-[#2c3943] focus:border-[#00a884] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleApplyCustomScale}
                  className="px-3 py-1 bg-[#00a884] hover:bg-[#00c298] text-[#111b21] font-bold rounded text-xs transition-colors cursor-pointer"
                >
                  Apply
                </button>
              </div>
            )}
          </div>

          <label className="flex items-center justify-between gap-4 cursor-pointer p-2 rounded hover:bg-[#182229] transition-colors">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-[#e9edef] text-[11px]">Ctrl + Scroll to Zoom Scale</div>
              <div className="text-[10px] text-[#8696a0]">
                Use Ctrl + Mouse Wheel to change the app and view zoom scale (touchpad pinch-to-zoom is preserved)
              </div>
            </div>
            <input
              type="checkbox"
              checked={globalSettings?.ctrlScrollZoomEnabled ?? true}
              onChange={(e) => handleToggleGlobalSetting('ctrlScrollZoomEnabled', e.target.checked)}
              className="accent-[#00a884] w-4 h-4 cursor-pointer flex-shrink-0 ml-2"
            />
          </label>
        </div>

        {/* Desktop Notifications Section */}
        <div className="mt-6 pt-4 border-t border-[#222d34]">
          <h4 className="text-xs font-semibold text-[#e9edef] mb-1 flex items-center gap-1.5">
            <Bell className="w-3.5 h-3.5 text-[#00a884]" />
            <span>Desktop Notifications</span>
          </h4>
          <p className="text-[10px] text-[#8696a0] mb-3 leading-relaxed">
            Configure desktop alert behavior, inline replies, and dismissal duration.
          </p>

          <div className="space-y-2">
            <label className="flex items-center justify-between gap-4 cursor-pointer p-2 rounded hover:bg-[#182229] transition-colors">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-[#e9edef] text-[11px]">Enable Notification Logging</div>
                <div className="text-[10px] text-[#8696a0]">
                  Log desktop notifications, message edits, and deletions to history (disabled by default)
                </div>
              </div>
              <input
                type="checkbox"
                checked={globalSettings?.notificationLoggingEnabled ?? false}
                onChange={(e) => handleToggleGlobalSetting('notificationLoggingEnabled', e.target.checked)}
                className="accent-[#00a884] w-4 h-4 cursor-pointer flex-shrink-0 ml-2"
              />
            </label>

            <label className="flex items-center justify-between gap-4 cursor-pointer p-2 rounded hover:bg-[#182229] transition-colors">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-[#e9edef] text-[11px]">Inline Reply Notifications (KDE / Freedesktop)</div>
                <div className="text-[10px] text-[#8696a0]">
                  Allow replying directly from notification popups when supported by your desktop environment
                </div>
              </div>
              <input
                type="checkbox"
                checked={globalSettings?.inlineReplyEnabled ?? true}
                onChange={(e) => handleToggleGlobalSetting('inlineReplyEnabled', e.target.checked)}
                className="accent-[#00a884] w-4 h-4 cursor-pointer flex-shrink-0 ml-2"
              />
            </label>

            <div className="p-2 rounded hover:bg-[#182229] transition-colors space-y-2">
              <div>
                <div className="font-medium text-[#e9edef] text-[11px]">Notification Dismissal Time</div>
                <div className="text-[10px] text-[#8696a0] mt-0.5">
                  Duration desktop alerts remain on screen before closing automatically
                </div>
              </div>

              <div className="flex items-center gap-2 pt-0.5">
                <select
                  value={dismissalSelectValue}
                  onChange={(e) => handleSelectDismissalChange(e.target.value)}
                  className="bg-[#202c33] text-[#e9edef] text-xs px-2.5 py-1.5 rounded border border-[#2c3943] focus:border-[#00a884] focus:outline-none cursor-pointer flex-1 min-w-[150px]"
                >
                  {PRESET_DISMISSAL_TIMES.map((preset) => (
                    <option key={preset.value} value={preset.value.toString()}>
                      {preset.label}
                    </option>
                  ))}
                  <option value="custom">Custom...</option>
                </select>

                {(dismissalSelectValue === 'custom' || currentDismissalTime !== 10) && (
                  <button
                    type="button"
                    onClick={() => {
                      handleToggleGlobalSetting('notificationDismissalTime', 10);
                      setDismissalSelectValue('10');
                      setCustomDismissalInput('10');
                    }}
                    title="Reset notification dismissal timeout to 10 seconds"
                    className="px-2.5 py-1.5 bg-[#202c33] text-[#ea4335] border border-[#ea4335]/40 hover:bg-[#ea4335] hover:text-white transition-colors rounded text-[10px] font-semibold cursor-pointer shrink-0"
                  >
                    Reset (10s)
                  </button>
                )}
              </div>

              {dismissalSelectValue === 'custom' && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[10px] text-[#8696a0] shrink-0">Custom Duration (seconds, 0 for never):</span>
                  <input
                    type="number"
                    min={0}
                    max={300}
                    value={customDismissalInput}
                    onChange={(e) => setCustomDismissalInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleApplyCustomDismissal();
                    }}
                    className="w-20 bg-[#202c33] text-[#e9edef] text-xs px-2 py-1 rounded border border-[#2c3943] focus:border-[#00a884] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleApplyCustomDismissal}
                    className="px-3 py-1 bg-[#00a884] hover:bg-[#00c298] text-[#111b21] font-bold rounded text-xs transition-colors cursor-pointer"
                  >
                    Apply
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* External Links & Security Section */}
        <div className="mt-6 pt-4 border-t border-[#222d34]">
          <h4 className="text-xs font-semibold text-[#e9edef] mb-1 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-[#00a884]" />
            <span>External Links & Security</span>
          </h4>
          <p className="text-[10px] text-[#8696a0] mb-3 leading-relaxed">
            Configure safety prompts and trusted domains for opening external links.
          </p>

          <label className="flex items-center justify-between gap-4 cursor-pointer p-2 rounded hover:bg-[#182229] transition-colors">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-[#e9edef] text-[11px]">Warn Before Opening External Links</div>
              <div className="text-[10px] text-[#8696a0] leading-normal">
                Show system prompt before visiting untrusted links. When disabled, links open with a toast notification.
              </div>
            </div>
            <input
              type="checkbox"
              checked={globalSettings?.externalLinkWarningEnabled ?? true}
              onChange={(e) => handleToggleGlobalSetting('externalLinkWarningEnabled', e.target.checked)}
              className="accent-[#00a884] w-4 h-4 cursor-pointer flex-shrink-0 ml-2"
            />
          </label>

          {accounts.length > 0 && (
            <div className="flex items-center justify-between gap-4 p-2 rounded hover:bg-[#182229] transition-colors mt-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-[#e9edef] text-[11px]">Default Account for WhatsApp Links</div>
                <div className="text-[10px] text-[#8696a0] leading-normal">
                  Select which account automatically opens when clicking external whatsapp:// links
                </div>
              </div>
              <select
                value={globalSettings?.defaultProtocolAccountId || 'ask'}
                onChange={(e) => handleToggleGlobalSetting('defaultProtocolAccountId', e.target.value)}
                className="bg-[#202c33] text-[#e9edef] px-2.5 py-1.5 rounded border border-[#222d34] text-[11px] outline-none focus:border-[#00a884] cursor-pointer ml-2"
              >
                <option value="ask">Ask Everytime</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.emoji ? `${acc.emoji} ` : ''}{acc.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="mt-4 p-3.5 bg-[#111b21] border border-[#222d34] rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-medium text-[#e9edef] text-[11px] flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5 text-[#00a884]" />
                <span>Trusted Domains</span>
              </div>
              <span className="text-[10px] text-[#8696a0] bg-[#182229] px-2 py-0.5 rounded border border-[#222d34]">
                {trustedDomains.length} {trustedDomains.length === 1 ? 'domain' : 'domains'}
              </span>
            </div>

            {/* Merged Search & Add Input Row */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#8696a0]" />
                <input
                  type="text"
                  placeholder="Search or add domain e.g. youtube.com..."
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  onBlur={() => {
                    window.electronAPI?.focusActiveAccount?.();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (isAddEnabled) {
                        handleAddDomain();
                      }
                    } else if (e.key === 'Escape') {
                      e.currentTarget.blur();
                      window.electronAPI?.focusActiveAccount?.();
                    }
                  }}
                  className="w-full bg-[#202c33] text-[#e9edef] text-xs pl-8 pr-7 py-2 rounded-lg border border-[#2c3943] focus:border-[#00a884] focus:outline-none placeholder-[#8696a0]"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setDebouncedQuery('');
                      setCurrentPage(1);
                    }}
                    className="absolute right-2 top-2 text-[#8696a0] hover:text-[#e9edef] p-0.5 rounded-md hover:bg-[#2c3943]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={handleAddDomain}
                disabled={!isAddEnabled}
                className="px-3.5 py-2 bg-[#00a884] hover:bg-[#00c298] disabled:opacity-30 disabled:hover:bg-[#00a884] text-[#111b21] font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Add</span>
              </button>
            </div>

            {/* Domain List Items */}
            <div className="space-y-1.5 min-h-[120px]">
              {paginatedDomains.map((domain) => (
                <div
                  key={domain}
                  className="flex items-center justify-between px-3 py-2 bg-[#1f2c34] rounded-lg border border-[#2c3943]/60 text-xs text-[#e9edef] hover:border-[#00a884]/40 transition-colors"
                >
                  <span className="font-mono text-[11px] text-[#00a884] truncate flex-1 min-w-0 pr-2">{domain}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveDomain(domain)}
                    title={`Remove ${domain} from trusted list`}
                    className="text-[#8696a0] hover:text-[#ea4335] transition-colors p-1.5 rounded-md hover:bg-[#202c33] shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {filteredDomains.length === 0 && (
                <p className="text-[11px] text-[#8696a0] italic text-center py-6">
                  {query ? `No domains match "${query}"` : 'No trusted domains configured.'}
                </p>
              )}
            </div>

            {/* Pagination Footer */}
            {filteredDomains.length > DOMAINS_PER_PAGE && (
              <div className="flex items-center justify-between pt-2 border-t border-[#222d34] text-[10px] text-[#8696a0]">
                <span>
                  Showing {((Math.min(currentPage, totalPages) - 1) * DOMAINS_PER_PAGE) + 1}-
                  {Math.min(currentPage * DOMAINS_PER_PAGE, filteredDomains.length)} of {filteredDomains.length}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="p-1 rounded bg-[#202c33] hover:bg-[#2c3943] disabled:opacity-30 disabled:hover:bg-[#202c33] text-[#e9edef] transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-1.5 font-medium text-[#e9edef]">
                    {Math.min(currentPage, totalPages)} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="p-1 rounded bg-[#202c33] hover:bg-[#2c3943] disabled:opacity-30 disabled:hover:bg-[#202c33] text-[#e9edef] transition-colors"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-[#222d34]">
          <h4 className="text-xs font-semibold text-[#e9edef] mb-1">Customize Toolbar</h4>
          <p className="text-[10px] text-[#8696a0] mb-3 leading-relaxed">
            Show or hide action buttons in the top toolbar (settings button is always shown).
          </p>
          <div className="space-y-2">
            <label className="flex items-center justify-between gap-4 cursor-pointer p-2 rounded hover:bg-[#182229] transition-colors">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-[#e9edef] text-[11px]">Refresh Button</div>
                <div className="text-[10px] text-[#8696a0]">
                  Show refresh icon to reload the active WhatsApp Web view
                </div>
              </div>
              <input
                type="checkbox"
                checked={globalSettings?.showRefreshButton ?? true}
                onChange={(e) => handleToggleGlobalSetting('showRefreshButton', e.target.checked)}
                className="accent-[#00a884] w-4 h-4 cursor-pointer flex-shrink-0 ml-2"
              />
            </label>

            <label className="flex items-center justify-between gap-4 cursor-pointer p-2 rounded hover:bg-[#182229] transition-colors">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-[#e9edef] text-[11px]">Developer Tools Button</div>
                <div className="text-[10px] text-[#8696a0]">
                  Show code icon in the titlebar to toggle developer tools
                </div>
              </div>
              <input
                type="checkbox"
                checked={globalSettings?.showDevToolsToggle ?? false}
                onChange={(e) => handleToggleGlobalSetting('showDevToolsToggle', e.target.checked)}
                className="accent-[#00a884] w-4 h-4 cursor-pointer flex-shrink-0 ml-2"
              />
            </label>

            <label className="flex items-center justify-between gap-4 cursor-pointer p-2 rounded hover:bg-[#182229] transition-colors">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-[#e9edef] text-[11px]">Notification History Button</div>
                <div className="text-[10px] text-[#8696a0]">
                  Show bell icon in the titlebar to open notification history
                </div>
              </div>
              <input
                type="checkbox"
                checked={globalSettings?.showNotificationHistoryButton ?? true}
                onChange={(e) => handleToggleGlobalSetting('showNotificationHistoryButton', e.target.checked)}
                className="accent-[#00a884] w-4 h-4 cursor-pointer flex-shrink-0 ml-2"
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
