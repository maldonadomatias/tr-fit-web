import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Eyebrow } from '@/components/admin/Eyebrow';
import { ConfirmPaymentDialog } from '@/components/admin/ConfirmPaymentDialog';
import { useRegisterPromo } from '@/hooks/useAdminUsers';
import { useBillingInfo, useUpdateBilling } from '@/hooks/useBilling';
import { fmtARS } from '@/lib/format';
import type { AdminUser } from '@/types/api';

type Plan = 'quarterly' | 'annual';

const COPY: Record<
  Plan,
  {
    title: string;
    months: number;
    field: 'quarterly_promo_ars' | 'annual_promo_ars';
    priceLabel: string;
    button: string;
    span: string;
  }
> = {
  quarterly: {
    title: 'Trimestral',
    months: 3,
    field: 'quarterly_promo_ars',
    priceLabel: 'Precio promo trimestral',
    button: 'Registrar promo trimestral',
    span: '3 meses',
  },
  annual: {
    title: 'Anual',
    months: 12,
    field: 'annual_promo_ars',
    priceLabel: 'Precio promo anual',
    button: 'Registrar promo anual',
    span: '12 meses',
  },
};

/** YYYY-MM-DD-free calendar add. Mirrors membership.service.addCalendarMonth. */
function addCalendarMonths(base: Date, months: number): Date {
  const y = base.getFullYear();
  const m = base.getMonth();
  const d = base.getDate();
  const lastDayOfTarget = new Date(y, m + months + 1, 0).getDate();
  const result = new Date(base);
  result.setFullYear(y, m + months, Math.min(d, lastDayOfTarget));
  return result;
}

/**
 * Where the promo vencimiento lands. Vacation (and a lapsed date) starts
 * today, same as a cuota that brings someone back. An active future date
 * stacks from that date.
 */
export function promoExpiry(user: AdminUser, months: number): Date {
  const now = new Date();
  if (user.membership_status === 'vacation' || !user.paid_until) {
    return addCalendarMonths(now, months);
  }
  const cur = new Date(user.paid_until);
  if (Number.isNaN(cur.getTime()) || cur.getTime() <= now.getTime()) {
    return addCalendarMonths(now, months);
  }
  return addCalendarMonths(cur, months);
}

function fmtPromoDate(d: Date): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
    .format(d)
    .replace('.', '');
}

/**
 * Prepaid promo, same shape as Pago por vacaciones: a saved price, a one-off
 * amount for this athlete, and a charge that grants access.
 */
export function PromoPaymentCard({
  user,
  plan,
}: {
  user: AdminUser;
  plan: Plan;
}) {
  const copy = COPY[plan];
  const billing = useBillingInfo();
  const saveFee = useUpdateBilling();
  const register = useRegisterPromo();
  const [amount, setAmount] = useState('');
  const [confirm, setConfirm] = useState(false);
  const saved = billing.data?.[copy.field];
  const expires = promoExpiry(user, copy.months);
  const who = user.name ?? user.email.split('@')[0];

  useEffect(() => {
    if (saved == null || !Number.isFinite(Number(saved))) return;
    setAmount(String(Number(saved)));
  }, [saved]);

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
      await saveFee.mutateAsync({ [copy.field]: v });
      toast.success('Precio de promo actualizado');
    } catch {
      toast.error('No se pudo guardar el precio');
    }
  }

  function ask() {
    if (parsedAmount() == null) {
      toast.error('Precio inválido');
      return;
    }
    setConfirm(true);
  }

  const price = parsedAmount();

  return (
    <div className="rounded-2xl border bg-card">
      <div className="border-b border-border p-[18px]">
        <Eyebrow variant="muted">Promo</Eyebrow>
        <div className="mt-1 text-[17px] font-semibold tracking-tight">
          {copy.title}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Cobra la promo, habilita el acceso y corre el vencimiento {copy.span}.
          Si ya está pago, suma desde esa fecha. Si está vencido o de
          vacaciones, suma desde hoy.
        </p>
      </div>
      <div className="flex flex-col gap-4 p-[18px]">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {copy.priceLabel} (ARS)
          <span className="text-muted-foreground/70">
            Precio de hoy{' '}
            {saved == null ? 'sin definir' : fmtARS(Number(saved))}. Guardalo
            para los próximos, o cobrale otro monto solo a este alumno.
          </span>
          <input
            type="number"
            min={0}
            step={1000}
            aria-label={copy.priceLabel}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-9 w-40 rounded-md border border-border bg-background px-2 text-sm tabular-nums text-foreground"
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Pagado hasta pasa a{' '}
          <span className="font-mono tabular-nums text-foreground">
            {fmtPromoDate(expires)}
          </span>
          .
        </p>
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
            onClick={ask}
            disabled={register.isPending}
          >
            {copy.button}
          </Button>
        </div>
      </div>
      <ConfirmPaymentDialog
        open={confirm}
        user={user}
        amount={price ?? 0}
        pending={register.isPending}
        title={`¿Registrar promo ${copy.title.toLowerCase()} de ${who}?`}
        expiresAt={expires}
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          if (price == null) return;
          register.mutate(
            { id: user.id, plan, amount: price },
            {
              onSuccess: () => {
                setConfirm(false);
                toast.success(
                  `Promo ${copy.title.toLowerCase()} registrada. Acceso habilitado.`
                );
              },
              onError: (e) =>
                toast.error(`No se pudo guardar: ${(e as Error).message}`),
            }
          );
        }}
      />
    </div>
  );
}
