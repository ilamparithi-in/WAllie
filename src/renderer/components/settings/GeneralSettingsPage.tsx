import React from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import type { GlobalSettings } from '../../../preload';

interface GeneralSettingsPageProps {
  globalSettings: GlobalSettings | null;
  handleToggleGlobalSetting: (key: keyof GlobalSettings, value: any) => Promise<void> | void;
}

export const GeneralSettingsPage: React.FC<GeneralSettingsPageProps> = ({
  globalSettings,
  handleToggleGlobalSetting,
}) => {
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
          <label className="flex items-center justify-between cursor-pointer p-2 rounded hover:bg-[#182229] transition-colors">
            <div>
              <div className="font-medium text-[#e9edef] text-[11px]">Close to System Tray</div>
              <div className="text-[10px] text-[#8696a0]">
                Keep app running in background tray icon mode on close
              </div>
            </div>
            <input
              type="checkbox"
              checked={globalSettings?.closeToTray ?? true}
              onChange={(e) => handleToggleGlobalSetting('closeToTray', e.target.checked)}
              className="accent-[#00a884] w-4 h-4 cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer p-2 rounded hover:bg-[#182229] transition-colors">
            <div>
              <div className="font-medium text-[#e9edef] text-[11px]">Start Minimized</div>
              <div className="text-[10px] text-[#8696a0]">
                Start application minimized to the system tray on launch
              </div>
            </div>
            <input
              type="checkbox"
              checked={globalSettings?.startMinimized ?? false}
              onChange={(e) => handleToggleGlobalSetting('startMinimized', e.target.checked)}
              className="accent-[#00a884] w-4 h-4 cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer p-2 rounded hover:bg-[#182229] transition-colors">
            <div>
              <div className="font-medium text-[#e9edef] text-[11px]">Hardware Acceleration</div>
              <div className="text-[10px] text-[#8696a0]">
                Use GPU acceleration (requires restart to apply)
              </div>
            </div>
            <input
              type="checkbox"
              checked={globalSettings?.hardwareAcceleration ?? true}
              onChange={(e) => handleToggleGlobalSetting('hardwareAcceleration', e.target.checked)}
              className="accent-[#00a884] w-4 h-4 cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer p-2 rounded hover:bg-[#182229] transition-colors">
            <div>
              <div className="font-medium text-[#e9edef] text-[11px]">Show Developer Tools Toggle</div>
              <div className="text-[10px] text-[#8696a0]">
                Show a code icon in the titlebar to toggle developer tools for WhatsApp Web
              </div>
            </div>
            <input
              type="checkbox"
              checked={globalSettings?.showDevToolsToggle ?? false}
              onChange={(e) => handleToggleGlobalSetting('showDevToolsToggle', e.target.checked)}
              className="accent-[#00a884] w-4 h-4 cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer p-2 rounded hover:bg-[#182229] transition-colors">
            <div>
              <div className="font-medium text-[#e9edef] text-[11px]">Enable Notification Logging</div>
              <div className="text-[10px] text-[#8696a0]">
                Log desktop notifications, message edits, and deletions to history (disabled by default)
              </div>
            </div>
            <input
              type="checkbox"
              checked={globalSettings?.notificationLoggingEnabled ?? false}
              onChange={(e) => handleToggleGlobalSetting('notificationLoggingEnabled', e.target.checked)}
              className="accent-[#00a884] w-4 h-4 cursor-pointer"
            />
          </label>
        </div>
      </div>
    </div>
  );
};
