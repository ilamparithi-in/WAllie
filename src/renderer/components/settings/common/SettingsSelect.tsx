import { ChevronDown } from 'lucide-react';

export interface SettingsSelectOption<T extends string | number = string> {
  value: T;
  label: string;
}

export interface SettingsSelectProps<T extends string | number = string> {
  value: T;
  onChange: (value: T) => void;
  options: SettingsSelectOption<T>[];
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  className?: string;
}

export function SettingsSelect<T extends string | number = string>({
  value,
  onChange,
  options,
  disabled = false,
  id,
  ariaLabel,
  className = '',
}: SettingsSelectProps<T>) {
  return (
    <div className={`relative inline-block ${className}`}>
      <select
        id={id}
        aria-label={ariaLabel}
        disabled={disabled}
        value={value}
        onChange={(e) => {
          const val = typeof value === 'number' ? Number(e.target.value) : e.target.value;
          onChange(val as T);
        }}
        className="appearance-none bg-[#202c33] border border-[#2a3942] hover:border-[#00a884]/50 focus:border-[#00a884] text-[#e9edef] text-xs font-medium rounded-md pl-3 pr-8 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a884] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        {options.map((opt) => (
          <option key={String(opt.value)} value={opt.value} className="bg-[#202c33] text-[#e9edef]">
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="w-3.5 h-3.5 text-[#8696a0] pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
    </div>
  );
}

