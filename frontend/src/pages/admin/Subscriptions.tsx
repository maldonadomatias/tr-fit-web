import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ExternalLink } from 'lucide-react';
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
import { useAdminUsers } from '@/hooks/useAdminUsers';
import { useAdminStats } from '@/hooks/useAdminStats';
import { fmtARS, fmtShortDate } from '@/lib/format';
import type { SubscriptionStatus, SubscriptionTier } from '@/types/api';

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

  const subs = useMemo(
    () =>
      (usersQ.data ?? []).filter((u) => u.subscription_tier !== null),
    [usersQ.data],
  );

  const filtered = useMemo(
    () =>
      subs.filter((u) => {
        if (tier !== 'all' && u.subscription_tier !== tier) return false;
        if (status !== 'all' && u.subscription_status !== status) return false;
        return true;
      }),
    [subs, tier, status],
  );

  const activeSubs = subs.filter(
    (u) => u.subscription_status === 'authorized',
  );

  const tierStats = (['premium', 'full', 'basico'] as SubscriptionTier[]).map(
    (t) => ({
      tier: t,
      activeCount: activeSubs.filter((u) => u.subscription_tier === t).length,
      otherCount: subs.filter(
        (u) =>
          u.subscription_tier === t &&
          u.subscription_status !== 'authorized',
      ).length,
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

      <div className="mb-6 grid grid-cols-3 gap-4">
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
                {fmtARS(t.activeCount * TIER_PRICE[t.tier])}
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
                  <ColLabel>Próxima renovación</ColLabel>
                </TableHead>
                <TableHead className="text-right">
                  <ColLabel>Precio</ColLabel>
                </TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => {
                const price = TIER_PRICE[u.subscription_tier!];
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
                      <span className="font-mono tabular-nums text-xs text-muted-foreground">
                        {u.current_period_end
                          ? fmtShortDate(u.current_period_end)
                          : '—'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-mono tabular-nums font-semibold">
                        {fmtARS(price)}
                      </span>
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
