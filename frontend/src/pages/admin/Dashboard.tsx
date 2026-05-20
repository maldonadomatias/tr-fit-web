import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity as ActivityIcon,
  Check,
  CheckCircle,
  ChevronRight,
  Clock,
  Download,
  Plus,
  TrendingUp,
  UserPlus,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/admin/PageHeader';
import { Eyebrow } from '@/components/admin/Eyebrow';
import { KpiCard } from '@/components/admin/KpiCard';
import { Donut } from '@/components/admin/Donut';
import { Avatar } from '@/components/admin/Avatar';
import { RoleBadge } from '@/components/admin/RoleBadge';
import { TierBadge } from '@/components/admin/TierBadge';
import { Timeline, type TimelineEntry } from '@/components/admin/Timeline';
import { CreateUserDialog } from '@/components/admin/CreateUserDialog';
import { useAdminStats } from '@/hooks/useAdminStats';
import {
  useAdminUsers,
  useUpdateAdminUser,
} from '@/hooks/useAdminUsers';
import { fmtARS, fmtDelta, fmtTimeAgo } from '@/lib/format';
import type { AdminUser, SubscriptionTier } from '@/types/api';
import { cn } from '@/lib/utils';

export default function Dashboard() {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const stats = useAdminStats();
  const pendingQ = useAdminUsers({ status: 'pending' });
  const usersQ = useAdminUsers({});

  return (
    <div>
      <PageHeader
        eyebrow="01 — Panel"
        title="Hola Tato, esto es lo que está pasando"
        sub={
          <>
            Resumen del último mes
            {stats.dataUpdatedAt > 0 && (
              <>
                {' · actualizado '}
                <span className="font-mono tabular-nums">
                  hace {fmtTimeAgo(new Date(stats.dataUpdatedAt))}
                </span>
              </>
            )}
          </>
        }
        actions={
          <>
            <Button variant="outline" size="sm">
              <Download data-icon="inline-start" />
              Exportar
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus data-icon="inline-start" />
              Nuevo usuario
            </Button>
          </>
        }
      />

      <KpiRow stats={stats.data} loading={stats.isLoading} totalAthletes={
        usersQ.data?.filter((u) => u.role === 'athlete').length ?? null
      } />

      <SecondaryRow stats={stats.data} users={usersQ.data} />

      <div className="grid grid-cols-[1fr_320px] gap-[22px]">
        <PendingPanel
          users={pendingQ.data}
          loading={pendingQ.isLoading}
        />
        <ActivityPanel onAll={() => navigate('/admin/activity')} />
      </div>

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function KpiRow({
  stats,
  loading,
  totalAthletes,
}: {
  stats: ReturnType<typeof useAdminStats>['data'];
  loading: boolean;
  totalAthletes: number | null;
}) {
  if (loading || !stats) {
    return (
      <div className="mb-6 grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[140px] rounded-2xl" />
        ))}
      </div>
    );
  }
  return (
    <div className="mb-6 grid grid-cols-4 gap-4">
      <KpiCard
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <UserPlus size={12} />
            Altas 30 d
          </span>
        }
        value={stats.signups_30d}
        delta={fmtDelta(stats.signups_delta_pct, { suffix: '%' })}
        deltaTone={stats.signups_delta_pct >= 0 ? 'up' : 'down'}
        trend={stats.signups_trend}
      />
      <KpiCard
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <Clock size={12} />
            Pendientes
          </span>
        }
        value={stats.pending_count}
        sub={
          <Link
            to="/admin/pending"
            className="underline-offset-2 hover:underline"
          >
            revisar cola →
          </Link>
        }
        highlighted={stats.pending_count > 0}
      />
      <KpiCard
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle size={12} />
            Suscripciones activas
          </span>
        }
        value={stats.active_subs}
        delta={
          stats.active_subs_delta !== 0
            ? fmtDelta(stats.active_subs_delta, { digits: 0 })
            : undefined
        }
        deltaTone={stats.active_subs_delta >= 0 ? 'up' : 'down'}
        sub={
          totalAthletes != null && (
            <>
              de{' '}
              <span className="font-mono tabular-nums">{totalAthletes}</span>{' '}
              atletas
            </>
          )
        }
      />
      <KpiCard
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <TrendingUp size={12} />
            MRR estimado
          </span>
        }
        value={fmtARS(stats.mrr_estimated)}
        delta={fmtDelta(stats.mrr_delta_pct, { suffix: '%' })}
        deltaTone={stats.mrr_delta_pct >= 0 ? 'up' : 'down'}
        trend={stats.mrr_trend}
      />
    </div>
  );
}

function SecondaryRow({
  stats,
  users,
}: {
  stats: ReturnType<typeof useAdminStats>['data'];
  users: AdminUser[] | undefined;
}) {
  if (!stats) {
    return (
      <div className="mb-6 grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[148px] rounded-2xl" />
        ))}
      </div>
    );
  }
  const total = users?.length ?? 0;
  const unverified = users?.filter((u) => !u.email_verified).length ?? 0;
  const verifiedOf = Math.round((stats.verified_pct / 100) * total);

  return (
    <div className="mb-6 grid grid-cols-3 gap-4">
      <div className="rounded-2xl border bg-card p-[18px]">
        <div className="flex items-center gap-4">
          <Donut
            value={stats.verified_pct}
            size={96}
            stroke={9}
            label={`${stats.verified_pct}%`}
            sub="verificado"
          />
          <div className="min-w-0">
            <Eyebrow variant="muted">Email verificado</Eyebrow>
            <div className="mt-2 text-[17px] font-semibold tracking-tight">
              <span className="font-mono tabular-nums">{verifiedOf}</span> de{' '}
              <span className="font-mono tabular-nums">{total}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {unverified > 0 ? (
                <>
                  <span className="font-mono tabular-nums">{unverified}</span>{' '}
                  sin verificar
                </>
              ) : (
                'todos verificados'
              )}
            </div>
          </div>
        </div>
      </div>

      <BarChartCard trend={stats.signups_trend} total={stats.signups_30d} />

      <TierDistCard users={users} stats={stats} />
    </div>
  );
}

function BarChartCard({ trend, total }: { trend: number[]; total: number }) {
  const max = Math.max(...trend, 1);
  return (
    <div className="rounded-2xl border bg-card p-[18px]">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <Eyebrow variant="muted">Altas por día</Eyebrow>
          <div className="mt-1 text-[17px] font-semibold tracking-tight">
            Últimas 4 semanas
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          total{' '}
          <span className="font-mono tabular-nums font-semibold text-foreground">
            {total}
          </span>
        </div>
      </div>
      <div className="flex h-20 items-end gap-1.5">
        {trend.map((v, i) => {
          const h = (v / max) * 100;
          const isLast = i >= trend.length - 3;
          return (
            <div
              key={i}
              className={cn(
                'flex-1 rounded-sm',
                isLast ? 'bg-brand' : 'bg-muted',
              )}
              style={{ height: `${Math.max(h, 3)}%` }}
              title={`Día ${i + 1}: ${v}`}
            />
          );
        })}
      </div>
    </div>
  );
}

function TierDistCard({
  users,
  stats,
}: {
  users: AdminUser[] | undefined;
  stats: { churn_pct: number; churn_delta_pp: number };
}) {
  const breakdown = useMemo(() => {
    const tiers: SubscriptionTier[] = ['premium', 'full', 'basico'];
    const active = (users ?? []).filter(
      (u) => u.subscription_status === 'authorized',
    );
    return tiers.map((t) => ({
      tier: t,
      count: active.filter((u) => u.subscription_tier === t).length,
    }));
  }, [users]);
  const max = Math.max(...breakdown.map((b) => b.count), 1);

  return (
    <div className="rounded-2xl border bg-card p-[18px]">
      <Eyebrow variant="muted">Distribución por plan</Eyebrow>
      <div className="mb-3 mt-1 text-[17px] font-semibold tracking-tight">
        Suscripciones activas
      </div>
      <div className="flex flex-col gap-2">
        {breakdown.map((b) => (
          <div key={b.tier} className="flex items-center gap-3">
            <div className="w-[70px]">
              <TierBadge tier={b.tier} />
            </div>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full',
                  b.tier === 'premium' ? 'bg-brand' : 'bg-primary',
                  b.tier === 'basico' && 'opacity-50',
                )}
                style={{ width: `${(b.count / max) * 100}%` }}
              />
            </div>
            <div className="w-[30px] text-right font-mono tabular-nums text-sm">
              {b.count}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          <span className="font-mono tabular-nums">
            {stats.churn_pct.toFixed(1)}%
          </span>{' '}
          churn ·{' '}
          <span
            className={cn(
              'font-mono tabular-nums',
              stats.churn_delta_pp <= 0 ? 'text-brand' : 'text-destructive',
            )}
          >
            {fmtDelta(stats.churn_delta_pp, { suffix: 'pp' })}
          </span>
        </span>
        <Link
          to="/admin/subscriptions"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Detalle <ChevronRight size={12} className="inline -mt-0.5" />
        </Link>
      </div>
    </div>
  );
}

function PendingPanel({
  users,
  loading,
}: {
  users: AdminUser[] | undefined;
  loading: boolean;
}) {
  const navigate = useNavigate();
  const visible = (users ?? []).slice(0, 4);
  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex items-center justify-between p-[18px] pb-[14px]">
        <div>
          <Eyebrow variant="brand">Acción requerida</Eyebrow>
          <h3 className="mt-1 text-[17px] font-semibold tracking-tight">
            Cola de pendientes
          </h3>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/admin/pending')}
        >
          Ver los {users?.length ?? 0}
          <ChevronRight data-icon="inline-end" />
        </Button>
      </div>
      <div>
        {loading && (
          <div className="space-y-3 p-[18px] pt-0">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[68px] rounded-md" />
            ))}
          </div>
        )}
        {!loading && visible.length === 0 && (
          <div className="px-[18px] pb-[18px] text-sm text-muted-foreground">
            No hay usuarios pendientes.
          </div>
        )}
        {!loading &&
          visible.map((u) => (
            <PendingRow
              key={u.id}
              user={u}
              onOpen={() => navigate(`/admin/users/${u.id}`)}
            />
          ))}
      </div>
    </div>
  );
}

function PendingRow({
  user,
  onOpen,
}: {
  user: AdminUser;
  onOpen: () => void;
}) {
  const mut = useUpdateAdminUser(user.id);
  const approve = () =>
    mut.mutate(
      { status: 'approved' },
      {
        onSuccess: () => toast.success('Usuario aprobado'),
        onError: (e) =>
          toast.error(`No se pudo aprobar: ${(e as Error).message}`),
      },
    );
  const reject = () =>
    mut.mutate(
      { status: 'rejected' },
      {
        onSuccess: () => toast.success('Usuario rechazado'),
        onError: (e) =>
          toast.error(`No se pudo rechazar: ${(e as Error).message}`),
      },
    );

  return (
    <div className="flex items-center gap-3 border-t border-border px-[18px] py-3">
      <Avatar name={user.name ?? user.email} brand />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">
            {user.name ?? user.email.split('@')[0]}
          </span>
          <RoleBadge role={user.role} />
        </div>
        <div className="truncate text-xs text-muted-foreground">
          <span className="font-mono">{user.email}</span> · esperando{' '}
          <span className="font-mono tabular-nums">
            {fmtTimeAgo(user.created_at)}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="xs"
          onClick={reject}
          disabled={mut.isPending}
        >
          <X data-icon="inline-start" />
          Rechazar
        </Button>
        <Button
          variant="brand"
          size="xs"
          onClick={approve}
          disabled={mut.isPending}
        >
          <Check data-icon="inline-start" />
          Aprobar
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onOpen}
          aria-label="Abrir detalle"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

function ActivityPanel({ onAll }: { onAll: () => void }) {
  // Placeholder activity until /admin/activity backend lands (Phase 8).
  const items: TimelineEntry[] = [
    {
      id: 'placeholder',
      title: 'Sin eventos por ahora',
      sub: 'La bitácora del sistema va a aparecer acá cuando esté lista.',
      severity: null,
    },
  ];
  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex items-center justify-between p-[18px] pb-[14px]">
        <div>
          <Eyebrow variant="muted">Bitácora</Eyebrow>
          <h3 className="mt-1 text-[17px] font-semibold tracking-tight">
            Actividad reciente
          </h3>
        </div>
        <Button variant="ghost" size="sm" onClick={onAll}>
          Todo
          <ChevronRight data-icon="inline-end" />
        </Button>
      </div>
      <div className="px-[18px] pb-[18px]">
        <Timeline items={items} />
      </div>
      <div className="hidden">
        <ActivityIcon />
      </div>
    </div>
  );
}
