import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { UserStatus } from '@/types/api';

const MAP: Record<
  UserStatus,
  { variant: 'brand' | 'warning' | 'destructive'; label: string }
> = {
  approved: { variant: 'brand', label: 'Aprobado' },
  pending: { variant: 'warning', label: 'Pendiente' },
  rejected: { variant: 'destructive', label: 'Rechazado' },
};

export function StatusBadge({
  status,
  className,
}: {
  status: UserStatus;
  className?: string;
}) {
  const m = MAP[status];
  return (
    <Badge variant={m.variant} className={cn('gap-1.5', className)}>
      <span
        className="inline-block size-1.5 rounded-full bg-current"
        aria-hidden
      />
      {m.label}
    </Badge>
  );
}
