import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, MoreHorizontal, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
import { RoleBadge } from '@/components/admin/RoleBadge';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { TierBadge } from '@/components/admin/TierBadge';
import { SubStatusBadge } from '@/components/admin/SubStatusBadge';
import { CreateUserDialog } from '@/components/admin/CreateUserDialog';
import { useAdminUsers } from '@/hooks/useAdminUsers';
import { fmtShortDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AdminUser, Role, UserStatus } from '@/types/api';

type StatusKey = UserStatus | 'all';
type RoleKey = Role | 'all';

export default function Users() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<StatusKey>('all');
  const [role, setRole] = useState<RoleKey>('all');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const q = useAdminUsers({});
  const users = q.data ?? [];

  const counts = useMemo(
    () => ({
      all: users.length,
      pending: users.filter((u) => u.status === 'pending').length,
      approved: users.filter((u) => u.status === 'approved').length,
      rejected: users.filter((u) => u.status === 'rejected').length,
    }),
    [users],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return users.filter((u) => {
      if (status !== 'all' && u.status !== status) return false;
      if (role !== 'all' && u.role !== role) return false;
      if (needle) {
        const hay = `${u.email} ${u.name ?? ''} ${u.id}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [users, status, role, search]);

  function clearFilters() {
    setStatus('all');
    setRole('all');
    setSearch('');
  }

  return (
    <div>
      <PageHeader
        eyebrow="02 — Gestión"
        title="Usuarios"
        sub={
          <>
            <span className="font-mono tabular-nums">{filtered.length}</span>{' '}
            de{' '}
            <span className="font-mono tabular-nums">{users.length}</span> ·
            todos los roles y estados
          </>
        }
        actions={
          <>
            <Button variant="outline" size="sm">
              <Download data-icon="inline-start" />
              Exportar CSV
            </Button>
            <CreateUserDialog
              open={createOpen}
              onOpenChange={setCreateOpen}
              trigger={
                <Button size="sm">
                  <Plus data-icon="inline-start" />
                  Nuevo usuario
                </Button>
              }
            />
          </>
        }
      />

      <FilterBar
        search={search}
        onSearch={setSearch}
        status={status}
        onStatus={setStatus}
        role={role}
        onRole={setRole}
        counts={counts}
        onClear={clearFilters}
      />

      <div className="overflow-hidden rounded-2xl border bg-card">
        {q.isLoading ? (
          <UsersTableSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyState onClear={clearFilters} />
        ) : (
          <UsersTable
            users={filtered}
            onOpen={(u) => navigate(`/admin/users/${u.id}`)}
          />
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Mostrando{' '}
          <span className="font-mono tabular-nums">{filtered.length}</span>{' '}
          usuarios
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" disabled>
            Anterior
          </Button>
          <Button variant="outline" size="sm" disabled>
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  );
}

interface FilterBarProps {
  search: string;
  onSearch: (next: string) => void;
  status: StatusKey;
  onStatus: (next: StatusKey) => void;
  role: RoleKey;
  onRole: (next: RoleKey) => void;
  counts: { all: number; pending: number; approved: number; rejected: number };
  onClear: () => void;
}

function FilterBar({
  search,
  onSearch,
  status,
  onStatus,
  role,
  onRole,
  counts,
  onClear,
}: FilterBarProps) {
  return (
    <div className="mb-4 rounded-2xl border bg-card p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-8 w-72 items-center gap-2 rounded-md border bg-background px-2.5 text-sm">
          <Search size={14} className="text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar por email, nombre o id…"
            className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="h-[22px] w-px bg-border" />
        <Segmented<StatusKey>
          value={status}
          onChange={onStatus}
          options={[
            { key: 'all', label: 'Todos', count: counts.all },
            { key: 'pending', label: 'Pendientes', count: counts.pending },
            { key: 'approved', label: 'Aprobados', count: counts.approved },
            { key: 'rejected', label: 'Rechazados', count: counts.rejected },
          ]}
        />
        <div className="h-[22px] w-px bg-border" />
        {/* TODO(Task 3): remove coach option once role is fully collapsed */}
        <Segmented<RoleKey>
          value={role}
          onChange={onRole}
          options={[
            { key: 'all', label: 'Cualquier rol' },
            { key: 'athlete', label: 'Atletas' },
            { key: 'admin', label: 'Admins' },
          ]}
        />
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={onClear}
        >
          Limpiar
        </Button>
      </div>
    </div>
  );
}

function UsersTable({
  users,
  onOpen,
}: {
  users: AdminUser[];
  onOpen: (u: AdminUser) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-b">
          <TableHead className="w-7"></TableHead>
          <TableHead>
            <ColLabel>Usuario</ColLabel>
          </TableHead>
          <TableHead>
            <ColLabel>Rol</ColLabel>
          </TableHead>
          <TableHead>
            <ColLabel>Estado</ColLabel>
          </TableHead>
          <TableHead>
            <ColLabel>Suscripción</ColLabel>
          </TableHead>
          <TableHead>
            <ColLabel>Última sesión</ColLabel>
          </TableHead>
          <TableHead className="text-right">
            <ColLabel>Alta</ColLabel>
          </TableHead>
          <TableHead className="w-[60px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((u) => (
          <UserRow key={u.id} user={u} onOpen={() => onOpen(u)} />
        ))}
      </TableBody>
    </Table>
  );
}

function ColLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </span>
  );
}

function UserRow({
  user,
  onOpen,
}: {
  user: AdminUser;
  onOpen: () => void;
}) {
  const pending = user.status === 'pending';
  return (
    <TableRow
      onClick={onOpen}
      className={cn(
        'group cursor-pointer',
        pending ? 'bg-brand/4 hover:bg-brand/8' : 'hover:bg-muted/35',
      )}
    >
      <TableCell>
        {pending && (
          <span
            aria-hidden
            className="ml-1.5 inline-block size-1.5 rounded-full bg-brand"
          />
        )}
      </TableCell>
      <TableCell className="max-w-0">
        <div className="flex items-center gap-2.5">
          <Avatar name={user.name ?? user.email} brand={pending} />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              {user.name ?? user.email.split('@')[0]}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              <span className="font-mono">{user.email}</span>
              {!user.email_verified && (
                <span className="ml-1.5 text-amber-600 dark:text-amber-400">
                  · sin verificar
                </span>
              )}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <RoleBadge role={user.role} />
      </TableCell>
      <TableCell>
        <StatusBadge status={user.status} />
      </TableCell>
      <TableCell>
        {user.subscription_tier ? (
          <div className="flex items-center gap-2">
            <TierBadge tier={user.subscription_tier} />
            <SubStatusBadge status={user.subscription_status} />
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <span className="font-mono tabular-nums text-xs text-muted-foreground">
          {/* last_session_at not yet exposed on AdminUser */}
          nunca
        </span>
      </TableCell>
      <TableCell className="text-right">
        <span className="font-mono tabular-nums text-xs text-muted-foreground">
          {fmtShortDate(user.created_at)}
        </span>
      </TableCell>
      <TableCell>
        <div className="invisible flex justify-end group-hover:visible">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={(e) => e.stopPropagation()}
                aria-label="Más acciones"
              >
                <MoreHorizontal />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Más acciones</TooltipContent>
          </Tooltip>
        </div>
      </TableCell>
    </TableRow>
  );
}

function UsersTableSkeleton() {
  return (
    <div className="space-y-px">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b px-4 py-3">
          <Skeleton className="size-9 rounded-full" />
          <Skeleton className="h-3 w-40" />
          <div className="ml-auto flex gap-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="py-10 text-center text-sm text-muted-foreground">
      Sin usuarios con esos filtros.{' '}
      <button
        onClick={onClear}
        className="font-semibold text-foreground underline-offset-2 hover:underline"
      >
        Limpiar filtros
      </button>
    </div>
  );
}
