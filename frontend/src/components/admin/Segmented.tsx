import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  key: T;
  label: string;
  count?: number;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex items-center rounded-md bg-muted p-0.5',
        className,
      )}
    >
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-[6px] transition-colors',
              size === 'sm'
                ? 'h-6 px-2 text-[12px]'
                : 'h-7 px-2.5 text-[13px]',
              active
                ? 'bg-card text-foreground shadow-sm font-semibold'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
            {o.count != null && (
              <span className="font-mono tabular-nums text-[11px] opacity-60">
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
