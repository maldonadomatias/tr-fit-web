import { Badge } from '@/components/ui/badge';
import { MEMBERSHIP_LABELS } from '@/components/admin/ConfirmPaymentDialog';
import type { MembershipStatus } from '@/types/api';

const VARIANT: Record<MembershipStatus, 'brand' | 'warning' | 'outline'> = {
  active: 'brand',
  expiring: 'warning',
  paused: 'warning',
  expired: 'outline',
  cancelled: 'outline',
};

/**
 * Membership state as shown across the admin. Replaces the legacy
 * TierBadge/SubStatusBadge pair, which read the dead MercadoPago
 * `subscriptions` table and rendered blank for every athlete enabled through
 * "Registrar pago".
 */
export function MembershipBadge({
  status,
}: {
  status: MembershipStatus | null | undefined;
}) {
  if (!status)
    return <span className="text-xs text-muted-foreground">Sin membresía</span>;
  return (
    <Badge variant={VARIANT[status] ?? 'outline'}>
      {MEMBERSHIP_LABELS[status] ?? status}
    </Badge>
  );
}
