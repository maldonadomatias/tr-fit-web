import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  Copy,
  ExternalLink,
  Mail,
  MailCheck,
  RefreshCw,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Eyebrow } from '@/components/admin/Eyebrow';
import { Avatar } from '@/components/admin/Avatar';
import { RoleBadge } from '@/components/admin/RoleBadge';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { TierBadge } from '@/components/admin/TierBadge';
import { SubStatusBadge } from '@/components/admin/SubStatusBadge';
import { Segmented } from '@/components/admin/Segmented';
import { Donut } from '@/components/admin/Donut';
import { Timeline, type TimelineEntry } from '@/components/admin/Timeline';
import { AdminTabs } from '@/components/admin/AdminTabs';
import { DangerRow } from '@/components/admin/DangerRow';
import {
  useAdminUser,
  useCancelSubscription,
  useDeleteUser,
  useUpdateAdminUser,
  useUpsertSubscription,
} from '@/hooks/useAdminUsers';
import { useActivityLog } from '@/hooks/useActivityLog';
import { activityLabel, activitySub } from '@/lib/activity';
import { useAuth } from '@/hooks/useAuth';
import { fmtARS, fmtShortDate, fmtTimeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import type {
  AdminUser,
  Role,
  SubscriptionStatus,
  SubscriptionTier,
  UserStatus,
} from '@/types/api';

const TAB_KEYS = ['resumen', 'estado', 'suscripcion', 'actividad', 'peligro'] as const;
type TabKey = (typeof TAB_KEYS)[number];

const TIER_PRICE: Record<SubscriptionTier, number> = {
  basico: 15000,
  full: 25000,
  premium: 70000,
};
const TIER_LABEL: Record<SubscriptionTier, string> = {
  basico: 'Plan ver-only',
  full: 'Registro completo',
  premium: 'Reportes coach',
};

export default function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const { data: user, isLoading, error } = useAdminUser(id);
  const activityQ = useActivityLog(id ? { target_id: id, limit: 50 } : {});
  const [tab, setTab] = useState<TabKey>('resumen');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isSelf = me?.id === id;

  if (isLoading) {
    return (
      <div>
        <Link
          to="/admin/users"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft size={14} />
          Volver a usuarios
        </Link>
        <Skeleton className="h-[148px] rounded-2xl" />
        <div className="mt-4 grid grid-cols-[1fr_320px] gap-4">
          <Skeleton className="h-[320px] rounded-2xl" />
          <Skeleton className="h-[320px] rounded-2xl" />
        </div>
      </div>
    );
  }
  if (error || !user) {
    return (
      <div className="rounded-2xl border bg-card p-10 text-center">
        <p className="text-sm font-semibold">Usuario no encontrado.</p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link to="/admin/users">Volver a usuarios</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <Link
        to="/admin/users"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft size={14} />
        Volver a usuarios
      </Link>

      <IdentityCard user={user} isSelf={isSelf} />

      <AdminTabs
        tabs={[
          { key: 'resumen', label: 'Resumen' },
          { key: 'estado', label: 'Estado de la cuenta' },
          { key: 'suscripcion', label: 'Suscripción' },
          {
            key: 'actividad',
            label: 'Actividad',
            count: activityQ.data?.length ?? undefined,
          },
          { key: 'peligro', label: 'Zona peligrosa' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'resumen' && <ResumenTab user={user} />}
      {tab === 'estado' && <EstadoTab user={user} isSelf={isSelf} />}
      {tab === 'suscripcion' && <SuscripcionTab user={user} />}
      {tab === 'actividad' && <ActividadTab user={user} />}
      {tab === 'peligro' && (
        <PeligroTab
          user={user}
          isSelf={isSelf}
          onAskDelete={() => setConfirmDelete(true)}
        />
      )}

      <ConfirmDeleteDialog
        open={confirmDelete}
        user={user}
        onClose={() => setConfirmDelete(false)}
        onDeleted={() => navigate('/admin/users')}
      />
    </div>
  );
}

function IdentityCard({
  user,
  isSelf,
}: {
  user: AdminUser;
  isSelf: boolean;
}) {
  const update = useUpdateAdminUser(user.id);
  const onApprove = () =>
    update.mutate(
      { status: 'approved' },
      {
        onSuccess: () => toast.success('Usuario aprobado'),
        onError: (e) =>
          toast.error(`No se pudo aprobar: ${(e as Error).message}`),
      },
    );
  const onReject = () =>
    update.mutate(
      { status: 'rejected' },
      {
        onSuccess: () => toast.success('Usuario rechazado'),
        onError: (e) =>
          toast.error(`No se pudo rechazar: ${(e as Error).message}`),
      },
    );
  function copyId() {
    void navigator.clipboard.writeText(user.id);
    toast.success('ID copiado');
  }

  return (
    <div className="mb-4 rounded-2xl border bg-card p-[22px]">
      <div className="flex items-start gap-5">
        <Avatar
          name={user.name ?? user.email}
          size="xl"
          brand
        />
        <div className="min-w-0 flex-1">
          <Eyebrow variant="brand">Detalle de cuenta</Eyebrow>
          <h1 className="mt-1 text-[22px] font-bold leading-7 tracking-tight">
            {user.name ?? user.email.split('@')[0]}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono text-foreground">{user.email}</span>
            {user.email_verified ? (
              <span className="inline-flex items-center gap-1 text-brand">
                <MailCheck size={12} />
                verificado{' '}
                {user.email_verified_at && (
                  <span className="font-mono tabular-nums">
                    {fmtShortDate(user.email_verified_at)}
                  </span>
                )}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <Mail size={12} />
                sin verificar
              </span>
            )}
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              ID{' '}
              <span className="font-mono text-foreground">
                {user.id.slice(0, 8)}…
              </span>
            </span>
            <button
              type="button"
              onClick={copyId}
              title="Copiar id"
              className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Copy size={12} />
            </button>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              creado el{' '}
              <span className="font-mono tabular-nums text-foreground">
                {fmtShortDate(user.created_at)}
              </span>
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <RoleBadge role={user.role} />
            <StatusBadge status={user.status} />
            {user.subscription_tier && (
              <>
                <TierBadge tier={user.subscription_tier} />
                <SubStatusBadge status={user.subscription_status} />
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {user.status === 'pending' ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onReject}
                disabled={update.isPending || isSelf}
              >
                <X data-icon="inline-start" />
                Rechazar
              </Button>
              <Button
                variant="brand"
                size="sm"
                onClick={onApprove}
                disabled={update.isPending || isSelf}
              >
                <Check data-icon="inline-start" />
                Aprobar
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <Mail data-icon="inline-start" />
                Reenviar verificación
              </Button>
              <Button variant="outline" size="sm" disabled={isSelf}>
                <RefreshCw data-icon="inline-start" />
                Forzar logout
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResumenTab({ user }: { user: AdminUser }) {
  return (
    <div className="grid grid-cols-[1fr_320px] gap-4">
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border bg-card">
          <div className="border-b border-border p-[18px]">
            <Eyebrow variant="muted">Datos del usuario</Eyebrow>
            <div className="mt-1 text-[17px] font-semibold tracking-tight">
              Identidad
            </div>
          </div>
          <dl className="grid grid-cols-[160px_1fr] gap-y-3 p-[18px] text-sm">
            <Kv label="Nombre" value={user.name ?? '—'} />
            <Kv label="Email" value={user.email} mono />
            <Kv label="Rol" value={<RoleBadge role={user.role} />} />
            <Kv label="Estado" value={<StatusBadge status={user.status} />} />
            <Kv
              label="Verificado"
              value={
                user.email_verified ? (
                  <span className="font-mono tabular-nums">
                    {fmtShortDate(user.email_verified_at ?? '')}
                  </span>
                ) : (
                  <span className="text-muted-foreground">sin verificar</span>
                )
              }
            />
            <Kv
              label="Creado"
              value={fmtShortDate(user.created_at)}
              mono
            />
            <Kv label="Última sesión" value="—" mono />
          </dl>
        </div>

        <div className="rounded-2xl border bg-card">
          <div className="border-b border-border p-[18px]">
            <Eyebrow variant="muted">Plan actual</Eyebrow>
            <div className="mt-1 text-[17px] font-semibold tracking-tight">
              Suscripción
            </div>
          </div>
          <div className="p-[18px]">
            {user.subscription_tier ? (
              <div className="flex flex-wrap items-center gap-4">
                <TierBadge tier={user.subscription_tier} />
                <SubStatusBadge status={user.subscription_status} />
                {user.current_period_end && (
                  <span className="text-xs text-muted-foreground">
                    Próxima renovación{' '}
                    <span className="font-mono tabular-nums text-foreground">
                      {fmtShortDate(user.current_period_end)}
                    </span>
                  </span>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Este usuario no tiene suscripción activa.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border bg-muted/40 p-[18px]">
          <Eyebrow variant="muted">Engagement 30 d</Eyebrow>
          <div className="mt-3 flex items-center gap-4">
            <Donut value={0} size={80} stroke={8} label={0} sub="sesiones" />
            <div className="flex flex-col gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Asistencia
                </div>
                <div className="font-mono tabular-nums font-semibold">0%</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Racha
                </div>
                <div className="font-mono tabular-nums font-semibold">
                  0 días
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-[18px]">
          <Eyebrow variant="muted">Soporte</Eyebrow>
          <div className="mt-3 flex flex-col gap-2">
            <Button variant="outline" size="sm" className="justify-start">
              <Mail data-icon="inline-start" />
              Reenviar email de verificación
            </Button>
            <Button variant="outline" size="sm" className="justify-start">
              <RefreshCw data-icon="inline-start" />
              Generar link de reseteo
            </Button>
            <Button variant="outline" size="sm" className="justify-start">
              <ExternalLink data-icon="inline-start" />
              Abrir como usuario
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kv({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </dt>
      <dd className={cn(mono && 'font-mono tabular-nums')}>{value}</dd>
    </>
  );
}

function EstadoTab({
  user,
  isSelf,
}: {
  user: AdminUser;
  isSelf: boolean;
}) {
  const update = useUpdateAdminUser(user.id);
  const [status, setStatus] = useState<UserStatus>(user.status);
  const [role, setRole] = useState<Role>(user.role);
  const [verified, setVerified] = useState(user.email_verified);

  useEffect(() => {
    setStatus(user.status);
    setRole(user.role);
    setVerified(user.email_verified);
  }, [user.status, user.role, user.email_verified]);

  const dirty =
    status !== user.status ||
    role !== user.role ||
    verified !== user.email_verified;

  function save() {
    const patch: Parameters<typeof update.mutate>[0] = {};
    if (status !== user.status) patch.status = status;
    if (role !== user.role) patch.role = role;
    if (verified !== user.email_verified) patch.email_verified = verified;
    update.mutate(patch, {
      onSuccess: () => toast.success('Usuario actualizado'),
      onError: (e) =>
        toast.error(`No se pudo actualizar: ${(e as Error).message}`),
    });
  }
  function discard() {
    setStatus(user.status);
    setRole(user.role);
    setVerified(user.email_verified);
  }

  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex flex-col gap-6 p-[22px]">
        <Field label="Estado de la cuenta">
          <Segmented<UserStatus>
            value={status}
            onChange={setStatus}
            options={[
              { key: 'approved', label: 'Aprobado' },
              { key: 'pending', label: 'Pendiente' },
              { key: 'rejected', label: 'Rechazado' },
            ]}
          />
          {isSelf && status !== 'approved' && (
            <span className="text-xs text-destructive">
              No podés modificar tu propio estado.
            </span>
          )}
        </Field>

        <Field label="Rol">
          <Segmented<Role>
            value={role}
            onChange={setRole}
            options={[
              { key: 'athlete', label: 'Atleta' },
              { key: 'coach', label: 'Coach' },
              { key: 'admin', label: 'Admin' },
            ]}
          />
          {isSelf && role !== 'admin' && (
            <span className="text-xs text-destructive">
              No podés cambiar tu propio rol.
            </span>
          )}
        </Field>

        <Field label="Email verificado">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={verified ? 'brand' : 'outline'}>
              {verified ? 'Verificado' : 'Sin verificar'}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVerified(!verified)}
            >
              {verified ? 'Quitar verificación' : 'Forzar verificación'}
            </Button>
            {verified && user.email_verified_at && (
              <span className="text-xs text-muted-foreground">
                desde{' '}
                <span className="font-mono tabular-nums">
                  {fmtShortDate(user.email_verified_at)}
                </span>
              </span>
            )}
          </div>
        </Field>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" size="sm" onClick={discard} disabled={!dirty}>
            Descartar cambios
          </Button>
          <Button
            size="sm"
            onClick={save}
            disabled={!dirty || update.isPending || (isSelf && (status !== 'approved' || role !== 'admin'))}
          >
            {update.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      {children}
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function SuscripcionTab({ user }: { user: AdminUser }) {
  const upsert = useUpsertSubscription(user.id);
  const cancel = useCancelSubscription(user.id);
  const [tier, setTier] = useState<SubscriptionTier>(
    user.subscription_tier ?? 'full',
  );
  const [subStatus, setSubStatus] = useState<SubscriptionStatus>(
    user.subscription_status ?? 'authorized',
  );

  useEffect(() => {
    setTier(user.subscription_tier ?? 'full');
    setSubStatus(user.subscription_status ?? 'authorized');
  }, [user.subscription_tier, user.subscription_status]);

  const hasSub = !!user.subscription_tier;
  const dirty =
    !hasSub ||
    tier !== user.subscription_tier ||
    subStatus !== user.subscription_status;

  function save() {
    upsert.mutate(
      { tier, status: subStatus },
      {
        onSuccess: () =>
          toast.success(hasSub ? 'Suscripción actualizada' : 'Suscripción creada'),
        onError: () =>
          toast.error(
            hasSub
              ? 'No se pudo guardar la suscripción'
              : 'No se pudo crear la suscripción',
          ),
      },
    );
  }
  function cancelSub() {
    cancel.mutate(undefined, {
      onSuccess: () => toast.success('Suscripción cancelada'),
      onError: () => toast.error('No se pudo cancelar'),
    });
  }
  function discard() {
    setTier(user.subscription_tier ?? 'full');
    setSubStatus(user.subscription_status ?? 'authorized');
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border bg-card p-[22px]">
        <Eyebrow variant="muted">Estado actual</Eyebrow>
        {hasSub && user.subscription_tier && user.subscription_status ? (
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Plan
              </div>
              <div className="mt-1">
                <TierBadge tier={user.subscription_tier} />
              </div>
            </div>
            <div className="h-9 w-px bg-border" />
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Estado
              </div>
              <div className="mt-1">
                <SubStatusBadge status={user.subscription_status} />
              </div>
            </div>
            {user.current_period_end && (
              <>
                <div className="h-9 w-px bg-border" />
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    Próxima renovación
                  </div>
                  <div className="mt-1 font-mono tabular-nums font-semibold">
                    {fmtShortDate(user.current_period_end)}
                  </div>
                </div>
              </>
            )}
            <div className="ml-auto">
              <Button variant="outline" size="sm">
                <ExternalLink data-icon="inline-start" />
                Ver en MercadoPago
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-2 text-sm text-muted-foreground">
            Sin suscripción activa.
          </div>
        )}
      </div>

      <div className="rounded-2xl border bg-card">
        <div className="border-b border-border p-[18px]">
          <Eyebrow variant="muted">
            {hasSub ? 'Editar suscripción' : 'Crear suscripción manual'}
          </Eyebrow>
          <div className="mt-1 text-[17px] font-semibold tracking-tight">
            {hasSub ? 'Cambios manuales' : 'Sin pasar por MercadoPago'}
          </div>
        </div>
        <div className="flex flex-col gap-5 p-[18px]">
          <Field
            label="Plan"
            hint="El cambio se aplica al próximo período de cobro."
          >
            <div className="grid max-w-[540px] grid-cols-3 gap-2">
              {(['basico', 'full', 'premium'] as SubscriptionTier[]).map(
                (t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTier(t)}
                    className={cn(
                      'rounded-2xl border p-[14px] text-left transition-colors',
                      tier === t
                        ? 'border-brand bg-brand/6'
                        : 'border-border bg-background hover:bg-muted/40',
                    )}
                  >
                    <TierBadge tier={t} className="mb-1.5" />
                    <div className="font-mono tabular-nums text-sm font-semibold">
                      {fmtARS(TIER_PRICE[t])}{' '}
                      <span className="text-muted-foreground">/mes</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {TIER_LABEL[t]}
                    </div>
                  </button>
                ),
              )}
            </div>
          </Field>

          <Field label="Estado de pago">
            <Segmented<SubscriptionStatus>
              value={subStatus}
              onChange={setSubStatus}
              options={[
                { key: 'authorized', label: 'Activa' },
                { key: 'pending', label: 'Pendiente' },
                { key: 'paused', label: 'Pausada' },
                { key: 'cancelled', label: 'Cancelada' },
              ]}
            />
          </Field>

          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            {hasSub && user.subscription_status !== 'cancelled' && (
              <Button
                variant="destructive"
                size="sm"
                className="mr-auto"
                onClick={cancelSub}
                disabled={cancel.isPending}
              >
                Cancelar suscripción
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={discard}
              disabled={!dirty}
            >
              Descartar
            </Button>
            <Button
              size="sm"
              onClick={save}
              disabled={!dirty || upsert.isPending}
            >
              {upsert.isPending
                ? 'Guardando…'
                : hasSub
                  ? 'Guardar cambios'
                  : 'Crear suscripción'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActividadTab({ user }: { user: AdminUser }) {
  const q = useActivityLog({ target_id: user.id, limit: 50 });
  const events = q.data ?? [];
  const items: TimelineEntry[] =
    events.length === 0
      ? [
          {
            id: 'empty',
            title: 'Sin eventos registrados',
            sub: 'Las acciones sobre este usuario van a aparecer acá.',
            severity: null,
          },
        ]
      : events.map((ev) => {
          const sub = activitySub(ev);
          return {
            id: ev.id,
            title: activityLabel(ev.type),
            sub: (
              <>
                actor <span className="font-mono">{ev.actor}</span>
                {sub && <> · {sub}</>}
              </>
            ),
            time: <>hace {fmtTimeAgo(ev.created_at)}</>,
            severity: ev.severity,
          };
        });
  return (
    <div className="rounded-2xl border bg-card">
      <div className="border-b border-border p-[18px]">
        <Eyebrow variant="muted">Bitácora</Eyebrow>
        <div className="mt-1 text-[17px] font-semibold tracking-tight">
          Actividad de esta cuenta
        </div>
      </div>
      <div className="p-[18px]">
        <Timeline items={items} />
      </div>
    </div>
  );
}

function PeligroTab({
  user,
  isSelf,
  onAskDelete,
}: {
  user: AdminUser;
  isSelf: boolean;
  onAskDelete: () => void;
}) {
  return (
    <div className="rounded-2xl border border-destructive/40 bg-card">
      <div className="flex flex-col gap-4 p-[22px]">
        <div className="flex items-start gap-3">
          <div className="grid size-9 place-items-center rounded-lg bg-destructive/12 text-destructive">
            <AlertTriangle size={18} />
          </div>
          <div>
            <Eyebrow variant="destructive">Zona peligrosa</Eyebrow>
            <div className="mt-1 text-[17px] font-semibold tracking-tight text-destructive">
              Acciones irreversibles
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <DangerRow
            title="Forzar logout en todos los dispositivos"
            body="Invalida los refresh tokens. El usuario va a tener que iniciar sesión de nuevo."
            action="Forzar logout"
            disabled={isSelf}
          />
          <DangerRow
            title="Resetear contraseña"
            body="Genera un link de un solo uso y se lo envía por email al usuario."
            action="Generar link"
          />
          <DangerRow
            title="Eliminar usuario"
            body={
              <>
                Borra al usuario y todos sus datos asociados — perfil,
                sesiones, suscripciones, tokens.
              </>
            }
            action="Eliminar"
            destructive
            onClick={onAskDelete}
            disabled={isSelf}
          />
        </div>
        {isSelf && (
          <p className="text-xs text-muted-foreground">
            No podés eliminar tu propia cuenta de admin.
          </p>
        )}
        <span className="hidden">{user.id}</span>
      </div>
    </div>
  );
}

function ConfirmDeleteDialog({
  open,
  user,
  onClose,
  onDeleted,
}: {
  open: boolean;
  user: AdminUser;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const del = useDeleteUser();
  function run() {
    del.mutate(user.id, {
      onSuccess: () => {
        toast.success('Usuario eliminado');
        onDeleted();
      },
      onError: (e) =>
        toast.error(`No se pudo eliminar: ${(e as Error).message}`),
    });
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            ¿Eliminar a {user.name ?? user.email.split('@')[0]}?
          </DialogTitle>
          <DialogDescription>
            Acción irreversible. Borra{' '}
            <span className="font-mono">{user.email}</span> y todos sus datos
            asociados — perfil, sesiones, suscripciones, tokens.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={del.isPending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={run}
            disabled={del.isPending}
          >
            {del.isPending ? 'Eliminando…' : 'Eliminar definitivamente'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
