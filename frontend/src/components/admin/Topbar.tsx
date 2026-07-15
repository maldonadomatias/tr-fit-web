import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Bell, Menu, Moon, Search, Sun } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useTheme } from '@/hooks/useTheme';
import { useAdminUser, useAdminUsers } from '@/hooks/useAdminUsers';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { AdminUser } from '@/types/api';
import { cn } from '@/lib/utils';

const LABELS: Record<string, string> = {
  '/admin': 'Resumen',
  '/admin/pending': 'Pendientes',
  '/admin/users': 'Usuarios',
  '/admin/subscriptions': 'Suscripciones',
  '/admin/activity': 'Actividad',
};

interface Crumb {
  label: React.ReactNode;
  to?: string;
}

function useCrumbs(): Crumb[] {
  const { pathname } = useLocation();
  const params = useParams();
  const userId = params.id;
  const userQuery = useAdminUser(
    pathname.startsWith('/admin/users/') && userId ? userId : undefined
  );

  if (pathname.startsWith('/admin/users/') && userId) {
    return [
      { label: 'Usuarios', to: '/admin/users' },
      { label: userQuery.data?.email ?? userId },
    ];
  }
  const label = LABELS[pathname] ?? 'Admin';
  return [{ label }];
}

export function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { theme, toggle } = useTheme();
  const crumbs = useCrumbs();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card px-4 sm:gap-4 sm:px-6 lg:static lg:col-start-2">
      <button
        type="button"
        onClick={onMenuClick}
        className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
        aria-label="Abrir menú"
      >
        <Menu size={18} />
      </button>
      <nav className="flex min-w-0 items-center gap-2 text-[13px]">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && (
              <span className="text-border" aria-hidden>
                /
              </span>
            )}
            {c.to ? (
              <Link
                to={c.to}
                className="text-muted-foreground hover:text-foreground"
              >
                {c.label}
              </Link>
            ) : (
              <span
                className={cn(
                  'truncate font-semibold text-foreground',
                  typeof c.label === 'string' &&
                    /@/.test(c.label) &&
                    'font-mono'
                )}
              >
                {c.label}
              </span>
            )}
          </span>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="hidden h-8 w-80 items-center gap-2 rounded-md bg-muted px-2.5 text-[13px] text-muted-foreground md:flex"
        >
          <Search size={14} />
          <span className="flex-1 truncate">
            Buscar email, id, suscripción…
          </span>
          <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </button>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={toggle}
              className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to="/admin/alerts"
              className="relative grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Notificaciones"
            >
              <Bell size={16} />
              <span
                aria-hidden
                className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-brand"
              />
            </Link>
          </TooltipTrigger>
          <TooltipContent>Notificaciones</TooltipContent>
        </Tooltip>
      </div>
      <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
}

export function filterAdminUsers(users: AdminUser[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return users.filter((user) =>
    [
      user.id,
      user.email,
      user.name,
      user.subscription_tier,
      user.subscription_status,
    ].some((value) => value?.toLowerCase().includes(needle))
  );
}

function GlobalSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const users = useAdminUsers({});
  const results = filterAdminUsers(users.data ?? [], query).slice(0, 12);

  function choose(user: AdminUser) {
    onOpenChange(false);
    setQuery('');
    navigate(`/admin/users/${user.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Buscar usuario</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          aria-label="Buscar por ID, email o suscripción"
          placeholder="ID, email o suscripción…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="max-h-80 overflow-y-auto rounded-md border">
          {query && results.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">Sin resultados.</p>
          )}
          {results.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => choose(user)}
              className="flex w-full items-center justify-between gap-4 border-b px-4 py-3 text-left last:border-0 hover:bg-muted"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {user.name ?? user.email}
                </span>
                <span className="block truncate font-mono text-xs text-muted-foreground">
                  {user.email} · {user.id}
                </span>
              </span>
              <span className="text-xs capitalize text-muted-foreground">
                {user.subscription_tier ?? 'sin suscripción'}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
