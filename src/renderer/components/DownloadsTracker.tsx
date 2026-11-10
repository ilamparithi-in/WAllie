import React from 'react';
import { Download, CheckCircle, XCircle, X, FolderOpen } from 'lucide-react';
import type { DownloadState } from '../types';

interface DownloadsTrackerProps {
  downloads: DownloadState[];
  onRemove: (id: number) => void;
  onOpenFile: (savePath: string) => void;
  onShowInFolder: (savePath: string) => void;
}

export const DownloadsTracker: React.FC<DownloadsTrackerProps> = ({
  downloads,
  onRemove,
  onOpenFile,
  onShowInFolder,
}) => {
  if (downloads.length === 0) return null;

  return (
    <div
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-xs w-72 select-text"
    >
      {downloads.map((dl) => (
        <div
          key={dl.id}
          className="p-3 bg-[#202c33] border border-[#222d34] rounded-lg shadow-2xl flex flex-col gap-2 transition-all duration-300"
        >
          <div className="flex items-center gap-2">
            {dl.state === 'progressing' && <Download className="w-3.5 h-3.5 text-[#00a884] animate-bounce" />}
            {dl.state === 'completed' && <CheckCircle className="w-3.5 h-3.5 text-[#00a884]" />}
            {dl.state === 'failed' && <XCircle className="w-3.5 h-3.5 text-[#ea4335]" />}
            <span className="font-semibold text-[11px] text-[#e9edef] truncate flex-1" title={dl.filename}>
              {dl.filename}
            </span>
            <button
              onClick={() => onRemove(dl.id)}
              onMouseDown={(e) => e.preventDefault()}
              tabIndex={-1}
              className="p-0.5 text-[#8696a0] hover:text-[#e9edef] rounded hover:bg-[#111b21] transition-colors focus-visible:ring-2 focus-visible:ring-[#00a884] focus-visible:outline-none"
            >
              <X className="w-3 h-3" />
            </button>
          </div>

          {dl.state === 'progressing' && (
            <div className="space-y-1">
              <div className="w-full bg-[#111b21] rounded-full h-1 overflow-hidden">
                <div
                  className="bg-[#00a884] h-1 rounded-full transition-all duration-200"
                  style={{ width: `${dl.percent}%` }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-[#8696a0]">
                <span>{dl.percent}%</span>
                <span>
                  {dl.receivedBytes && dl.totalBytes
                    ? `${(dl.receivedBytes / (1024 * 1024)).toFixed(1)} MB of ${(dl.totalBytes / (1024 * 1024)).toFixed(1)} MB`
                    : ''}
                </span>
              </div>
            </div>
          )}

          {dl.state === 'completed' && (
            <div className="flex items-center justify-between pt-1 border-t border-[#222d34]/60">
              <button
                onClick={() => dl.savePath && onOpenFile(dl.savePath)}
                className="text-[10px] text-[#00a884] hover:text-[#00c298] font-medium flex items-center gap-1 truncate max-w-[130px] cursor-pointer transition-colors"
                title="Click to open file"
              >
                <CheckCircle className="w-3 h-3 flex-shrink-0" />
                <span>Downloaded</span>
              </button>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {dl.savePath && (
                  <>
                    <button
                      onClick={() => onOpenFile(dl.savePath!)}
                      className="px-2 py-0.5 bg-[#111b21] hover:bg-[#2a3942] text-[#e9edef] text-[10px] font-medium rounded border border-[#222d34] transition-colors"
                      title="Open file"
                    >
                      Open
                    </button>
                    <button
                      onClick={() => onShowInFolder(dl.savePath!)}
                      className="p-1 bg-[#111b21] hover:bg-[#2a3942] text-[#8696a0] hover:text-[#e9edef] rounded border border-[#222d34] transition-colors"
                      title="Show in folder"
                    >
                      <FolderOpen className="w-3 h-3" />
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {dl.state === 'failed' && (
            <div className="text-[9px] text-[#ea4335] font-semibold">
              Download failed or cancelled
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

