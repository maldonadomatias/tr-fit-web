import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { fmtARS, fmtShortDate } from '@/lib/format';
import type { AdminUser } from '@/types/api';

export const MEMBERSHIP_LABELS: Record<string, string> = {
  active: 'Activa',
  expiring: 'Por vencer',
  expired: 'Vencida',
  cancelled: 'Cancelada',
  paused: 'Pausada',
};

/**
 * Advance `base` one calendar month, clamping to the target month's last day.
 * Mirrors membership.service.addCalendarMonth so the dialog previews the same
 * date the backend will actually write.
 */
function addCalendarMonth(base: Date): Date {
  const y = base.getFullYear();
  const m = base.getMonth();
  const d = base.getDate();
  const lastDayOfTarget = new Date(y, m + 2, 0).getDate();
  const result = new Date(base);
  result.setFullYear(y, m + 1, Math.min(d, lastDayOfTarget));
  return result;
}

/** Backend extends from the later of the current expiry or now. */
export function nextExpiry(paidUntil: string | null): Date {
  const now = new Date();
  if (!paidUntil) return addCalendarMonth(now);
  const cur = new Date(paidUntil);
  return addCalendarMonth(cur.getTime() > now.getTime() ? cur : now);
}

/**
 * Confirmation step before registering a payment — the one action that books
 * revenue and grants access, so it should never fire on a single stray click.
 */
export function ConfirmPaymentDialog({
  open,
  user,
  amount,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  user: AdminUser;
  amount: number;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const status = user.membership_status;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            ¿Registrar pago de {user.name ?? user.email.split('@')[0]}?
          </DialogTitle>
          <DialogDescription>
            Queda asentado como cobrado y le habilita el acceso. Revisá que los
            datos sean correctos.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Alumno</dt>
            <dd className="text-right font-mono text-xs">{user.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Monto a registrar</dt>
            <dd className="font-semibold tabular-nums">
              {fmtARS(amount)}
              {amount === 0 && (
                <span className="ml-1 font-normal text-muted-foreground">
                  (cortesía)
                </span>
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Estado actual</dt>
            <dd>
              {status ? (MEMBERSHIP_LABELS[status] ?? status) : 'Sin membresía'}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-border pt-2">
            <dt className="text-muted-foreground">Vence</dt>
            <dd className="tabular-nums">
              <span className="text-muted-foreground">
                {user.paid_until ? fmtShortDate(user.paid_until) : '—'}
              </span>
              <span className="mx-1.5 text-muted-foreground">→</span>
              <span className="font-semibold">
                {fmtShortDate(nextExpiry(user.paid_until))}
              </span>
            </dd>
          </div>
        </dl>
        {user.status === 'rejected' && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-400">
            Esta cuenta está dada de baja. Registrar el pago la reactiva: vuelve
            a tener acceso y el monto cuenta como cobrado del mes.
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={pending}>
            {pending ? 'Registrando…' : 'Confirmar pago'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
