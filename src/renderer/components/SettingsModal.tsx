import React, { useState, useEffect } from 'react';
import { X, Puzzle, Palette, Database, Bell, Settings as SettingsIcon, Plus } from 'lucide-react';
import type { AccountInfo } from '../../preload';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'extensions' | 'css' | 'storage' | 'notifications' | 'general';

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [showImportDropdown, setShowImportDropdown] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;

    // Fetch accounts and active account on open
    window.electronAPI?.getAccounts().then((accs) => {
      setAccounts(accs);
    });

    window.electronAPI?.getActiveAccountId().then((activeId) => {
      setSelectedAccountId(activeId);
    });

    // Listen for real-time account list changes
    const unsubscribeAccount = window.electronAPI?.onAccountListChanged((updatedAccounts, updatedActiveId) => {
      setAccounts(updatedAccounts);
      // Stay locked onto a valid account if current one got removed
      if (!updatedAccounts.find((a) => a.id === selectedAccountId)) {
        setSelectedAccountId(updatedActiveId);
      }
    });

    return () => {
      unsubscribeAccount?.();
    };
  }, [isOpen, selectedAccountId]);

  if (!isOpen) return null;

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const extensions = selectedAccount?.extensions || [];

  const handleImportExtension = async (importType: 'folder' | 'archive') => {
    if (!selectedAccountId) return;
    setIsImporting(true);
    try {
      await window.electronAPI.importExtension(selectedAccountId, importType);
    } catch (err) {
      console.error('Import extension error:', err);
    } finally {
      setIsImporting(false);
    }
  };

  const handleToggleExtension = async (extId: string, enabled: boolean) => {
    if (!selectedAccountId) return;
    try {
      await window.electronAPI.toggleExtension(selectedAccountId, extId, enabled);
    } catch (err) {
      console.error('Toggle extension error:', err);
    }
  };

  const handleRemoveExtension = async (extId: string) => {
    if (!selectedAccountId) return;
    try {
      await window.electronAPI.removeExtension(selectedAccountId, extId);
    } catch (err) {
      console.error('Remove extension error:', err);
    }
  };

  return (
    <div
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 select-text"
    >
      <div className="w-full max-w-2xl bg-[#111b21] border border-[#222d34] rounded-lg shadow-2xl overflow-hidden flex flex-col h-[520px]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#222d34] bg-[#202c33]">
          <div className="flex items-center gap-2 text-[#e9edef] font-medium text-sm">
            <SettingsIcon className="w-4 h-4 text-[#00a884]" />
            <span>Application Settings</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[#111b21] text-[#8696a0] hover:text-[#e9edef] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Tabs */}
          <div className="w-48 bg-[#111b21] border-r border-[#222d34] p-2 flex flex-col gap-1 text-xs">
            <button
              onClick={() => setActiveTab('general')}
              className={`flex items-center gap-2.5 px-3 py-2 rounded font-medium transition-colors text-left ${
                activeTab === 'general'
                  ? 'bg-[#202c33] text-[#00a884]'
                  : 'text-[#8696a0] hover:bg-[#182229] hover:text-[#e9edef]'
              }`}
            >
              <SettingsIcon className="w-4 h-4" />
              <span>General</span>
            </button>

            <button
              onClick={() => setActiveTab('extensions')}
              className={`flex items-center gap-2.5 px-3 py-2 rounded font-medium transition-colors text-left ${
                activeTab === 'extensions'
                  ? 'bg-[#202c33] text-[#00a884]'
                  : 'text-[#8696a0] hover:bg-[#182229] hover:text-[#e9edef]'
              }`}
            >
              <Puzzle className="w-4 h-4" />
              <span>Chrome Extensions</span>
            </button>

            <button
              onClick={() => setActiveTab('css')}
              className={`flex items-center gap-2.5 px-3 py-2 rounded font-medium transition-colors text-left ${
                activeTab === 'css'
                  ? 'bg-[#202c33] text-[#00a884]'
                  : 'text-[#8696a0] hover:bg-[#182229] hover:text-[#e9edef]'
              }`}
            >
              <Palette className="w-4 h-4" />
              <span>Custom CSS</span>
            </button>

            <button
              onClick={() => setActiveTab('storage')}
              className={`flex items-center gap-2.5 px-3 py-2 rounded font-medium transition-colors text-left ${
                activeTab === 'storage'
                  ? 'bg-[#202c33] text-[#00a884]'
                  : 'text-[#8696a0] hover:bg-[#182229] hover:text-[#e9edef]'
              }`}
            >
              <Database className="w-4 h-4" />
              <span>Storage & Cache</span>
            </button>

            <button
              onClick={() => setActiveTab('notifications')}
              className={`flex items-center gap-2.5 px-3 py-2 rounded font-medium transition-colors text-left ${
                activeTab === 'notifications'
                  ? 'bg-[#202c33] text-[#00a884]'
                  : 'text-[#8696a0] hover:bg-[#182229] hover:text-[#e9edef]'
              }`}
            >
              <Bell className="w-4 h-4" />
              <span>Notification History</span>
            </button>
          </div>

          {/* Content Pane */}
          <div className="flex-1 p-5 overflow-y-auto text-xs text-[#d1d7db] bg-[#111b21]">
            {activeTab === 'general' && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-[#e9edef] border-b border-[#222d34] pb-2">
                  General Behavior
                </h3>
                <div className="space-y-3">
                  <label className="flex items-center justify-between cursor-pointer p-2 rounded hover:bg-[#182229]">
                    <div>
                      <div className="font-medium text-[#e9edef]">Close to System Tray</div>
                      <div className="text-[11px] text-[#8696a0]">
                        Keep app running in background daemon mode on close
                      </div>
                    </div>
                    <input type="checkbox" defaultChecked className="accent-[#00a884]" />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer p-2 rounded hover:bg-[#182229]">
                    <div>
                      <div className="font-medium text-[#e9edef]">Hardware Acceleration</div>
                      <div className="text-[11px] text-[#8696a0]">
                        Use GPU acceleration for WhatsApp rendering
                      </div>
                    </div>
                    <input type="checkbox" defaultChecked className="accent-[#00a884]" />
                  </label>
                </div>
              </div>
            )}

            {activeTab === 'extensions' && (
              <div className="flex flex-col h-full">
                {/* Extensions Header with Switcher & Import Dropdown */}
                <div className="flex items-center justify-between mb-4 border-b border-[#222d34] pb-3 flex-shrink-0 relative">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-[#e9edef]">Target Account:</span>
                    <select
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      className="bg-[#202c33] text-[#e9edef] px-2 py-1 rounded border border-[#222d34] text-[11px] outline-none focus:border-[#00a884]"
                    >
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="relative">
                    <button
                      onClick={() => setShowImportDropdown(!showImportDropdown)}
                      disabled={isImporting || !selectedAccountId}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#00a884] text-[#111b21] hover:bg-[#00c298] disabled:opacity-50 font-bold rounded transition-colors text-[11px]"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Import Extension</span>
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
                </div>

                {/* Extensions List */}
                <div className="flex-1 overflow-y-auto space-y-2">
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
                        className="flex items-center justify-between p-3 bg-[#182229] border border-[#222d34] rounded-lg hover:border-[#374248] transition-colors"
                      >
                        <div className="flex items-start gap-3 min-w-0 flex-1 mr-4">
                          <div className="w-8 h-8 rounded bg-[#202c33] flex items-center justify-center text-[#00a884] flex-shrink-0">
                            <Puzzle className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-xs text-[#e9edef] truncate">
                              {ext.name}
                            </div>
                            <div className="text-[10px] text-[#8696a0] mt-0.5 flex items-center gap-2">
                              <span>v{ext.version}</span>
                              <span className="text-[#374248]">•</span>
                              <span
                                className="truncate max-w-[120px] font-mono text-[9px] bg-[#111b21] px-1 py-0.5 rounded"
                                title={ext.path}
                              >
                                ID: {ext.id}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3.5">
                          {/* Toggle switch */}
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={ext.enabled}
                              onChange={() => handleToggleExtension(ext.id, !ext.enabled)}
                              className="sr-only peer"
                            />
                            <div className="w-7 h-4 bg-[#202c33] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#8696a0] after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#00a884] peer-checked:after:bg-[#111b21] peer-checked:after:border-[#00a884]"></div>
                          </label>
                          {/* Remove button */}
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
            )}

            {activeTab === 'css' && (
              <div>
                <h3 className="text-sm font-semibold text-[#e9edef] border-b border-[#222d34] pb-2">
                  Custom CSS Injector
                </h3>
                <p className="text-[#8696a0] mt-2">
                  Custom theme styles and CSS overrides will be enabled in Phase 4.
                </p>
              </div>
            )}

            {activeTab === 'storage' && (
              <div>
                <h3 className="text-sm font-semibold text-[#e9edef] border-b border-[#222d34] pb-2">
                  Storage & Partition Data
                </h3>
                <p className="text-[#8696a0] mt-2">
                  Per-account storage usage breakdown and cache clearing will be enabled in Phase 3.
                </p>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div>
                <h3 className="text-sm font-semibold text-[#e9edef] border-b border-[#222d34] pb-2">
                  Notification History
                </h3>
                <p className="text-[#8696a0] mt-2">
                  Local JSON notification log history drawer will be enabled in Phase 4.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
