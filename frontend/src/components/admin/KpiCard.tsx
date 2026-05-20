import { Eyebrow } from './Eyebrow';
import { Sparkline } from './Sparkline';
import { cn } from '@/lib/utils';

export function KpiCard({
  eyebrow,
  icon,
  value,
  delta,
  deltaTone,
  sub,
  trend,
  highlighted = false,
  className,
}: {
  eyebrow: React.ReactNode;
  icon?: React.ReactNode;
  value: React.ReactNode;
  delta?: React.ReactNode;
  deltaTone?: 'up' | 'down' | 'neutral';
  sub?: React.ReactNode;
  trend?: number[];
  highlighted?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative flex h-full flex-col gap-2 rounded-2xl border bg-card p-[18px]',
        highlighted && 'border-brand/40 bg-brand/4',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <Eyebrow variant="muted">{eyebrow}</Eyebrow>
        {icon && (
          <span className="text-muted-foreground" aria-hidden>
            {icon}
          </span>
        )}
      </div>
      <div className="font-mono tabular-nums text-[28px] font-bold leading-none">
        {value}
      </div>
      <div className="flex items-center gap-2 text-[12px]">
        {delta != null && (
          <span
            className={cn(
              'font-mono tabular-nums font-semibold',
              deltaTone === 'up' && 'text-brand',
              deltaTone === 'down' && 'text-destructive',
              (!deltaTone || deltaTone === 'neutral') && 'text-muted-foreground',
            )}
          >
            {delta}
          </span>
        )}
        {sub && <span className="text-muted-foreground">{sub}</span>}
      </div>
      {trend && trend.length > 1 && (
        <Sparkline
          data={trend}
          width={110}
          height={32}
          color="var(--brand)"
          className="absolute bottom-3 right-3 opacity-70"
        />
      )}
    </div>
  );
}
