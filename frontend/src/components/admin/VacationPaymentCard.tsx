import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Eyebrow } from '@/components/admin/Eyebrow';
import { useRegisterVacation } from '@/hooks/useAdminUsers';
import { useBillingInfo, useUpdateBilling } from '@/hooks/useBilling';
import { fmtARS } from '@/lib/format';
import type { AdminUser } from '@/types/api';

const FALLBACK_FEE = 10000;

/** YYYY-MM-DD in Argentina, matching the date the coach picked as Pagado hasta. */
function toArDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
  });
}

/**
 * Data-maintenance charge while routines stay paused. Sets a real Pagado hasta
 * so the athlete sorts with the other vencimientos. Does not approve the account.
 */
export function VacationPaymentCard({ user }: { user: AdminUser }) {
  const billing = useBillingInfo();
  const saveFee = useUpdateBilling();
  const register = useRegisterVacation();
  const [amount, setAmount] = useState(String(FALLBACK_FEE));
  const [date, setDate] = useState('');
  const onVacation = user.membership_status === 'vacation';

  useEffect(() => {
    const fee = billing.data?.vacation_fee_ars;
    if (fee == null || !Number.isFinite(Number(fee))) return;
    setAmount(String(Number(fee)));
  }, [billing.data?.vacation_fee_ars]);

  useEffect(() => {
    if (onVacation && user.paid_until) setDate(toArDate(user.paid_until));
  }, [onVacation, user.paid_until]);

  function parsedAmount(): number | null {
    const v = Number(amount);
    if (amount.trim() === '' || !Number.isFinite(v) || v < 0) return null;
    return v;
  }

  async function savePrice() {
    const v = parsedAmount();
    if (v == null) {
      toast.error('Precio inválido');
      return;
    }
    try {
      await saveFee.mutateAsync({ vacation_fee_ars: v });
      toast.success('Precio de mantenimiento actualizado');
    } catch {
      toast.error('No se pudo guardar el precio');
    }
  }

  function submit(recordPayment: boolean) {
    const v = parsedAmount();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast.error('Elegí la fecha de Pagado hasta');
      return;
    }
    if (recordPayment && v == null) {
      toast.error('Precio inválido');
      return;
    }
    register.mutate(
      {
        id: user.id,
        amount: v ?? undefined,
        paid_until: date,
        record_payment: recordPayment,
      },
      {
        onSuccess: () =>
          toast.success(
            recordPayment
              ? 'Vacaciones registradas. El acceso queda pausado.'
              : 'Fecha de vacaciones actualizada.'
          ),
        onError: (e) =>
          toast.error(`No se pudo guardar: ${(e as Error).message}`),
      }
    );
  }

  return (
    <div className="rounded-2xl border bg-card">
      <div className="border-b border-border p-[18px]">
        <Eyebrow variant="muted">Vacaciones</Eyebrow>
        <div className="mt-1 text-[17px] font-semibold tracking-tight">
          Pago por vacaciones
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Cobra el mantenimiento de datos, pausa el acceso y deja el vencimiento
          en Usuarios como cualquier otro. El día que termine (o antes), usá
          Registrar pago para cobrar la cuota y reactivar.
        </p>
      </div>
      <div className="flex flex-col gap-4 p-[18px]">
        {user.status === 'rejected' && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-400">
            Esta cuenta sigue rechazada: no puede entrar. El mantenimiento se
            registra igual y el vencimiento entra en el orden de Usuarios. El
            estado de la cuenta sigue en Rechazado.
          </p>
        )}
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Mantenimiento de datos (ARS)
          <span className="text-muted-foreground/70">
            Precio de hoy {fmtARS(billing.data?.vacation_fee_ars ?? FALLBACK_FEE)}
            . Guardalo para los próximos, o cobrale otro monto solo a este
            alumno.
          </span>
          <input
            type="number"
            min={0}
            step={1000}
            aria-label="Mantenimiento de datos"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-9 w-40 rounded-md border border-border bg-background px-2 text-sm tabular-nums text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Pagado hasta
          <input
            type="date"
            aria-label="Pagado hasta"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 w-44 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={savePrice}
            disabled={saveFee.isPending}
          >
            Guardar precio
          </Button>
          <Button
            type="button"
            size="sm"
            variant="brand"
            onClick={() => submit(true)}
            disabled={register.isPending}
          >
            Registrar vacaciones
          </Button>
          {onVacation && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => submit(false)}
              disabled={register.isPending}
            >
              Guardar fecha
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
