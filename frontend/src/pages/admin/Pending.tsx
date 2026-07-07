import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  CheckCircle2,
  Eye,
  Info,
  RefreshCw,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/admin/PageHeader';
import { Avatar } from '@/components/admin/Avatar';
import { RoleBadge } from '@/components/admin/RoleBadge';
import { useAdminUsers } from '@/hooks/useAdminUsers';
import { api } from '@/lib/api';
import { fmtTimeAgo } from '@/lib/format';
import type { AdminUser } from '@/types/api';

const DAY_MS = 24 * 60 * 60 * 1000;

export default function Pending() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useAdminUsers({ status: 'pending' });
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);

  const sorted = useMemo(() => {
    return [...(q.data ?? [])].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }, [q.data]);

  const athletes = sorted.filter((u) => u.role === 'athlete');

  async function bulkApproveAthletes() {
    setBulkRunning(true);
    let ok = 0;
    let fail = 0;
    for (const u of athletes) {
      try {
        await api.patch(`/admin/users/${u.id}`, { status: 'approved' });
        ok++;
      } catch {
        fail++;
      }
    }
    qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    qc.invalidateQueries({ queryKey: ['admin', 'stats'] });
    setBulkRunning(false);
    setBulkOpen(false);
    if (fail === 0) toast.success(`Aprobados ${ok} athletes`);
    else toast.error(`Aprobados ${ok}, fallaron ${fail}`);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Acción requerida"
        title="Cola de pendientes"
        sub={
          <>
            <span className="font-mono tabular-nums">{sorted.length}</span>{' '}
            usuarios esperando aprobación · ordenados por antigüedad
          </>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => q.refetch()}
              disabled={q.isFetching}
            >
              <RefreshCw data-icon="inline-start" />
              Actualizar
            </Button>
            <Button
              size="sm"
              onClick={() => setBulkOpen(true)}
              disabled={athletes.length === 0}
            >
              Aprobar todos los athletes
            </Button>
          </>
        }
      />

      {q.isLoading && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px] rounded-2xl" />
          ))}
        </div>
      )}

      {!q.isLoading && sorted.length === 0 && <EmptyState />}

      {!q.isLoading && sorted.length > 0 && (
        <div className="flex flex-col gap-3">
          {sorted.map((u) => (
            <PendingCard
              key={u.id}
              user={u}
              onOpen={() => navigate(`/admin/users/${u.id}`)}
            />
          ))}
        </div>
      )}

      <InfoBanner />

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprobar todos los athletes</DialogTitle>
            <DialogDescription>
              Vas a aprobar{' '}
              <span className="font-mono tabular-nums">
                {athletes.length}
              </span>{' '}
              athletes pendientes. Los coaches y admins quedan sin tocar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setBulkOpen(false)}
              disabled={bulkRunning}
            >
              Cancelar
            </Button>
            <Button
              variant="brand"
              onClick={bulkApproveAthletes}
              disabled={bulkRunning || athletes.length === 0}
            >
              <Check data-icon="inline-start" />
              {bulkRunning ? 'Aprobando…' : 'Aprobar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PendingCard({
  user,
  onOpen,
}: {
  user: AdminUser;
  onOpen: () => void;
}) {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const age = Date.now() - new Date(user.created_at).getTime();
  const urgent = age > DAY_MS;

  async function patch(next: 'approved' | 'rejected') {
    setRunning(true);
    try {
      await api.patch(`/admin/users/${user.id}`, { status: next });
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      qc.invalidateQueries({ queryKey: ['admin', 'stats'] });
      toast.success(
        next === 'approved' ? 'Usuario aprobado' : 'Usuario rechazado',
      );
    } catch (e) {
      toast.error(
        `No se pudo ${next === 'approved' ? 'aprobar' : 'rechazar'}: ${(e as Error).message}`,
      );
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-card p-[18px] sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-4">
      <Avatar name={user.name ?? user.email} size="lg" brand />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-[17px] font-semibold tracking-tight">
            {user.name ?? user.email.split('@')[0]}
          </span>
          <RoleBadge role={user.role} />
          {!user.email_verified && (
            <Badge variant="warning" className="gap-1.5">
              <span
                aria-hidden
                className="inline-block size-1.5 rounded-full bg-current"
              />
              Email sin verificar
            </Badge>
          )}
          {urgent && (
            <Badge variant="destructive" className="gap-1.5">
              <span
                aria-hidden
                className="inline-block size-1.5 rounded-full bg-current"
              />
              {'> 24 h'}
            </Badge>
          )}
        </div>
        <div className="truncate text-sm text-muted-foreground">
          <span className="font-mono">{user.email}</span>
          <span className="mx-2">·</span>
          registrado{' '}
          <span className="font-mono tabular-nums">
            hace {fmtTimeAgo(user.created_at)}
          </span>
          <span className="mx-2">·</span>
          id <span className="font-mono">{user.id.slice(0, 8)}…</span>
        </div>
      </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onOpen}>
          <Eye data-icon="inline-start" />
          Ver perfil
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => patch('rejected')}
          disabled={running}
        >
          <X data-icon="inline-start" />
          Rechazar
        </Button>
        <Button
          variant="brand"
          size="sm"
          onClick={() => patch('approved')}
          disabled={running}
        >
          <Check data-icon="inline-start" />
          Aprobar
        </Button>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border bg-card px-6 py-16 text-center">
      <CheckCircle2 className="size-7 text-brand" />
      <div className="text-[17px] font-semibold tracking-tight">
        No hay usuarios pendientes.
      </div>
      <div className="text-sm text-muted-foreground">
        Todo al día. La cola está vacía.
      </div>
    </div>
  );
}

function InfoBanner() {
  return (
    <div className="mt-6 rounded-2xl border bg-muted/40 p-[18px]">
      <div className="flex items-start gap-3">
        <Info size={16} className="mt-0.5 text-muted-foreground" />
        <div className="text-sm">
          <div className="mb-1 font-semibold">Cómo funciona la aprobación</div>
          <div className="text-muted-foreground">
            Los athletes se aprueban en cuanto confirman email. Coaches y
            admins requieren aprobación manual. Al rechazar, el usuario
            recibe un email genérico — no se exponen motivos.
          </div>
        </div>
      </div>
    </div>
  );
}
