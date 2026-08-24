import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Download,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';
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
import { RoleBadge } from '@/components/admin/RoleBadge';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { MembershipBadge } from '@/components/admin/MembershipBadge';
import { CreateUserDialog } from '@/components/admin/CreateUserDialog';
import { ConfirmPaymentDialog } from '@/components/admin/ConfirmPaymentDialog';
import { Pagination } from '@/components/admin/Pagination';
import { usePagination } from '@/hooks/usePagination';
import { useAdminUsers, useRegisterPayment } from '@/hooks/useAdminUsers';
import { fmtARS, fmtShortDate } from '@/lib/format';
import { expiryInfo, isPaidThisMonth, monthLabel } from '@/lib/subscription';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { AdminUser, Role, UserStatus } from '@/types/api';

export type SortKey =
  | 'usuario'
  | 'estado'
  | 'membresia'
  | 'vence'
  | 'mes'
  | 'cuota';
export type SortDir = 'asc' | 'desc';
export interface Sort {
  key: SortKey;
  dir: SortDir;
}

// Status and membership sort by how much they need attention, not alphabet:
// "expired" before "active" is what the coach is actually looking for.
const STATUS_ORDER: Record<string, number> = {
  pending: 0,
  approved: 1,
  rejected: 2,
};
const MEMBERSHIP_ORDER: Record<string, number> = {
  expired: 0,
  expiring: 1,
  paused: 2,
  active: 3,
  cancelled: 4,
};

const nameOf = (u: AdminUser) => u.name ?? u.email;

/**
 * Comparators per column, ascending. Non-athletes have no membership data, so
 * they always sink to the bottom of those columns regardless of direction.
 */
const COMPARATORS: Record<SortKey, (a: AdminUser, b: AdminUser) => number> = {
  usuario: (a, b) =>
    nameOf(a).localeCompare(nameOf(b), 'es-AR', { sensitivity: 'base' }),
  estado: (a, b) =>
    (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9),
  membresia: (a, b) =>
    (MEMBERSHIP_ORDER[a.membership_status ?? ''] ?? 9) -
    (MEMBERSHIP_ORDER[b.membership_status ?? ''] ?? 9),
  vence: (a, b) =>
    expiryInfo(a.paid_until).sortKey - expiryInfo(b.paid_until).sortKey,
  mes: (a, b) =>
    Number(isPaidThisMonth(a.paid_until)) -
    Number(isPaidThisMonth(b.paid_until)),
  cuota: (a, b) => feeOf(a) - feeOf(b),
};

const ATHLETE_ONLY: SortKey[] = ['membresia', 'vence', 'mes', 'cuota'];

export function sortUsers(users: AdminUser[], sort: Sort | null): AdminUser[] {
  if (!sort) return users;
  const cmp = COMPARATORS[sort.key];
  const sign = sort.dir === 'asc' ? 1 : -1;
  const athleteOnly = ATHLETE_ONLY.includes(sort.key);
  return [...users].sort((a, b) => {
    if (athleteOnly) {
      const aIs = a.role === 'athlete';
      const bIs = b.role === 'athlete';
      if (aIs !== bIs) return aIs ? -1 : 1; // staff last, both directions
    }
    // Ties keep a stable, readable order instead of whatever the API returned.
    return cmp(a, b) * sign || COMPARATORS.usuario(a, b);
  });
}

/** Mirrors the backend FEE_EXPR fallback so both price an athlete the same. */
const DEFAULT_FEE_ARS = 25000;
const feeOf = (u: AdminUser) => u.monthly_fee_ars ?? DEFAULT_FEE_ARS;

type StatusKey = UserStatus | 'all';
type RoleKey = Role | 'all';

export default function Users() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<StatusKey>('all');
  const [role, setRole] = useState<RoleKey>('all');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [sort, setSort] = useState<Sort | null>(null);

  // First click sorts ascending (A→Z, soonest expiry, cheapest fee), second
  // flips it, third clears back to the API order.
  function toggleSort(key: SortKey) {
    setSort((cur) => {
      if (cur?.key !== key) return { key, dir: 'asc' };
      return cur.dir === 'asc' ? { key, dir: 'desc' } : null;
    });
  }

  const q = useAdminUsers({});
  const users = useMemo(() => q.data ?? [], [q.data]);

  const counts = useMemo(
    () => ({
      all: users.length,
      pending: users.filter((u) => u.status === 'pending').length,
      approved: users.filter((u) => u.status === 'approved').length,
      rejected: users.filter((u) => u.status === 'rejected').length,
    }),
    [users]
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

  const sorted = useMemo(() => sortUsers(filtered, sort), [filtered, sort]);

  const pager = usePagination(sorted, {
    pageSize: 25,
    filterKey: `${status}|${role}|${search}|${sort?.key ?? ''}${sort?.dir ?? ''}`,
  });

  function clearFilters() {
    setStatus('all');
    setRole('all');
    setSearch('');
    setSort(null);
  }

  return (
    <div>
      <PageHeader
        eyebrow="02 — Gestión"
        title="Usuarios"
        sub={
          <>
            <span className="font-mono tabular-nums">{filtered.length}</span> de{' '}
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

      <div className="overflow-x-auto rounded-2xl border bg-card">
        {q.isLoading ? (
          <UsersTableSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyState onClear={clearFilters} />
        ) : (
          <>
            <UsersTable
              users={pager.pageItems}
              onOpen={(u) => navigate(`/admin/users/${u.id}`)}
              sort={sort}
              onSort={toggleSort}
            />
            <Pagination
              page={pager.page}
              totalPages={pager.totalPages}
              from={pager.from}
              to={pager.to}
              total={pager.total}
              pageSize={pager.pageSize}
              onPage={pager.setPage}
              onPageSize={pager.setPageSize}
              noun="usuarios"
            />
          </>
        )}
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
        <div className="flex h-8 w-full items-center gap-2 rounded-md border bg-background px-2.5 text-sm sm:w-72">
          <Search size={14} className="text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar por email, nombre o id…"
            className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="hidden h-[22px] w-px bg-border sm:block" />
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
        <div className="hidden h-[22px] w-px bg-border sm:block" />
        <Segmented<RoleKey>
          value={role}
          onChange={onRole}
          options={[
            { key: 'all', label: 'Cualquier rol' },
            { key: 'athlete', label: 'Atletas' },
            { key: 'admin', label: 'Admins' },
            { key: 'superadmin', label: 'Superadmins' },
          ]}
        />
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onClear}>
          Limpiar
        </Button>
      </div>
    </div>
  );
}

function UsersTable({
  users,
  onOpen,
  sort,
  onSort,
}: {
  users: AdminUser[];
  onOpen: (u: AdminUser) => void;
  sort: Sort | null;
  onSort: (key: SortKey) => void;
}) {
  const registerPayment = useRegisterPayment();
  const [charging, setCharging] = useState<AdminUser | null>(null);
  return (
    /* table-fixed: every other column is pinned, so Usuario absorbs all the
       leftover width instead of being squeezed to the minimum. */
    <Table className="min-w-[1120px] table-fixed">
      <TableHeader>
        <TableRow className="border-b">
          <TableHead className="w-7"></TableHead>
          <SortHead sortKey="usuario" sort={sort} onSort={onSort}>
            Usuario
          </SortHead>
          <SortHead
            sortKey="estado"
            sort={sort}
            onSort={onSort}
            className="w-[112px]"
          >
            Estado
          </SortHead>
          <SortHead
            sortKey="membresia"
            sort={sort}
            onSort={onSort}
            className="w-[124px]"
          >
            Membresía
          </SortHead>
          <SortHead
            sortKey="vence"
            sort={sort}
            onSort={onSort}
            className="w-[128px]"
          >
            Vence el
          </SortHead>
          <SortHead
            sortKey="mes"
            sort={sort}
            onSort={onSort}
            className="w-[168px]"
          >
            Mes = {monthLabel()}
          </SortHead>
          <SortHead
            sortKey="cuota"
            sort={sort}
            onSort={onSort}
            className="w-[104px]"
            align="right"
          >
            Cuota
          </SortHead>
          <TableHead className="w-[176px] text-right">
            <ColLabel>Cobrar</ColLabel>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((u) => (
          <UserRow
            key={u.id}
            user={u}
            onOpen={() => onOpen(u)}
            onCharge={() => setCharging(u)}
          />
        ))}
      </TableBody>
      {charging && (
        <ConfirmPaymentDialog
          open
          user={charging}
          amount={feeOf(charging)}
          pending={registerPayment.isPending}
          onClose={() => setCharging(null)}
          onConfirm={() =>
            registerPayment.mutate(
              { id: charging.id, amount: feeOf(charging), method: 'transfer' },
              {
                onSuccess: () => {
                  setCharging(null);
                  toast.success('Pago registrado. Acceso habilitado.');
                },
                onError: (e) =>
                  toast.error(
                    `No se pudo registrar el pago: ${(e as Error).message}`
                  ),
              }
            )
          }
        />
      )}
    </Table>
  );
}

/** Header cell that toggles sorting on click. Non-sortable columns keep TableHead. */
function SortHead({
  sortKey,
  sort,
  onSort,
  className,
  align = 'left',
  children,
}: {
  sortKey: SortKey;
  sort: Sort | null;
  onSort: (key: SortKey) => void;
  className?: string;
  align?: 'left' | 'right';
  children: ReactNode;
}) {
  const active = sort?.key === sortKey ? sort.dir : null;
  const Icon =
    active === 'asc' ? ArrowUp : active === 'desc' ? ArrowDown : ChevronsUpDown;
  return (
    <TableHead
      className={className}
      aria-sort={
        active === 'asc'
          ? 'ascending'
          : active === 'desc'
            ? 'descending'
            : 'none'
      }
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'group/sort flex w-full items-center gap-1 hover:text-foreground',
          align === 'right' && 'justify-end'
        )}
      >
        <ColLabel>{children}</ColLabel>
        <Icon
          size={11}
          className={cn(
            'shrink-0',
            active
              ? 'text-foreground'
              : 'text-muted-foreground/40 group-hover/sort:text-muted-foreground'
          )}
        />
      </button>
    </TableHead>
  );
}

function ColLabel({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </span>
  );
}

function UserRow({
  user,
  onOpen,
  onCharge,
}: {
  user: AdminUser;
  onOpen: () => void;
  onCharge: () => void;
}) {
  const pending = user.status === 'pending';
  const isAthlete = user.role === 'athlete';
  return (
    <TableRow
      onClick={onOpen}
      className={cn(
        'group cursor-pointer',
        pending ? 'bg-brand/4 hover:bg-brand/8' : 'hover:bg-muted/35'
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
      <TableCell>
        <div className="flex items-center gap-2.5">
          <Avatar name={user.name ?? user.email} brand={pending} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">
                {user.name ?? user.email.split('@')[0]}
              </span>
              {!isAthlete && <RoleBadge role={user.role} />}
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
        <StatusBadge status={user.status} />
      </TableCell>
      {isAthlete ? (
        <>
          <TableCell>
            <MembershipBadge status={user.membership_status} />
          </TableCell>
          <TableCell>
            <VenceCell paidUntil={user.paid_until} />
          </TableCell>
          <TableCell>
            <MonthPaidBadge paid={isPaidThisMonth(user.paid_until)} />
          </TableCell>
          <TableCell className="text-right">
            <span className="font-mono tabular-nums text-xs font-semibold">
              {fmtARS(feeOf(user))}
            </span>
          </TableCell>
          <TableCell
            className="text-right"
            onClick={(e) => e.stopPropagation()}
          >
            <Button variant="outline" size="sm" onClick={onCharge}>
              <RefreshCw data-icon="inline-start" />
              Registrar pago
            </Button>
          </TableCell>
        </>
      ) : (
        <TableCell colSpan={5}>
          <span className="text-xs text-muted-foreground">
            Cuenta de staff — sin membresía
          </span>
        </TableCell>
      )}
    </TableRow>
  );
}

const URGENT_TEXT: Partial<
  Record<ReturnType<typeof expiryInfo>['urgency'], string>
> = {
  expired: 'VENCIÓ',
  today: 'VENCE HOY',
  tomorrow: 'VENCE MAÑANA',
};

/** Expiry with urgency colouring — recovered from the retired Suscripciones page. */
function VenceCell({ paidUntil }: { paidUntil: string | null }) {
  const info = expiryInfo(paidUntil);
  if (info.urgency === 'infinity') {
    return (
      <span className="font-mono text-xs text-muted-foreground">
        Sin vencimiento
      </span>
    );
  }
  const label = URGENT_TEXT[info.urgency];
  return (
    <div className="flex flex-col">
      <span
        className={cn(
          'font-mono tabular-nums text-xs',
          label
            ? 'font-bold uppercase tracking-wide text-destructive'
            : info.urgency === 'soon'
              ? 'font-semibold text-amber-600'
              : 'text-muted-foreground'
        )}
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
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide',
        paid
          ? 'bg-emerald-500/15 text-emerald-600'
          : 'bg-destructive/15 text-destructive'
      )}
    >
      {paid ? 'Pagado' : 'No pagado'}
    </span>
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
