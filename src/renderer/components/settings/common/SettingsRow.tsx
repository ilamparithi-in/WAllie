import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface SettingsRowProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  badge?: {
    text: string;
    variant?: 'active' | 'disabled' | 'neutral' | 'beta';
  };
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  border?: boolean;
}

export const SettingsRow: React.FC<SettingsRowProps> = ({
  title,
  description,
  icon: Icon,
  badge,
  action,
  children,
  className = '',
  border = true,
}) => {
  const badgeClasses = {
    active: 'bg-[#00a884]/20 text-[#00a884] border-[#00a884]/30',
    disabled: 'bg-[#8696a0]/20 text-[#8696a0] border-[#8696a0]/30',
    neutral: 'bg-[#202c33] text-[#cfd9df] border-[#2a3942]',
    beta: 'bg-[#f59e0b]/20 text-[#f59e0b] border-[#f59e0b]/30',
  }[badge?.variant || 'neutral'];

  return (
    <div
      className={`px-4 py-3 flex items-center justify-between gap-4 ${
        border ? 'border-b border-[#222d34]/70 last:border-b-0' : ''
      } ${className}`}
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        {Icon && (
          <div className="p-1.5 bg-[#202c33] rounded text-[#00a884] shrink-0 mt-0.5">
            <Icon className="w-3.5 h-3.5" />
          </div>
        )}
        <div className="space-y-0.5 min-w-0 pr-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] font-medium text-[#e9edef]">{title}</span>
            {badge && (
              <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border ${badgeClasses}`}>
                {badge.text}
              </span>
            )}
          </div>
          {description && (
            <p className="text-[11px] text-[#8696a0] leading-relaxed">{description}</p>
          )}
        </div>
      </div>
      {(action || children) && (
        <div className="shrink-0 flex items-center gap-2">
          {children}
          {action}
        </div>
      )}
    </div>
  );
};

