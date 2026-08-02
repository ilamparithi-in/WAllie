import React, { useState } from 'react';
import { Puzzle, FolderOpen, X, RefreshCw } from 'lucide-react';
import type { AccountInfo, GlobalSettings } from '../../../preload';

interface ExtensionsSettingsPageProps {
  accounts: AccountInfo[];
  selectedAccountId: string;
  setSelectedAccountId: (id: string) => void;
  globalSettings: GlobalSettings | null;
  handleToggleGlobalSetting: (key: keyof GlobalSettings, value: any) => Promise<void> | void;
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
  handleRemoveExtension: (extId: string) => Promise<void> | void;
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
  handleRemoveExtension,
}) => {
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
    <div className="flex flex-col h-full space-y-4 subpage-animate">
      <div className="flex-shrink-0">
        <h3 className="text-sm font-semibold text-[#e9edef] border-b border-[#222d34] pb-2 flex items-center gap-1.5">
          <Puzzle className="w-4 h-4 text-[#00a884]" />
          <span>Chrome Extensions</span>
        </h3>
        <p className="text-[11px] text-[#8696a0] mt-2 mb-3 leading-relaxed">
          Manage helper extensions, load unpacked directories, or install directly from the Chrome Web Store.
        </p>
      </div>

      {/* Unified Account & Settings Controls Banner */}
      <div className="p-3 bg-[#182229] border border-[#222d34] rounded-lg mb-4 flex-shrink-0 flex flex-wrap items-center justify-between gap-3">
        {/* Left: Target Account Selector */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-xs text-[#e9edef] whitespace-nowrap">Target Account:</span>
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="bg-[#202c33] text-[#e9edef] px-3 py-1.5 rounded border border-[#222d34] text-[11px] outline-none focus:border-[#00a884] cursor-pointer font-medium max-w-[150px] truncate"
          >
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.emoji ? `${acc.emoji} ` : ''}{acc.name}
              </option>
            ))}
          </select>
        </div>

        {/* Right: Toggles & Import Action */}
        <div className="flex items-center gap-3.5 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs text-[#e9edef] whitespace-nowrap">Developer Mode:</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={globalSettings?.extensionDevMode ?? false}
                onChange={() => handleToggleGlobalSetting('extensionDevMode', !(globalSettings?.extensionDevMode))}
                className="sr-only peer"
              />
              <div className="w-7 h-4 bg-[#202c33] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#8696a0] after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#00a884] peer-checked:after:bg-[#111b21] peer-checked:after:border-[#00a884]"></div>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs text-[#e9edef] whitespace-nowrap">Auto-update:</span>
            <label className="relative inline-flex items-center cursor-pointer" title="Automatically check for and update Web Store extensions">
              <input
                type="checkbox"
                checked={globalSettings?.autoUpdateExtensions ?? true}
                onChange={() => handleToggleGlobalSetting('autoUpdateExtensions', !(globalSettings?.autoUpdateExtensions ?? true))}
                className="sr-only peer"
              />
              <div className="w-7 h-4 bg-[#202c33] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#8696a0] after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#00a884] peer-checked:after:bg-[#111b21] peer-checked:after:border-[#00a884]"></div>
            </label>
          </div>

          {globalSettings?.extensionDevMode && (
            <div className="relative">
              <button
                onClick={() => setShowImportDropdown(!showImportDropdown)}
                disabled={isImporting || !selectedAccountId}
                className="flex items-center justify-center p-1.5 bg-[#00a884] text-[#111b21] hover:bg-[#00c298] disabled:opacity-50 rounded transition-colors"
                title="Import Local Extension (Folder, ZIP, or CRX)"
              >
                <FolderOpen className="w-4 h-4" />
              </button>

              {showImportDropdown && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowImportDropdown(false)}
                  />
                  <div className="absolute right-0 mt-1 w-44 bg-[#202c33] border border-[#374248] rounded shadow-xl z-50 text-[11px] py-1">
                    <button
                      onClick={() => {
                        setShowImportDropdown(false);
                        handleImportExtension('folder');
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-[#182229] text-[#e9edef] transition-colors"
                    >
                      Unpacked Folder...
                    </button>
                    <button
                      onClick={() => {
                        setShowImportDropdown(false);
                        handleImportExtension('archive');
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-[#182229] text-[#e9edef] transition-colors"
                    >
                      ZIP / CRX File...
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Chrome Web Store Installer Card */}
      <div className="mb-4 bg-[#182229] border border-[#222d34] rounded-lg p-3 flex-shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="font-semibold text-xs text-[#e9edef]">Chrome Web Store</div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleCheckUpdates}
              disabled={isCheckingUpdates || !selectedAccountId}
              className="text-[#00a884] hover:text-[#00c298] disabled:opacity-50 text-[10px] font-bold transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap"
              title="Check for Web Store extension updates"
            >
              <RefreshCw className={`w-3 h-3 ${isCheckingUpdates ? 'animate-spin' : ''}`} />
              <span>{isCheckingUpdates ? 'Checking...' : 'Check Updates'}</span>
            </button>
            <button
              onClick={handleBrowseWebStore}
              disabled={!selectedAccountId}
              className="text-[#00a884] hover:text-[#00c298] disabled:opacity-50 text-[10px] font-bold transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <Puzzle className="w-3 h-3" />
              <span>Browse Web Store...</span>
            </button>
          </div>
        </div>

        {updateStatusMsg && (
          <div className="text-[10px] text-[#00a884] bg-[#00a884]/10 border border-[#00a884]/20 p-1.5 rounded mb-2 font-medium">
            {updateStatusMsg}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Paste Web Store URL or 32-char Extension ID..."
            value={webstoreUrlOrId}
            onChange={(e) => setWebstoreUrlOrId(e.target.value)}
            disabled={isInstallingWebStore || !selectedAccountId}
            className="flex-1 min-w-0 bg-[#202c33] text-[#e9edef] px-3 py-1.5 rounded border border-[#222d34] text-[11px] outline-none focus:border-[#00a884] disabled:opacity-50"
          />
          <button
            onClick={handleInstallWebStoreExtension}
            disabled={isInstallingWebStore || !webstoreUrlOrId.trim() || !selectedAccountId}
            className="px-3 py-1.5 bg-[#00a884] text-[#111b21] hover:bg-[#00c298] disabled:opacity-50 font-bold rounded transition-colors text-[11px] shrink-0"
          >
            {isInstallingWebStore ? 'Installing...' : 'Install'}
          </button>
        </div>
      </div>

      {/* Extensions List */}
      <div className="flex-grow overflow-y-auto space-y-2 pr-1">
        {extensions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-[#8696a0]">
            <Puzzle className="w-12 h-12 mb-3 text-[#202c33]" />
            <p className="font-medium text-[#d1d7db] mb-1">No Extensions Loaded</p>
            <p className="text-[11px] max-w-[320px] leading-relaxed">
              Import unpacked directories, ZIP archives, or CRX packages to run helper extensions (e.g. privacy sheets, message backup tools) in this session.
            </p>
          </div>
        ) : (
          extensions.map((ext) => (
            <div
              key={ext.id}
              className="flex items-center justify-between p-3 bg-[#182229] border border-[#222d34] rounded-lg hover:border-[#374248] transition-colors gap-3"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-8 h-8 rounded bg-[#202c33] flex items-center justify-center text-[#00a884] shrink-0">
                  <Puzzle className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-xs text-[#e9edef] truncate" title={ext.name}>
                    {ext.name}
                  </div>
                  <div className="text-[10px] text-[#8696a0] mt-1 flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-[#aebac1]">v{ext.version}</span>
                    <span className="text-[#374248]">•</span>
                    {ext.source === 'webstore' ? (
                      <span className="text-[9px] bg-[#00a884]/15 text-[#00a884] border border-[#00a884]/20 px-1.5 py-0.5 rounded font-semibold select-none whitespace-nowrap">
                        Web Store
                      </span>
                    ) : (
                      <span className="text-[9px] bg-[#eab308]/15 text-[#eab308] border border-[#eab308]/20 px-1.5 py-0.5 rounded font-semibold select-none whitespace-nowrap">
                        Developer
                      </span>
                    )}
                    <span className="text-[#374248]">•</span>
                    <button
                      type="button"
                      onClick={(e) => handleCopyId(ext.id, e)}
                      className="truncate max-w-[130px] font-mono text-[9px] bg-[#111b21] hover:bg-[#202c33] text-[#8696a0] hover:text-[#e9edef] px-1.5 py-0.5 rounded cursor-pointer transition-colors border border-transparent hover:border-[#374248] active:scale-95 select-none"
                      title={
                        copiedId === ext.id
                          ? 'Copied ID to clipboard!'
                          : `Click to copy ID: ${ext.id}${globalSettings?.extensionDevMode && ext.path ? `\nPath: ${ext.path}` : ''}`
                      }
                    >
                      {copiedId === ext.id ? 'Copied!' : `ID: ${ext.id}`}
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ext.enabled}
                    onChange={() => handleToggleExtension(ext.id, !ext.enabled)}
                    className="sr-only peer"
                  />
                  <div className="w-7 h-4 bg-[#202c33] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#8696a0] after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#00a884] peer-checked:after:bg-[#111b21] peer-checked:after:border-[#00a884]"></div>
                </label>
                <button
                  onClick={() => handleRemoveExtension(ext.id)}
                  className="p-1.5 rounded hover:bg-[#202c33] text-[#8696a0] hover:text-[#ea4335] transition-colors"
                  title="Delete extension"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
