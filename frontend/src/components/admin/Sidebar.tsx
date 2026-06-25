import { Link, useLocation } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  ClipboardList,
  Clock,
  CreditCard,
  Dumbbell,
  Home as HomeIcon,
  LogOut,
  Receipt,
  Settings,
  Users as UsersIcon,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Avatar } from './Avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useAuth';
import { useAdminUsers } from '@/hooks/useAdminUsers';
import { usePendingRutinas } from '@/hooks/usePendingRutinas';
import { cn } from '@/lib/utils';

type Item = {
  key: string;
  label: string;
  icon: LucideIcon;
  to: string;
  count?: number;
  soon?: boolean;
  matchPrefixes?: string[];
};

export function Sidebar() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { data: pending } = useAdminUsers({ status: 'pending' });
  const pendingCount = pending?.length ?? 0;
  const { data: pendingRutinas } = usePendingRutinas();
  const rutinasCount = pendingRutinas?.length ?? 0;

  const groups: { label: string; items: Item[] }[] = [
    {
      label: 'Panel',
      items: [
        { key: 'dashboard', label: 'Resumen', icon: HomeIcon, to: '/admin' },
        {
          key: 'pending',
          label: 'Pendientes',
          icon: Clock,
          to: '/admin/pending',
          count: pendingCount,
        },
        {
          key: 'alerts',
          label: 'Alertas',
          icon: AlertCircle,
          to: '/admin/alerts',
        },
        {
          key: 'activity',
          label: 'Actividad',
          icon: Activity,
          to: '/admin/activity',
        },
        {
          key: 'platform-fee',
          label: 'Facturación TR-FIT',
          icon: Receipt,
          to: '/admin/platform-fee',
        },
      ],
    },
    {
      label: 'Gestión',
      items: [
        {
          key: 'users',
          label: 'Usuarios',
          icon: UsersIcon,
          to: '/admin/users',
          matchPrefixes: ['/admin/users'],
        },
        {
          key: 'exercises',
          label: 'Ejercicios',
          icon: Dumbbell,
          to: '/admin/exercises',
          matchPrefixes: ['/admin/exercises'],
        },
        {
          key: 'subs',
          label: 'Suscripciones',
          icon: CreditCard,
          to: '/admin/subscriptions',
        },
        {
          key: 'rutinas',
          label: 'Rutinas',
          icon: ClipboardList,
          to: '/admin/rutinas',
          count: rutinasCount,
          matchPrefixes: ['/admin/rutinas'],
        },
        {
          key: 'billing',
          label: 'Datos de pago',
          icon: Wallet,
          to: '/admin/billing',
        },
      ],
    },
    {
      label: 'Sistema',
      items: [
        {
          key: 'settings',
          label: 'Ajustes',
          icon: Settings,
          to: '#',
          soon: true,
        },
      ],
    },
  ];

  function isActive(item: Item) {
    const pathname = location.pathname;
    if (item.matchPrefixes) {
      return item.matchPrefixes.some((p) => pathname.startsWith(p));
    }
    if (item.to === '/admin') return pathname === '/admin';
    return pathname === item.to || pathname.startsWith(item.to + '/');
  }

  return (
    <aside className="row-span-2 flex flex-col gap-4 border-r border-border bg-card p-4">
      <div className="flex items-center gap-2.5 px-1 py-1">
        <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
          <Dumbbell size={16} strokeWidth={2.5} />
        </span>
        <div className="min-w-0">
          <div className="text-[13px] font-extrabold tracking-[0.18em]">
            TR-Fit
          </div>
          <div className="text-[10px] text-muted-foreground">
            Admin · ARG
          </div>
        </div>
      </div>

      <nav className="flex flex-col gap-3 px-1">
        {groups.map((g) => (
          <div key={g.label} className="flex flex-col gap-0.5">
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {g.label}
            </div>
            {g.items.map((it) => {
              const Icon = it.icon;
              const active = isActive(it);
              const inner = (
                <span
                  className={cn(
                    'group relative flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors',
                    active
                      ? 'bg-muted font-semibold text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                    it.soon && 'cursor-not-allowed opacity-60 hover:bg-transparent hover:text-muted-foreground',
                  )}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute -left-4 top-2 bottom-2 w-[2px] rounded-full bg-brand"
                    />
                  )}
                  <Icon
                    size={16}
                    className={cn(active && 'text-brand')}
                  />
                  <span className="truncate">{it.label}</span>
                  {it.count != null && it.count > 0 && (
                    <span className="ml-auto rounded-full bg-brand/15 px-1.5 py-0.5 font-mono tabular-nums text-[10px] font-bold text-brand">
                      {it.count}
                    </span>
                  )}
                  {it.soon && (
                    <span className="ml-auto text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      pronto
                    </span>
                  )}
                </span>
              );
              if (it.soon) {
                return (
                  <button
                    key={it.key}
                    type="button"
                    disabled
                    className="text-left"
                    aria-disabled
                  >
                    {inner}
                  </button>
                );
              }
              return (
                <Link key={it.key} to={it.to}>
                  {inner}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-auto flex items-center gap-2.5 border-t border-border pt-3">
        <Avatar name={user?.email ?? '??'} size="md" brand={false} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 truncate">
            <span className="truncate text-[13px] font-semibold">
              {user?.email?.split('@')[0] ?? 'Admin'}
            </span>
            {user?.role === 'superadmin' && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-primary-foreground">
                Super
              </span>
            )}
          </div>
          <div className="truncate font-mono text-[11px] text-muted-foreground">
            {user?.email ?? ''}
          </div>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => logout()}
              className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Salir"
            >
              <LogOut size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Salir</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}
