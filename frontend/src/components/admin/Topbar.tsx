import { Link, useLocation, useParams } from 'react-router-dom';
import { Bell, Moon, Search, Sun } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTheme } from '@/hooks/useTheme';
import { useAdminUser } from '@/hooks/useAdminUsers';
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
    pathname.startsWith('/admin/users/') && userId ? userId : undefined,
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

export function Topbar() {
  const { theme, toggle } = useTheme();
  const crumbs = useCrumbs();

  return (
    <header className="col-start-2 flex h-14 items-center gap-4 border-b border-border bg-card px-6">
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
                    'font-mono',
                )}
              >
                {c.label}
              </span>
            )}
          </span>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <div className="hidden h-8 w-80 items-center gap-2 rounded-md bg-muted px-2.5 text-[13px] text-muted-foreground md:flex">
          <Search size={14} />
          <span className="flex-1 truncate">
            Buscar email, id, suscripción…
          </span>
          <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </div>

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
            <button
              type="button"
              className="relative grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Notificaciones"
            >
              <Bell size={16} />
              <span
                aria-hidden
                className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-brand"
              />
            </button>
          </TooltipTrigger>
          <TooltipContent>Notificaciones</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
