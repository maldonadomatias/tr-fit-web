import { Link, Outlet, useLocation } from 'react-router-dom';
import { LogOut, Home, Users, FileCheck, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useAlerts } from '@/hooks/useAlerts';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: typeof Home;
}

const NAV: NavItem[] = [
  { to: '/coach', label: 'Home', icon: Home },
  { to: '/coach/athletes', label: 'Atletas', icon: Users },
  { to: '/coach/skeletons', label: 'Skeletons', icon: FileCheck },
  { to: '/coach/alerts', label: 'Alertas', icon: Bell },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const { data: alerts } = useAlerts({ unreadOnly: true });
  const unreadCount = alerts?.length ?? 0;

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="w-56 border-r bg-card">
        <div className="px-5 py-6">
          <h1 className="text-lg font-bold">TR-FIT Coach</h1>
        </div>
        <nav className="space-y-1 px-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active =
              item.to === '/coach'
                ? location.pathname === '/coach'
                : location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <span className="flex items-center gap-3">
                  <Icon size={16} />
                  {item.label}
                </span>
                {item.to === '/coach/alerts' && unreadCount > 0 && (
                  <Badge variant="destructive">{unreadCount}</Badge>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b bg-card px-6">
          <div className="text-sm text-muted-foreground">{user?.email}</div>
          <Button variant="ghost" size="sm" onClick={() => logout()}>
            <LogOut size={16} className="mr-2" />
            Salir
          </Button>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
