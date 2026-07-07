import { cn } from '@/lib/utils';

export interface AdminTabSpec<K extends string> {
  key: K;
  label: string;
  count?: number;
}

export function AdminTabs<K extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: AdminTabSpec<K>[];
  value: K;
  onChange: (next: K) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        'mb-5 flex items-center gap-3 overflow-x-auto border-b border-border sm:gap-6',
        className,
      )}
    >
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(t.key)}
            className={cn(
              'relative -mb-px flex items-center gap-1.5 px-[14px] py-2.5 text-[13px] font-medium transition-colors',
              active
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span>{t.label}</span>
            {t.count != null && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 font-mono tabular-nums text-[10px] font-semibold',
                  active
                    ? 'bg-brand/15 text-brand'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {t.count}
              </span>
            )}
            <span
              aria-hidden
              className={cn(
                'absolute inset-x-[14px] -bottom-px h-[2px] rounded-full transition-opacity',
                active ? 'bg-brand opacity-100' : 'opacity-0',
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
