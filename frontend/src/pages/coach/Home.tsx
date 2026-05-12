import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAthletes } from '@/hooks/useAthletes';
import { usePendingSkeletons } from '@/hooks/usePendingSkeletons';
import { useAlerts } from '@/hooks/useAlerts';

function isToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export default function Home() {
  const { data: athletes = [] } = useAthletes();
  const { data: pending = [] } = usePendingSkeletons();
  const { data: alerts = [] } = useAlerts({ unreadOnly: true });

  const todayAthletes = athletes.filter((a) => isToday(a.last_session_at));
  const redAlerts = alerts.filter((a) => a.severity === 'red');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Alertas rojas sin resolver
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link to="/coach/alerts" className="text-3xl font-bold text-destructive">
              {redAlerts.length}
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Skeletons pending review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link to="/coach/skeletons" className="text-3xl font-bold">
              {pending.length}
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Atletas activos hoy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{todayAthletes.length}</div>
          </CardContent>
        </Card>
      </div>

      {todayAthletes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Entrenando hoy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {todayAthletes.map((a) => (
              <Link
                key={a.id}
                to={`/coach/athletes/${a.id}`}
                className="flex items-center justify-between rounded-md border p-3 hover:bg-muted"
              >
                <div>
                  <div className="font-semibold">{a.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Semana {a.current_week ?? '—'} · {a.level}
                  </div>
                </div>
                {a.unread_alerts_count > 0 && (
                  <Badge variant="destructive">{a.unread_alerts_count}</Badge>
                )}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
