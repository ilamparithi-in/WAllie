import React, { useState } from 'react';
import { X, Puzzle, Palette, Database, Bell, Settings as SettingsIcon } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'extensions' | 'css' | 'storage' | 'notifications' | 'general';

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('general');

  if (!isOpen) return null;

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
              <div>
                <h3 className="text-sm font-semibold text-[#e9edef] border-b border-[#222d34] pb-2">
                  Chrome Extensions Engine
                </h3>
                <p className="text-[#8696a0] mt-2">
                  Chrome extension management will be enabled in Phase 2. Unpacked MV2/MV3 extensions can be loaded per account partition.
                </p>
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
