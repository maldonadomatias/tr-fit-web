import { useState } from 'react';
import { toast } from 'sonner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAlerts, useMarkAlertRead, useResolveAlert } from '@/hooks/useAlerts';
import { AlertCard } from '@/components/AlertCard';

type Filter = 'all' | 'unread' | 'unresolved';

export default function Alerts() {
  const [filter, setFilter] = useState<Filter>('unread');
  const unreadOnly = filter === 'unread';
  const { data: rawAlerts = [], isLoading } = useAlerts({ unreadOnly });
  const markRead = useMarkAlertRead();
  const resolve = useResolveAlert();

  const alerts =
    filter === 'unresolved'
      ? rawAlerts.filter((a) => !a.resolved_at)
      : rawAlerts;

  async function onMarkRead(id: string) {
    try {
      await markRead.mutateAsync(id);
    } catch {
      // 404 = already read; silent refresh handled by invalidate
    }
  }

  async function onResolve(id: string) {
    try {
      await resolve.mutateAsync(id);
      toast.success('Alerta resuelta');
    } catch {
      toast.error('No se pudo resolver');
    }
  }

  return (
    <div className="space-y-4">
      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList>
          <TabsTrigger value="all">Todas</TabsTrigger>
          <TabsTrigger value="unread">Sin leer</TabsTrigger>
          <TabsTrigger value="unresolved">Sin resolver</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading && (
        <div className="text-sm text-muted-foreground">Cargando alertas...</div>
      )}

      {!isLoading && alerts.length === 0 && (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          Sin alertas en esta vista.
        </div>
      )}

      <div className="space-y-3">
        {alerts.map((a) => (
          <AlertCard
            key={a.id}
            alert={a}
            onMarkRead={() => onMarkRead(a.id)}
            onResolve={() => onResolve(a.id)}
          />
        ))}
      </div>
    </div>
  );
}
