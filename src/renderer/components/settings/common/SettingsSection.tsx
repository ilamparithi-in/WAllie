import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface SettingsSectionProps {
  title?: string;
  icon?: LucideIcon;
  badge?: {
    text: string;
    variant?: 'active' | 'disabled' | 'neutral' | 'beta';
  };
  description?: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({
  title,
  icon: Icon,
  badge,
  description,
  headerAction,
  children,
  className = '',
}) => {
  const badgeClasses = {
    active: 'bg-[#00a884]/20 text-[#00a884] border-[#00a884]/30',
    disabled: 'bg-[#8696a0]/20 text-[#8696a0] border-[#8696a0]/30',
    neutral: 'bg-[#202c33] text-[#cfd9df] border-[#2a3942]',
    beta: 'bg-[#f59e0b]/20 text-[#f59e0b] border-[#f59e0b]/30',
  }[badge?.variant || 'neutral'];

  return (
    <div className={`bg-[#182229] border border-[#222d34] rounded-lg overflow-hidden ${className}`}>
      {(title || description || Icon || headerAction) && (
        <div className="p-4 bg-[#202c33]/50 border-b border-[#222d34] flex items-center justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {Icon && (
              <div className="p-2 bg-[#182229] rounded-md border border-[#222d34] text-[#00a884] shrink-0 mt-0.5">
                <Icon className="w-4 h-4" />
              </div>
            )}
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {title && (
                  <span className="font-semibold text-[#e9edef] text-[13px] tracking-tight">
                    {title}
                  </span>
                )}
                {badge && (
                  <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${badgeClasses}`}>
                    {badge.text}
                  </span>
                )}
              </div>
              {description && (
                <p className="text-[11px] text-[#8696a0] leading-relaxed">
                  {description}
                </p>
              )}
            </div>
          </div>
          {headerAction && <div className="shrink-0">{headerAction}</div>}
        </div>
      )}
      <div>{children}</div>
    </div>
  );
};

