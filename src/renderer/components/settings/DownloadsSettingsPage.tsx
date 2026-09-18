import React, { useState } from 'react';
import {
  Download,
  Folder,
  FolderOpen,
  ExternalLink,
  RotateCcw,
  CheckCircle2,
  FileCheck,
  MousePointerClick,
} from 'lucide-react';
import type { GlobalSettings, FileSecondClickAction } from '../../../preload';

interface DownloadsSettingsPageProps {
  globalSettings: GlobalSettings | null;
  handleToggleGlobalSetting: (key: keyof GlobalSettings, value: any) => Promise<void> | void;
}

export const DownloadsSettingsPage: React.FC<DownloadsSettingsPageProps> = ({
  globalSettings,
  handleToggleGlobalSetting,
}) => {
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const defaultFolder = globalSettings?.defaultDownloadsPath || 'Default System Downloads';
  const askEveryTime = !!globalSettings?.askWhereToSaveEveryTime;
  const secondClickAction: FileSecondClickAction = globalSettings?.fileSecondClickAction || 'open';
  const notifEnabled = globalSettings?.downloadNotificationsEnabled !== false;

  const showTemporaryFeedback = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => {
      setFeedbackMessage(null);
    }, 3000);
  };

  const handleChangeFolder = async () => {
    try {
      const selected = await window.electronAPI.chooseDownloadsFolder();
      if (selected) {
        await handleToggleGlobalSetting('defaultDownloadsPath', selected);
        showTemporaryFeedback(`Downloads location set to ${selected}`);
      }
    } catch (err) {
      console.error('Failed to choose downloads folder:', err);
    }
  };

  const handleResetFolder = async () => {
    // Empty string triggers default app.getPath('downloads') in main process
    await handleToggleGlobalSetting('defaultDownloadsPath', '');
    showTemporaryFeedback('Downloads location reset to default system folder.');
  };

  const handleOpenFolder = async () => {
    try {
      if (globalSettings?.defaultDownloadsPath) {
        window.electronAPI.showItemInFolder(globalSettings.defaultDownloadsPath);
      } else {
        const chosen = await window.electronAPI.chooseDownloadsFolder();
        if (chosen) {
          window.electronAPI.showItemInFolder(chosen);
        }
      }
    } catch (err) {
      console.error('Failed to open downloads folder:', err);
    }
  };

  const secondClickOptions: {
    id: FileSecondClickAction;
    title: string;
    description: string;
    badge?: string;
  }[] = [
    {
      id: 'open',
      title: 'Open file in default app',
      description: 'Directly launches the downloaded file using your system viewer without re-downloading.',
      badge: 'Recommended',
    },
    {
      id: 'showInFolder',
      title: 'Show in folder',
      description: 'Highlights and reveals the downloaded file inside your file manager.',
    },
    {
      id: 'saveAs',
      title: 'Always show Save As dialog',
      description: 'Prompts you with a save dialog to select where to store the copy.',
    },
    {
      id: 'download',
      title: 'Download again',
      description: 'Standard browser behavior: re-downloads the file into your downloads folder.',
    },
  ];

  return (
    <div className="space-y-6 subpage-animate text-[#e9edef]">
      {/* Title Header */}
      <div>
        <h3 className="text-sm font-semibold text-[#e9edef] border-b border-[#222d34] pb-2 flex items-center gap-2">
          <Download className="w-4 h-4 text-[#00a884]" />
          <span>Download Manager</span>
        </h3>
        <p className="text-[11px] text-[#8696a0] mt-1.5 leading-relaxed">
          Configure default save destinations, prompt preferences, and smart file click actions for WhatsApp attachments.
        </p>
      </div>

      {feedbackMessage && (
        <div className="p-2.5 bg-[#00a884]/10 border border-[#00a884]/30 rounded text-[#00a884] text-xs flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{feedbackMessage}</span>
        </div>
      )}

      {/* Section 1: Default Location */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-[#8696a0] uppercase tracking-wider flex items-center gap-1.5">
          <Folder className="w-3.5 h-3.5 text-[#00a884]" />
          <span>Default Download Location</span>
        </h4>

        <div className="p-3 bg-[#111b21] border border-[#222d34] rounded-lg space-y-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono text-[11px] text-[#00a884] bg-[#202c33] px-2.5 py-1.5 rounded flex-1 truncate border border-[#222d34]/60" title={defaultFolder}>
              {defaultFolder}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              onClick={handleChangeFolder}
              className="px-3 py-1.5 bg-[#00a884] hover:bg-[#00c298] text-[#111b21] font-semibold text-xs rounded transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Change Folder...</span>
            </button>

            <button
              onClick={handleOpenFolder}
              className="px-3 py-1.5 bg-[#202c33] hover:bg-[#2a3942] text-[#e9edef] text-xs rounded border border-[#222d34] transition-colors flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5 text-[#8696a0]" />
              <span>Open in File Manager</span>
            </button>

            {globalSettings?.defaultDownloadsPath && (
              <button
                onClick={handleResetFolder}
                className="px-2.5 py-1.5 text-[#8696a0] hover:text-[#e9edef] hover:bg-[#202c33] text-xs rounded transition-colors flex items-center gap-1"
                title="Reset to default system Downloads folder"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Section 2: Download Preferences */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-[#8696a0] uppercase tracking-wider flex items-center gap-1.5">
          <FileCheck className="w-3.5 h-3.5 text-[#00a884]" />
          <span>Download Preferences</span>
        </h4>

        <div className="space-y-2">
          {/* Ask every time toggle */}
          <label className="flex items-center justify-between gap-4 cursor-pointer p-3 bg-[#111b21] border border-[#222d34] rounded-lg hover:bg-[#182229] transition-colors">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-[#e9edef] text-xs">Ask where to save each file before downloading</div>
              <div className="text-[10px] text-[#8696a0] mt-0.5">
                Always show a "Save As" dialog to choose custom filename and destination. (Message context menu "Download" always prompts Save As).
              </div>
            </div>
            <input
              type="checkbox"
              checked={askEveryTime}
              onChange={(e) => handleToggleGlobalSetting('askWhereToSaveEveryTime', e.target.checked)}
              className="accent-[#00a884] w-4 h-4 cursor-pointer flex-shrink-0 ml-2"
            />
          </label>

          {/* Download notifications toggle */}
          <label className="flex items-center justify-between gap-4 cursor-pointer p-3 bg-[#111b21] border border-[#222d34] rounded-lg hover:bg-[#182229] transition-colors">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-[#e9edef] text-xs">Show desktop notification when download completes</div>
              <div className="text-[10px] text-[#8696a0] mt-0.5">
                Displays a system alert upon successful download. Clicking the alert opens the file.
              </div>
            </div>
            <input
              type="checkbox"
              checked={notifEnabled}
              onChange={(e) => handleToggleGlobalSetting('downloadNotificationsEnabled', e.target.checked)}
              className="accent-[#00a884] w-4 h-4 cursor-pointer flex-shrink-0 ml-2"
            />
          </label>
        </div>
      </div>

      {/* Section 3: Action on Second Click */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-[#8696a0] uppercase tracking-wider flex items-center gap-1.5">
          <MousePointerClick className="w-3.5 h-3.5 text-[#00a884]" />
          <span>Action on Second Click of a File</span>
        </h4>
        <p className="text-[11px] text-[#8696a0]">
          When a file's download button has disappeared after downloading, clicking the file again will trigger this action:
        </p>

        <div className="grid grid-cols-1 gap-2">
          {secondClickOptions.map((opt) => {
            const isSelected = secondClickAction === opt.id;
            return (
              <div
                key={opt.id}
                onClick={() => handleToggleGlobalSetting('fileSecondClickAction', opt.id)}
                className={`p-3 rounded-lg border cursor-pointer transition-all flex items-start justify-between gap-3 ${
                  isSelected
                    ? 'bg-[#202c33] border-[#00a884] shadow-md'
                    : 'bg-[#111b21] border-[#222d34] hover:bg-[#182229]'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[#e9edef]">{opt.title}</span>
                    {opt.badge && (
                      <span className="px-1.5 py-0.5 text-[9px] font-bold bg-[#00a884]/15 text-[#00a884] rounded border border-[#00a884]/30">
                        {opt.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-[#8696a0] leading-relaxed">{opt.description}</p>
                </div>
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    isSelected ? 'border-[#00a884] bg-[#00a884]' : 'border-[#8696a0]'
                  }`}
                >
                  {isSelected && <div className="w-1.5 h-1.5 bg-[#111b21] rounded-full" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
