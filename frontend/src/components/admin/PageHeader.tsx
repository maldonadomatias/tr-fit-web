import { Eyebrow } from './Eyebrow';
import { cn } from '@/lib/utils';

export function PageHeader({
  eyebrow,
  eyebrowVariant = 'brand',
  title,
  sub,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode;
  eyebrowVariant?: 'brand' | 'muted';
  title: React.ReactNode;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mb-[22px] flex items-end justify-between gap-6 border-b border-border pb-[18px]',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && <Eyebrow variant={eyebrowVariant}>{eyebrow}</Eyebrow>}
        <h1 className="mt-1 text-[22px] font-bold leading-7 tracking-tight">
          {title}
        </h1>
        {sub && (
          <div className="mt-1 text-sm text-muted-foreground">{sub}</div>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
