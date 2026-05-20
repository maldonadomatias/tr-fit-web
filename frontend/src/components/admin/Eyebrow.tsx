import { cn } from '@/lib/utils';

type Variant = 'brand' | 'muted' | 'destructive';

export function Eyebrow({
  children,
  variant = 'brand',
  className,
}: {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-block text-[10px] font-semibold uppercase tracking-[0.22em]',
        variant === 'brand' && 'text-brand',
        variant === 'muted' && 'text-muted-foreground',
        variant === 'destructive' && 'text-destructive',
        className,
      )}
    >
      {children}
    </span>
  );
}
