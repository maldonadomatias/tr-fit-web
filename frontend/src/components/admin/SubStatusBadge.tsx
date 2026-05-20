import { Badge } from '@/components/ui/badge';
import type { SubscriptionStatus } from '@/types/api';

const MAP: Record<
  SubscriptionStatus,
  { variant: 'brand' | 'warning' | 'outline'; label: string }
> = {
  authorized: { variant: 'brand', label: 'Activa' },
  pending: { variant: 'warning', label: 'Pendiente' },
  paused: { variant: 'warning', label: 'Pausada' },
  cancelled: { variant: 'outline', label: 'Cancelada' },
};

export function SubStatusBadge({
  status,
}: {
  status: SubscriptionStatus | null | undefined;
}) {
  if (!status) return null;
  const m = MAP[status];
  return <Badge variant={m.variant}>{m.label}</Badge>;
}
