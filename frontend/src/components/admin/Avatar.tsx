import { cn } from '@/lib/utils';

type Size = 'sm' | 'md' | 'lg' | 'xl';

const sizeMap: Record<Size, string> = {
  sm: 'h-7 w-7 text-[10px] rounded-full',
  md: 'h-9 w-9 text-[11px] rounded-full',
  lg: 'h-14 w-14 text-[18px] rounded-full',
  xl: 'h-[72px] w-[72px] text-[22px] rounded-full',
};

function initialsOf(name?: string | null) {
  if (!name) return '??';
  return name
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function Avatar({
  name,
  size = 'md',
  brand = false,
  className,
}: {
  name?: string | null;
  size?: Size;
  brand?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-grid place-items-center font-bold select-none',
        sizeMap[size],
        brand
          ? 'bg-brand/15 text-brand'
          : 'bg-muted text-foreground',
        className,
      )}
      aria-hidden
    >
      {initialsOf(name)}
    </span>
  );
}
