import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader } from '@/components/admin/PageHeader';
import { Segmented } from '@/components/admin/Segmented';
import { Avatar } from '@/components/admin/Avatar';
import { TierBadge } from '@/components/admin/TierBadge';
import { SubStatusBadge } from '@/components/admin/SubStatusBadge';
import { useAdminUsers, useRegisterPayment } from '@/hooks/useAdminUsers';
import { useAdminStats } from '@/hooks/useAdminStats';
import { fmtARS, fmtShortDate } from '@/lib/format';
import {
  expiryInfo,
  isPaidThisMonth,
  monthLabel,
  type ExpiryUrgency,
} from '@/lib/subscription';
import type { AdminUser, SubscriptionStatus, SubscriptionTier } from '@/types/api';

const TIER_PRICE: Record<SubscriptionTier, number> = {
  basico: 15000,
  full: 25000,
  premium: 70000,
};

type TierKey = SubscriptionTier | 'all';
type StatusKey = SubscriptionStatus | 'all';

export default function Subscriptions() {
  const navigate = useNavigate();
  const [tier, setTier] = useState<TierKey>('all');
  const [status, setStatus] = useState<StatusKey>('all');

  const usersQ = useAdminUsers({});
  const statsQ = useAdminStats();
  const renewM = useRegisterPayment();

  // Each student's real price is their custom monthly_fee_ars; the tier map is
  // only a fallback when no custom fee has been set.
  const feeOf = (u: AdminUser) =>
    u.monthly_fee_ars ?? TIER_PRICE[u.subscription_tier!];

  const subs = useMemo(
    () => (usersQ.data ?? []).filter((u) => u.subscription_tier !== null),
    [usersQ.data],
  );

  // Soon-to-expire float to the top: expired first, then VENCE HOY / MAÑANA,
  // then by "Vence el" ascending; sin-vencimiento sinks to the bottom.
  const filtered = useMemo(
    () =>
      subs
        .filter((u) => {
          if (tier !== 'all' && u.subscription_tier !== tier) return false;
          if (status !== 'all' && u.subscription_status !== status) return false;
          return true;
        })
        .sort(
          (a, b) =>
            expiryInfo(a.paid_until).sortKey - expiryInfo(b.paid_until).sortKey,
        ),
    [subs, tier, status],
  );

  const activeSubs = subs.filter(
    (u) => u.subscription_status === 'authorized',
  );

  const renew = (u: AdminUser) => {
    // "Pagado, renovar 30 días": books the payment to today's month (revenue)
    // and pushes paid_until +30 days. Backend extends from the later of the
    // current paid_until or now, so an early renewal never loses paid days.
    renewM.mutate({ id: u.id, amount: feeOf(u), method: 'transfer' });
  };

  const tierStats = (['premium', 'full', 'basico'] as SubscriptionTier[]).map(
    (t) => ({
      tier: t,
      activeCount: activeSubs.filter((u) => u.subscription_tier === t).length,
      otherCount: subs.filter(
        (u) =>
          u.subscription_tier === t &&
          u.subscription_status !== 'authorized',
      ).length,
      contribution: activeSubs
        .filter((u) => u.subscription_tier === t)
        .reduce((sum, u) => sum + feeOf(u), 0),
    }),
  );

  return (
    <div>
      <PageHeader
        eyebrow="03 — Suscripciones"
        title="Suscripciones"
        sub={
          <>
            <span className="font-mono tabular-nums">{activeSubs.length}</span>{' '}
            activas · MRR estimado{' '}
            <span className="font-mono tabular-nums text-foreground">
              {fmtARS(statsQ.data?.mrr_estimated ?? 0)}
            </span>
            {statsQ.data && (
              <>
                {' '}
                · churn{' '}
                <span className="font-mono tabular-nums">
                  {statsQ.data.churn_pct.toFixed(1)}%
                </span>
              </>
            )}
          </>
        }
        actions={
          <Button variant="outline" size="sm" asChild>
            <a
              href="https://www.mercadopago.com.ar/subscriptions"
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink data-icon="inline-start" />
              Abrir en MercadoPago
            </a>
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tierStats.map((t) => (
          <div key={t.tier} className="rounded-2xl border bg-card p-[18px]">
            <div className="mb-3 flex items-start justify-between">
              <TierBadge tier={t.tier} />
              <span className="font-mono tabular-nums text-xs text-muted-foreground">
                {fmtARS(TIER_PRICE[t.tier])}/mes
              </span>
            </div>
            <div className="font-mono tabular-nums text-[28px] font-bold leading-none">
              {t.activeCount}
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              <span className="font-mono tabular-nums">{t.otherCount}</span>{' '}
              pausadas o canceladas · contribución{' '}
              <span className="font-mono tabular-nums text-foreground">
                {fmtARS(t.contribution)}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mb-4 rounded-2xl border bg-card p-3">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented<TierKey>
            value={tier}
            onChange={setTier}
            options={[
              { key: 'all', label: 'Todos los planes' },
              { key: 'premium', label: 'Premium' },
              { key: 'full', label: 'Full' },
              { key: 'basico', label: 'Básico' },
            ]}
          />
          <div className="h-[22px] w-px bg-border" />
          <Segmented<StatusKey>
            value={status}
            onChange={setStatus}
            options={[
              { key: 'all', label: 'Cualquier estado' },
              { key: 'authorized', label: 'Activas' },
              { key: 'paused', label: 'Pausadas' },
              { key: 'cancelled', label: 'Canceladas' },
            ]}
          />
          <div className="ml-auto text-xs text-muted-foreground">
            <span className="font-mono tabular-nums">{filtered.length}</span>{' '}
            resultados
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card">
        {usersQ.isLoading ? (
          <div className="space-y-px p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-md" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Sin suscripciones para esos filtros.
          </div>
        ) : (
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b">
                <TableHead>
                  <ColLabel>Cliente</ColLabel>
                </TableHead>
                <TableHead>
                  <ColLabel>Plan</ColLabel>
                </TableHead>
                <TableHead>
                  <ColLabel>Estado</ColLabel>
                </TableHead>
                <TableHead>
                  <ColLabel>Vence el</ColLabel>
                </TableHead>
                <TableHead>
                  <ColLabel>Mes = {monthLabel()}</ColLabel>
                </TableHead>
                <TableHead className="text-right">
                  <ColLabel>Valor</ColLabel>
                </TableHead>
                <TableHead className="text-right">
                  <ColLabel>Renovar</ColLabel>
                </TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => {
                const price = feeOf(u);
                const info = expiryInfo(u.paid_until);
                const paid = isPaidThisMonth(u.paid_until);
                const renewing =
                  renewM.isPending && renewM.variables?.id === u.id;
                return (
                  <TableRow
                    key={u.id}
                    onClick={() => navigate(`/admin/users/${u.id}`)}
                    className="cursor-pointer hover:bg-muted/35"
                  >
                    <TableCell className="max-w-0">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={u.name ?? u.email} />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">
                            {u.name ?? u.email.split('@')[0]}
                          </div>
                          <div className="truncate font-mono text-xs text-muted-foreground">
                            {u.email}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <TierBadge tier={u.subscription_tier} />
                    </TableCell>
                    <TableCell>
                      <SubStatusBadge status={u.subscription_status} />
                    </TableCell>
                    <TableCell>
                      <VenceCell info={info} paidUntil={u.paid_until} />
                    </TableCell>
                    <TableCell>
                      <MonthPaidBadge paid={paid} />
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-mono tabular-nums font-semibold">
                        {fmtARS(price)}
                      </span>
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant={paid ? 'outline' : 'default'}
                        size="sm"
                        disabled={renewing}
                        onClick={() => renew(u)}
                        title="Marca pagado y renueva 30 días"
                      >
                        <RefreshCw
                          data-icon="inline-start"
                          className={renewing ? 'animate-spin' : undefined}
                        />
                        {renewing ? 'Renovando…' : 'Pagado, renovar 30 días'}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <ChevronRight
                        size={14}
                        className="text-muted-foreground"
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
        )}
      </div>
    </div>
  );
}

function ColLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </span>
  );
}

const URGENT_TEXT: Partial<Record<ExpiryUrgency, string>> = {
  expired: 'VENCIÓ',
  today: 'VENCE HOY',
  tomorrow: 'VENCE MAÑANA',
};

function VenceCell({
  info,
  paidUntil,
}: {
  info: ReturnType<typeof expiryInfo>;
  paidUntil: string | null;
}) {
  if (info.urgency === 'infinity') {
    return (
      <span className="font-mono text-xs text-muted-foreground">
        Sin vencimiento
      </span>
    );
  }
  const urgent =
    info.urgency === 'expired' ||
    info.urgency === 'today' ||
    info.urgency === 'tomorrow';
  const label = URGENT_TEXT[info.urgency];
  return (
    <div className="flex flex-col">
      <span
        className={
          urgent
            ? 'font-mono text-xs font-bold uppercase tracking-wide text-destructive'
            : info.urgency === 'soon'
              ? 'font-mono tabular-nums text-xs font-semibold text-amber-600'
              : 'font-mono tabular-nums text-xs text-muted-foreground'
        }
      >
        {label ?? fmtShortDate(paidUntil)}
      </span>
      {label && (
        <span className="font-mono tabular-nums text-[10px] text-muted-foreground">
          {fmtShortDate(paidUntil)}
        </span>
      )}
    </div>
  );
}

function MonthPaidBadge({ paid }: { paid: boolean }) {
  return paid ? (
    <span className="inline-flex items-center rounded-md bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
      Pagado
    </span>
  ) : (
    <span className="inline-flex items-center rounded-md bg-destructive/15 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-destructive">
      No pagado — renovar?
    </span>
  );
}
