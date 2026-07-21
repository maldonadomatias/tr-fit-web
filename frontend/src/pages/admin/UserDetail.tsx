import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  Copy,
  Dumbbell,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
  useForceLogout,
  usePauseMembership,
  useResumeMembership,
  useUpdateAdminUser,
  useUpsertSubscription,
} from '@/hooks/useAdminUsers';
import { useActivityLog } from '@/hooks/useActivityLog';
import { useLoggedSessions } from '@/hooks/useLoggedSessions';
import { useSetMonthlyFee } from '@/hooks/useSetMonthlyFee';
import { useAthleteRms, useSetAthleteRm } from '@/hooks/useAthleteRms';
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

type TabKey =
  | 'resumen'
  | 'entrenamientos'
  | 'rm'
  | 'estado'
  | 'suscripcion'
  | 'actividad'
  | 'peligro';

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
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
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
          { key: 'entrenamientos', label: 'Entrenamientos' },
          { key: 'rm', label: 'RM / Planilla' },
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
      {tab === 'entrenamientos' && <EntrenamientosTab user={user} />}
      {tab === 'rm' && <RmTab user={user} />}
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

function IdentityCard({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  const update = useUpdateAdminUser(user.id);
  const onApprove = () =>
    update.mutate(
      { status: 'approved' },
      {
        onSuccess: () => toast.success('Usuario aprobado'),
        onError: (e) =>
          toast.error(`No se pudo aprobar: ${(e as Error).message}`),
      }
    );
  const onReject = () =>
    update.mutate(
      { status: 'rejected' },
      {
        onSuccess: () => toast.success('Usuario rechazado'),
        onError: (e) =>
          toast.error(`No se pudo rechazar: ${(e as Error).message}`),
      }
    );
  const forceLogout = useForceLogout(user.id);
  const onForceLogout = () =>
    forceLogout.mutate(undefined, {
      onSuccess: () =>
        toast.success(
          'Sesiones cerradas. El logout se hace efectivo en unos minutos.'
        ),
      onError: (e) =>
        toast.error(`No se pudo forzar el logout: ${(e as Error).message}`),
    });
  function copyId() {
    void navigator.clipboard.writeText(user.id);
    toast.success('ID copiado');
  }

  return (
    <div className="mb-4 rounded-2xl border bg-card p-[22px]">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-5">
          <Avatar name={user.name ?? user.email} size="xl" brand />
          <div className="min-w-0 flex-1">
            <Eyebrow variant="brand">Detalle de cuenta</Eyebrow>
            <h1 className="mt-1 text-[22px] font-bold leading-7 tracking-tight">
              {user.name ?? user.email.split('@')[0]}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="break-all font-mono text-foreground">
                {user.email}
              </span>
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={copyId}
                    aria-label="Copiar id"
                    className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Copy size={12} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Copiar id completo</TooltipContent>
              </Tooltip>
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
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2 lg:items-end">
          {user.status === 'pending' ? (
            <div className="flex flex-wrap gap-2">
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
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm">
                <Mail data-icon="inline-start" />
                Reenviar verificación
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onForceLogout}
                disabled={isSelf || forceLogout.isPending}
              >
                <RefreshCw data-icon="inline-start" />
                Forzar logout
              </Button>
            </div>
          )}
          {user.role === 'athlete' && (
            <Button asChild variant="outline" size="sm">
              <Link to={`/admin/rutinas/atleta/${user.id}`}>
                <Dumbbell size={14} className="mr-1" /> Ver rutina activa
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ResumenTab({ user }: { user: AdminUser }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border bg-card">
          <div className="border-b border-border p-[18px]">
            <Eyebrow variant="muted">Datos del usuario</Eyebrow>
            <div className="mt-1 text-[17px] font-semibold tracking-tight">
              Identidad
            </div>
          </div>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-3 p-[18px] text-sm sm:grid-cols-[160px_1fr]">
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
            <Kv label="Creado" value={fmtShortDate(user.created_at)} mono />
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
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn('min-w-0 break-words', mono && 'font-mono tabular-nums')}
      >
        {value}
      </dd>
    </>
  );
}

function EstadoTab({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  const { user: me } = useAuth();
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

  const cantSetSuper =
    (role === 'superadmin' || user.role === 'superadmin') &&
    me?.role !== 'superadmin';

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
              { key: 'admin', label: 'Admin' },
              { key: 'superadmin', label: 'Superadmin' },
            ]}
          />
          {isSelf && role !== 'admin' && (
            <span className="text-xs text-destructive">
              No podés cambiar tu propio rol.
            </span>
          )}
          {cantSetSuper && (
            <span className="text-xs text-muted-foreground">
              Solo un superadmin puede tocar este rol.
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

        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={discard}
            disabled={!dirty}
          >
            Descartar cambios
          </Button>
          <Button
            size="sm"
            onClick={save}
            disabled={
              !dirty ||
              update.isPending ||
              cantSetSuper ||
              (isSelf && (status !== 'approved' || role !== 'admin'))
            }
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
  hint?: ReactNode;
  children: ReactNode;
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

const MEMBERSHIP_LABELS: Record<string, string> = {
  active: 'Activa',
  expiring: 'Por vencer',
  expired: 'Vencida',
  cancelled: 'Cancelada',
  paused: 'Pausada',
};

function MembresiaCard({ user }: { user: AdminUser }) {
  const pause = usePauseMembership(user.id);
  const resume = useResumeMembership(user.id);
  const status = user.membership_status;
  if (user.role !== 'athlete' || !status) return null;

  const onPause = () =>
    pause.mutate(undefined, {
      onSuccess: () =>
        toast.success(
          'Membresía pausada. El acceso queda bloqueado y los días pagados se congelan.'
        ),
      onError: (e) => toast.error(`No se pudo pausar: ${(e as Error).message}`),
    });
  const onResume = () =>
    resume.mutate(undefined, {
      onSuccess: () =>
        toast.success('Membresía reanudada. Los días pausados se acreditaron.'),
      onError: (e) =>
        toast.error(`No se pudo reanudar: ${(e as Error).message}`),
    });

  return (
    <div className="rounded-2xl border bg-card p-[22px]">
      <Eyebrow variant="muted">Membresía</Eyebrow>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Estado
          </div>
          <div className="mt-1 font-semibold">
            {MEMBERSHIP_LABELS[status] ?? status}
          </div>
        </div>
        <div className="h-9 w-px bg-border" />
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Pagado hasta
          </div>
          <div className="mt-1 font-mono tabular-nums font-semibold">
            {user.paid_until
              ? fmtShortDate(user.paid_until)
              : 'Sin vencimiento'}
          </div>
        </div>
        <div className="ml-auto">
          {status === 'paused' ? (
            <Button
              variant="brand"
              size="sm"
              onClick={onResume}
              disabled={resume.isPending}
            >
              Reanudar membresía
            </Button>
          ) : status === 'active' || status === 'expiring' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onPause}
              disabled={pause.isPending}
            >
              Pausar membresía
            </Button>
          ) : null}
        </div>
      </div>
      {status === 'paused' && (
        <p className="mt-3 text-xs text-muted-foreground">
          El alumno no puede iniciar sesión mientras la membresía esté pausada.
          Al reanudar, los días pausados se suman a la fecha de vencimiento.
        </p>
      )}
    </div>
  );
}

function SuscripcionTab({ user }: { user: AdminUser }) {
  const upsert = useUpsertSubscription(user.id);
  const cancel = useCancelSubscription(user.id);
  const setFee = useSetMonthlyFee(user.id);
  const [tier, setTier] = useState<SubscriptionTier>(
    user.subscription_tier ?? 'full'
  );
  const [subStatus, setSubStatus] = useState<SubscriptionStatus>(
    user.subscription_status ?? 'authorized'
  );
  const [cuota, setCuota] = useState(String(user.monthly_fee_ars ?? 25000));

  useEffect(() => {
    setTier(user.subscription_tier ?? 'full');
    setSubStatus(user.subscription_status ?? 'authorized');
    setCuota(String(user.monthly_fee_ars ?? 25000));
  }, [user.subscription_tier, user.subscription_status, user.monthly_fee_ars]);

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
          toast.success(
            hasSub ? 'Suscripción actualizada' : 'Suscripción creada'
          ),
        onError: () =>
          toast.error(
            hasSub
              ? 'No se pudo guardar la suscripción'
              : 'No se pudo crear la suscripción'
          ),
      }
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
      <MembresiaCard user={user} />
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
            <div className="grid max-w-[540px] grid-cols-1 gap-2 sm:grid-cols-2">
              {(['full', 'premium'] as SubscriptionTier[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTier(t)}
                  className={cn(
                    'rounded-2xl border p-[14px] text-left transition-colors',
                    tier === t
                      ? 'border-brand bg-brand/6'
                      : 'border-border bg-background hover:bg-muted/40'
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
              ))}
            </div>
          </Field>

          {/* Cuota mensual — drives the platform 4% */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">
              Cuota mensual (ARS){' '}
              <span className="text-muted-foreground/70">
                (desde {fmtARS(0)}, sin tope)
              </span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={1000}
                value={cuota}
                onChange={(e) => setCuota(e.target.value)}
                className="h-9 w-40 rounded-md border border-border bg-background px-2 text-sm tabular-nums"
              />
              <button
                type="button"
                disabled={setFee.isPending}
                onClick={async () => {
                  const v = Number(cuota);
                  if (cuota.trim() === '' || !Number.isFinite(v) || v < 0) {
                    toast.error('Cuota inválida');
                    return;
                  }
                  try {
                    await setFee.mutateAsync(v);
                    toast.success('Cuota actualizada');
                  } catch {
                    toast.error('No se pudo actualizar');
                  }
                }}
                className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                Guardar
              </button>
            </div>
          </div>

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

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
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

const DAY_LABEL: Record<number, string> = {
  1: 'Lun',
  2: 'Mar',
  3: 'Mié',
  4: 'Jue',
  5: 'Vie',
  6: 'Sáb',
  7: 'Dom',
};

function EntrenamientosTab({ user }: { user: AdminUser }) {
  const q = useLoggedSessions(user.id);
  const sessions = q.data ?? [];

  if (q.isLoading) {
    return (
      <div className="rounded-2xl border bg-card p-[18px]">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-2xl border bg-card">
        <div className="border-b border-border p-[18px]">
          <Eyebrow variant="muted">Entrenamientos</Eyebrow>
          <div className="mt-1 text-[17px] font-semibold tracking-tight">
            Sesiones registradas
          </div>
        </div>
        <div className="p-[18px] text-sm text-muted-foreground">
          Todavía no hay sesiones completadas para este atleta.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sessions.map((s) => (
        <div key={s.id} className="overflow-hidden rounded-2xl border bg-card">
          <div className="flex items-center justify-between border-b border-border bg-muted/30 px-[18px] py-3">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-background px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums">
                SEM {s.program_week} ·{' '}
                {DAY_LABEL[s.day_of_week] ?? `D${s.day_of_week}`}
              </span>
              {s.fatigue_rating && (
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {s.fatigue_rating}
                </span>
              )}
            </div>
            {s.finished_at && (
              <span className="text-[11px] text-muted-foreground">
                {new Date(s.finished_at).toLocaleDateString()}
              </span>
            )}
          </div>
          <div className="divide-y divide-border">
            {s.exercises.map((ex) => (
              <div key={ex.exercise_id} className="px-[18px] py-3">
                <div className="mb-1.5 text-[13px] font-semibold">
                  {ex.name}
                </div>
                <div className="flex flex-col gap-1">
                  {ex.sets.map((set) => (
                    <div
                      key={set.set_index}
                      className="flex items-center gap-2 text-[12px]"
                    >
                      <span className="w-12 shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        Serie {set.set_index}
                      </span>
                      <span className="font-mono tabular-nums text-foreground">
                        {set.weight_label
                          ? `${set.weight_label} × ${set.reps_label}`
                          : `${set.reps_label} reps`}
                      </span>
                      {set.is_dropset && (
                        <span className="rounded-full bg-brand/15 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-brand">
                          Dropset
                        </span>
                      )}
                      {set.rpe != null && (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          RPE {set.rpe}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const RM_WEEK_LABEL: Record<number, string> = {
  10: 'Semana 10',
  20: 'Semana 20 (AMRAP)',
  30: 'Semana 30',
};

// Edit a student's RM (rep-max) — the coach lowers it TEMPORARILY on injury or
// illness so the app prescribes lighter weights. The engine multiplies value_kg
// by the block's %RM, so a lower RM cascades to every prescribed weight.
//
// "Temporal" ships as option (a): a manual value the coach sets and RESTORES BY
// HAND once the athlete recovers. The optional note records why (e.g. "lesión
// hombro"). Auto-revert-on-date / full history are documented follow-ups.
function RmTab({ user }: { user: AdminUser }) {
  const q = useAthleteRms(user.id);
  const setRm = useSetAthleteRm(user.id);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');

  const rms = q.data ?? [];

  function startEdit(r: {
    exercise_id: number;
    program_week: number;
    value_kg: number;
    coach_note: string | null;
  }) {
    setEditKey(`${r.exercise_id}-${r.program_week}`);
    setValue(String(r.value_kg));
    setNote(r.coach_note ?? '');
  }

  async function save(exercise_id: number, program_week: 10 | 20 | 30) {
    const v = Number(value);
    if (!v || v <= 0 || v > 1000) {
      toast.error('RM inválido (entre 0 y 1000 kg)');
      return;
    }
    try {
      await setRm.mutateAsync({
        exercise_id,
        program_week,
        value_kg: v,
        coach_note: note.trim() || null,
      });
      toast.success('RM actualizado');
      setEditKey(null);
    } catch {
      toast.error('No se pudo actualizar el RM');
    }
  }

  if (q.isLoading) {
    return (
      <div className="rounded-2xl border bg-card p-[18px]">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-card">
      <div className="border-b border-border p-[18px]">
        <Eyebrow variant="muted">Planilla · RM</Eyebrow>
        <div className="mt-1 text-[17px] font-semibold tracking-tight">
          Editar RM (rep-max)
        </div>
        <div className="mt-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          Bajá el RM de forma <b>temporal</b> por lesión o enfermedad: la app
          prescribe menos peso mientras el atleta se recupera. Restaurá el valor
          a mano cuando vuelva a estar al 100%.
        </div>
      </div>

      {rms.length === 0 ? (
        <div className="p-[18px] text-sm text-muted-foreground">
          Este atleta todavía no tiene RM cargados.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {rms.map((r) => {
            const key = `${r.exercise_id}-${r.program_week}`;
            const editing = editKey === key;
            return (
              <div key={key} className="p-[18px]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[13px] font-semibold">
                      {r.exercise_name}
                    </div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      {RM_WEEK_LABEL[r.program_week] ??
                        `Semana ${r.program_week}`}
                    </div>
                  </div>
                  {!editing && (
                    <div className="flex items-center gap-3">
                      <span className="font-mono tabular-nums text-sm font-semibold">
                        {r.value_kg} {r.unit ?? 'kg'}
                      </span>
                      <button
                        type="button"
                        onClick={() => startEdit(r)}
                        className="h-8 rounded-md border border-border bg-background px-3 text-xs font-semibold hover:bg-muted/40"
                      >
                        Editar
                      </button>
                    </div>
                  )}
                </div>

                {r.coach_note && !editing && (
                  <div className="mt-1.5 text-xs italic text-muted-foreground">
                    Nota: {r.coach_note}
                  </div>
                )}

                {editing && (
                  <div className="mt-3 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={1000}
                        step={0.5}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        className="h-9 w-32 rounded-md border border-border bg-background px-2 text-sm tabular-nums"
                        placeholder="RM en kg"
                      />
                      <span className="text-xs text-muted-foreground">
                        {r.unit ?? 'kg'}
                      </span>
                    </div>
                    <input
                      type="text"
                      maxLength={200}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="h-9 w-full max-w-[420px] rounded-md border border-border bg-background px-2 text-sm"
                      placeholder="Motivo (opcional): p. ej. lesión hombro, gripe…"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={setRm.isPending}
                        onClick={() => save(r.exercise_id, r.program_week)}
                        className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditKey(null)}
                        className="h-9 rounded-md border border-border bg-background px-3 text-sm font-semibold hover:bg-muted/40"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
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
  const forceLogout = useForceLogout(user.id);
  const onForceLogout = () =>
    forceLogout.mutate(undefined, {
      onSuccess: () =>
        toast.success(
          'Sesiones cerradas. El logout se hace efectivo en unos minutos.'
        ),
      onError: (e) =>
        toast.error(`No se pudo forzar el logout: ${(e as Error).message}`),
    });
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
            onClick={onForceLogout}
            disabled={isSelf || forceLogout.isPending}
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
                Borra al usuario y todos sus datos asociados — perfil, sesiones,
                suscripciones, tokens.
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
          <Button variant="destructive" onClick={run} disabled={del.isPending}>
            {del.isPending ? 'Eliminando…' : 'Eliminar definitivamente'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
