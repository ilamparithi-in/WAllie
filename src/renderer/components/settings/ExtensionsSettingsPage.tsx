import React, { useState } from 'react';
import { Puzzle, FolderOpen, RefreshCw, Pin, Sliders, Trash2, Copy, Check, Globe } from 'lucide-react';
import type { AccountInfo, GlobalSettings } from '../../../preload';

interface ExtensionsSettingsPageProps {
  accounts: AccountInfo[];
  selectedAccountId: string;
  setSelectedAccountId: (id: string) => void;
  globalSettings: GlobalSettings | null;
  handleToggleGlobalSetting: (key: keyof GlobalSettings, value: any) => Promise<boolean | void> | boolean | void;
  showImportDropdown: boolean;
  setShowImportDropdown: (show: boolean) => void;
  isImporting: boolean;
  handleImportExtension: (importType: 'folder' | 'archive') => Promise<void> | void;
  handleBrowseWebStore: () => void;
  webstoreUrlOrId: string;
  setWebstoreUrlOrId: (val: string) => void;
  isInstallingWebStore: boolean;
  handleInstallWebStoreExtension: () => Promise<void> | void;
  extensions: any[];
  handleToggleExtension: (extId: string, enabled: boolean) => Promise<void> | void;
  handleToggleExtensionPin: (extId: string, pinned: boolean) => Promise<void> | void;
  handleRemoveExtension: (extId: string) => Promise<void> | void;
  onToggleShowExtensionsButton?: (accountId: string, show: boolean) => Promise<void> | void;
}

export const ExtensionsSettingsPage: React.FC<ExtensionsSettingsPageProps> = ({
  accounts,
  selectedAccountId,
  setSelectedAccountId,
  globalSettings,
  handleToggleGlobalSetting,
  showImportDropdown,
  setShowImportDropdown,
  isImporting,
  handleImportExtension,
  handleBrowseWebStore,
  webstoreUrlOrId,
  setWebstoreUrlOrId,
  isInstallingWebStore,
  handleInstallWebStoreExtension,
  extensions,
  handleToggleExtension,
  handleToggleExtensionPin,
  handleRemoveExtension,
  onToggleShowExtensionsButton,
}) => {
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState<boolean>(false);
  const [updateStatusMsg, setUpdateStatusMsg] = useState<string | null>(null);

  const handleCopyId = (extId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(extId).catch(() => {});
    setCopiedId(extId);
    setTimeout(() => {
      setCopiedId(null);
    }, 1500);
  };

  const handleCheckUpdates = async () => {
    if (isCheckingUpdates) return;
    setIsCheckingUpdates(true);
    setUpdateStatusMsg(null);
    try {
      const result = await window.electronAPI.checkExtensionUpdates(selectedAccountId);
      if (result.updatedCount > 0) {
        setUpdateStatusMsg(`Updated ${result.updatedCount} extension(s): ${result.updatedList.join(', ')}`);
      } else {
        setUpdateStatusMsg('All Web Store extensions are up to date.');
      }
    } catch (err) {
      setUpdateStatusMsg('Failed to check for extension updates.');
    } finally {
      setIsCheckingUpdates(false);
      setTimeout(() => setUpdateStatusMsg(null), 4000);
    }
  };

  return (
    <div className="space-y-4 subpage-animate">
      <div>
        <h3 className="text-sm font-semibold text-[#e9edef] border-b border-[#222d34] pb-2 flex items-center gap-1.5">
          <Puzzle className="w-4 h-4 text-[#00a884]" />
          <span>Chrome Extensions</span>
        </h3>
        <p className="text-[11px] text-[#8696a0] mt-2 mb-3 leading-relaxed">
          Manage helper extensions, load unpacked directories, or install directly from the Chrome Web Store.
        </p>
      </div>

      {/* Unified Account & Settings Controls Banner */}
      <div className="p-3.5 bg-[#182229] border border-[#222d34] rounded-xl flex flex-wrap items-center justify-between gap-3">
        {/* Left: Target Account Selector */}
        <div className="flex items-center gap-2.5 min-w-0">
          <label htmlFor="ext-target-account" className="font-semibold text-xs text-[#e9edef] whitespace-nowrap">
            Target Account:
          </label>
          <select
            id="ext-target-account"
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="bg-[#202c33] text-[#e9edef] px-3 py-1.5 rounded-lg border border-[#2a3942] text-xs outline-none focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884] cursor-pointer font-medium max-w-[180px] truncate"
          >
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.emoji ? `${acc.emoji} ` : ''}{acc.name}
              </option>
            ))}
          </select>
        </div>

        {/* Right: Toggles & Import Action */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="font-medium text-xs text-[#e9edef] whitespace-nowrap flex items-center gap-1.5">
              <Puzzle className="w-3.5 h-3.5 text-[#00a884]" />
              <span>Titlebar Button</span>
            </span>
            <label className="relative inline-flex items-center cursor-pointer select-none" title="Show extensions puzzle menu in titlebar when unpinned extensions are present for this account">
              <input
                type="checkbox"
                role="switch"
                aria-checked={selectedAccount?.showExtensionsButton !== false}
                aria-label="Show extensions titlebar button"
                checked={selectedAccount?.showExtensionsButton !== false}
                onChange={() => onToggleShowExtensionsButton?.(selectedAccountId, !(selectedAccount?.showExtensionsButton !== false))}
                className="sr-only peer"
              />
              <div className="w-8 h-4.5 bg-[#202c33] peer-focus-visible:ring-2 peer-focus-visible:ring-[#00a884]/60 rounded-full peer peer-checked:after:translate-x-3.5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#8696a0] after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-[#00a884] peer-checked:after:bg-[#111b21] peer-checked:after:border-[#00a884] border border-[#2c3943]"></div>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-medium text-xs text-[#e9edef] whitespace-nowrap">Developer Mode</span>
            <label className="relative inline-flex items-center cursor-pointer select-none" title="Enable developer mode for loading local extensions">
              <input
                type="checkbox"
                role="switch"
                aria-checked={globalSettings?.extensionDevMode ?? false}
                aria-label="Developer Mode"
                checked={globalSettings?.extensionDevMode ?? false}
                onChange={() => handleToggleGlobalSetting('extensionDevMode', !(globalSettings?.extensionDevMode))}
                className="sr-only peer"
              />
              <div className="w-8 h-4.5 bg-[#202c33] peer-focus-visible:ring-2 peer-focus-visible:ring-[#00a884]/60 rounded-full peer peer-checked:after:translate-x-3.5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#8696a0] after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-[#00a884] peer-checked:after:bg-[#111b21] peer-checked:after:border-[#00a884] border border-[#2c3943]"></div>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-medium text-xs text-[#e9edef] whitespace-nowrap">Auto-update</span>
            <label className="relative inline-flex items-center cursor-pointer select-none" title="Automatically check for and update Web Store extensions">
              <input
                type="checkbox"
                role="switch"
                aria-checked={globalSettings?.autoUpdateExtensions ?? true}
                aria-label="Auto-update Web Store extensions"
                checked={globalSettings?.autoUpdateExtensions ?? true}
                onChange={() => handleToggleGlobalSetting('autoUpdateExtensions', !(globalSettings?.autoUpdateExtensions ?? true))}
                className="sr-only peer"
              />
              <div className="w-8 h-4.5 bg-[#202c33] peer-focus-visible:ring-2 peer-focus-visible:ring-[#00a884]/60 rounded-full peer peer-checked:after:translate-x-3.5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#8696a0] after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-[#00a884] peer-checked:after:bg-[#111b21] peer-checked:after:border-[#00a884] border border-[#2c3943]"></div>
            </label>
          </div>

          {globalSettings?.extensionDevMode && (
            <div className="relative">
              <button
                onClick={() => setShowImportDropdown(!showImportDropdown)}
                disabled={isImporting || !selectedAccountId}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#00a884] text-[#111b21] hover:bg-[#00c298] disabled:opacity-50 rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-xs active:scale-95"
                title="Import Local Extension (Folder, ZIP, or CRX)"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Load Unpacked...</span>
              </button>

              {showImportDropdown && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowImportDropdown(false)}
                  />
                  <div className="absolute right-0 mt-1 w-48 bg-[#202c33] border border-[#374248] rounded-xl shadow-2xl z-50 text-xs py-1.5 overflow-hidden">
                    <button
                      onClick={() => {
                        setShowImportDropdown(false);
                        handleImportExtension('folder');
                      }}
                      className="w-full text-left px-3.5 py-2 hover:bg-[#182229] text-[#e9edef] transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-[#00a884]" />
                      <span>Unpacked Folder...</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowImportDropdown(false);
                        handleImportExtension('archive');
                      }}
                      className="w-full text-left px-3.5 py-2 hover:bg-[#182229] text-[#e9edef] transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <Puzzle className="w-3.5 h-3.5 text-[#53bdeb]" />
                      <span>ZIP / CRX File...</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Chrome Web Store Installer Card */}
      <div className="bg-[#182229] border border-[#222d34] rounded-xl p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
          <div className="font-semibold text-xs text-[#e9edef] flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-[#00a884]" />
            <span>Chrome Web Store</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleCheckUpdates}
              disabled={isCheckingUpdates || !selectedAccountId}
              className="text-[#00a884] hover:text-[#00c298] disabled:opacity-50 text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap"
              title="Check for Web Store extension updates"
            >
              <RefreshCw className={`w-3 h-3 ${isCheckingUpdates ? 'animate-spin' : ''}`} />
              <span>{isCheckingUpdates ? 'Checking Updates...' : 'Check Updates'}</span>
            </button>
            <button
              onClick={handleBrowseWebStore}
              disabled={!selectedAccountId}
              className="text-[#00a884] hover:text-[#00c298] disabled:opacity-50 text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <Puzzle className="w-3 h-3" />
              <span>Browse Web Store...</span>
            </button>
          </div>
        </div>

        {updateStatusMsg && (
          <div className="text-[11px] text-[#00a884] bg-[#00a884]/10 border border-[#00a884]/20 p-2 rounded-lg mb-2.5 font-medium leading-relaxed">
            {updateStatusMsg}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Paste Web Store URL or 32-character Extension ID..."
            value={webstoreUrlOrId}
            onChange={(e) => setWebstoreUrlOrId(e.target.value)}
            disabled={isInstallingWebStore || !selectedAccountId}
            className="flex-1 min-w-0 bg-[#202c33] text-[#e9edef] px-3.5 py-1.5 rounded-lg border border-[#2a3942] text-xs outline-none focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884] disabled:opacity-50 placeholder-[#8696a0]/60"
          />
          <button
            onClick={handleInstallWebStoreExtension}
            disabled={isInstallingWebStore || !webstoreUrlOrId.trim() || !selectedAccountId}
            className="px-4 py-1.5 bg-[#00a884] text-[#111b21] hover:bg-[#00c298] disabled:opacity-50 font-bold rounded-lg transition-colors text-xs shrink-0 cursor-pointer shadow-xs active:scale-95"
          >
            {isInstallingWebStore ? 'Installing...' : 'Install'}
          </button>
        </div>
      </div>

      {/* Extensions List */}
      <div className="space-y-3 pb-4">
        {extensions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-[#8696a0]">
            <Puzzle className="w-12 h-12 mb-3 text-[#202c33]" />
            <p className="font-medium text-[#d1d7db] mb-1">No Extensions Loaded</p>
            <p className="text-[11px] max-w-[320px] leading-relaxed">
              Import unpacked directories, ZIP archives, or CRX packages to run helper extensions in this session.
            </p>
          </div>
        ) : (
          extensions.map((ext) => (
            <article
              key={ext.id}
              className={`bg-[#182229] border rounded-xl p-4 transition-all flex flex-col gap-3 shadow-xs ${
                ext.enabled ? 'border-[#222d34] hover:border-[#2a3942]' : 'border-[#222d34]/60 opacity-75'
              }`}
            >
              {/* Header: Icon, Name, Version Badge, and Main Switch */}
              <header className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[#202c33] border border-[#2a3942] flex items-center justify-center text-[#00a884] shrink-0 overflow-hidden shadow-inner">
                    {ext.iconDataUrl ? (
                      <img src={ext.iconDataUrl} alt="" className="w-6 h-6 object-contain" />
                    ) : (
                      <Puzzle className="w-5 h-5 text-[#8696a0]" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-sm text-[#e9edef] tracking-tight truncate" title={ext.name}>
                        {ext.name}
                      </h4>
                      <span className="text-[11px] font-medium text-[#8696a0]">v{ext.version}</span>
                      {ext.isBuiltIn ? (
                        <span className="text-[10px] bg-[#53bdeb]/15 text-[#53bdeb] border border-[#53bdeb]/25 px-2 py-0.5 rounded-full font-semibold select-none whitespace-nowrap">
                          Built-in
                        </span>
                      ) : ext.source === 'webstore' ? (
                        <span className="text-[10px] bg-[#00a884]/15 text-[#00a884] border border-[#00a884]/25 px-2 py-0.5 rounded-full font-semibold select-none whitespace-nowrap">
                          Web Store
                        </span>
                      ) : (
                        <span className="text-[10px] bg-[#eab308]/15 text-[#eab308] border border-[#eab308]/25 px-2 py-0.5 rounded-full font-semibold select-none whitespace-nowrap">
                          Developer
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Primary Enable/Disable Switch */}
                <div className="flex items-center gap-2 shrink-0 pt-0.5">
                  <span className="text-[11px] text-[#8696a0] select-none font-medium hidden sm:inline">
                    {ext.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                  <label
                    className="relative inline-flex items-center cursor-pointer select-none"
                    title={ext.enabled ? 'Disable extension' : 'Enable extension'}
                  >
                    <input
                      type="checkbox"
                      role="switch"
                      aria-checked={ext.enabled}
                      aria-label={`Enable ${ext.name}`}
                      checked={ext.enabled}
                      onChange={() => handleToggleExtension(ext.id, !ext.enabled)}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4.5 bg-[#202c33] peer-focus-visible:ring-2 peer-focus-visible:ring-[#00a884]/60 rounded-full peer peer-checked:after:translate-x-3.5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#8696a0] after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-[#00a884] peer-checked:after:bg-[#111b21] peer-checked:after:border-[#00a884] border border-[#2c3943]"></div>
                  </label>
                </div>
              </header>

              {/* Description Content - Natural wrap, never truncated */}
              <div className="text-xs text-[#aebac1] leading-relaxed break-words">
                {ext.description || 'No description provided.'}
              </div>

              {/* ID & Details Row */}
              <div className="flex items-center gap-2 text-[10px] text-[#8696a0] flex-wrap">
                <span className="text-[#8696a0]">ID:</span>
                <button
                  type="button"
                  onClick={(e) => handleCopyId(ext.id, e)}
                  className="inline-flex items-center gap-1 font-mono text-[10px] bg-[#111b21] hover:bg-[#202c33] text-[#8696a0] hover:text-[#e9edef] px-2 py-0.5 rounded cursor-pointer transition-colors border border-[#222d34] hover:border-[#374248] active:scale-95"
                  title="Click to copy Extension ID"
                >
                  <span>{copiedId === ext.id ? 'Copied!' : ext.id}</span>
                  {copiedId === ext.id ? (
                    <Check className="w-3 h-3 text-[#00a884]" />
                  ) : (
                    <Copy className="w-3 h-3 opacity-60" />
                  )}
                </button>
                {globalSettings?.extensionDevMode && ext.path && (
                  <span className="truncate max-w-[280px] font-mono text-[9px] text-[#8696a0]/70" title={`Path: ${ext.path}`}>
                    Path: {ext.path}
                  </span>
                )}
              </div>

              {/* Footer Actions: Pin to Titlebar, Options, Uninstall */}
              <footer className="flex items-center justify-between pt-3 border-t border-[#222d34] mt-1 gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Pin to Titlebar Button */}
                  {ext.hasPopup && (
                    <button
                      type="button"
                      onClick={() => handleToggleExtensionPin(ext.id, ext.pinnedInTitlebar === false)}
                      disabled={!ext.enabled}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a884]/60 ${
                        !ext.enabled
                          ? 'opacity-40 cursor-not-allowed bg-transparent text-[#8696a0] border border-transparent'
                          : ext.pinnedInTitlebar !== false
                          ? 'bg-[#00a884]/15 text-[#e9edef] border border-[#00a884]/40 hover:bg-[#00a884]/25 shadow-xs'
                          : 'bg-[#202c33] text-[#e9edef] hover:bg-[#2a3942] border border-[#2a3942] hover:border-[#00a884]/40'
                      }`}
                      title={
                        !ext.enabled
                          ? 'Enable extension to pin to titlebar'
                          : ext.pinnedInTitlebar !== false
                          ? 'Pinned to titlebar (click to unpin)'
                          : 'Pin to titlebar'
                      }
                      aria-label={ext.pinnedInTitlebar !== false ? 'Unpin from titlebar' : 'Pin to titlebar'}
                      aria-pressed={ext.pinnedInTitlebar !== false}
                    >
                      <Pin className={`w-3.5 h-3.5 ${ext.pinnedInTitlebar !== false ? 'fill-current text-[#00a884]' : 'text-[#00a884]'}`} />
                      <span>{ext.pinnedInTitlebar !== false ? 'Pinned to Titlebar' : 'Pin to Titlebar'}</span>
                    </button>
                  )}

                  {/* Options Button */}
                  {ext.hasPopup && ext.enabled && (
                    <button
                      type="button"
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        window.electronAPI?.openExtensionPopup(selectedAccountId, ext.id, {
                          x: rect.left,
                          y: rect.top,
                          width: rect.width,
                          height: rect.height,
                        });
                      }}
                      className="px-2.5 py-1.5 bg-[#202c33] hover:bg-[#2a3942] active:scale-[0.98] text-[#e9edef] hover:text-[#00a884] rounded-lg text-xs font-medium border border-[#2a3942] hover:border-[#00a884]/40 transition-all cursor-pointer flex items-center gap-1.5 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a884]/60"
                      title="Open extension popup options"
                    >
                      <Sliders className="w-3.5 h-3.5 text-[#00a884]" />
                      <span>Options</span>
                    </button>
                  )}
                </div>

                {/* Right Actions: Remove */}
                {!ext.isBuiltIn && (
                  <button
                    type="button"
                    onClick={() => handleRemoveExtension(ext.id)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#8696a0] hover:text-[#ef4444] bg-[#202c33]/40 hover:bg-[#ef4444]/15 border border-[#2a3942] hover:border-[#ef4444]/30 transition-all cursor-pointer flex items-center gap-1.5 ml-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ef4444]/60"
                    title="Uninstall extension"
                    aria-label={`Uninstall ${ext.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Uninstall</span>
                  </button>
                )}
              </footer>
            </article>
          ))
        )}
      </div>
    </div>
  );
};
