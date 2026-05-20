import { cn } from '@/lib/utils';

export function Donut({
  value,
  size = 96,
  stroke = 9,
  label,
  sub,
  trackClassName,
  arcClassName,
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: React.ReactNode;
  sub?: React.ReactNode;
  trackClassName?: string;
  arcClassName?: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (clamped / 100) * c;
  return (
    <div
      className={cn('relative inline-grid place-items-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className={cn('stroke-muted', trackClassName)}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className={cn('stroke-brand', arcClassName)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          {label !== undefined && (
            <div className="font-mono tabular-nums text-[22px] font-bold leading-none">
              {label}
            </div>
          )}
          {sub && (
            <div className="mt-1 text-[10px] text-muted-foreground">{sub}</div>
          )}
        </div>
      </div>
    </div>
  );
}
