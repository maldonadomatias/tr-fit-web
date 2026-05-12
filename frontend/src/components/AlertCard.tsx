import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Activity, Bell } from 'lucide-react';
import type { CoachAlert } from '@/types/api';
import { cn } from '@/lib/utils';

interface Props {
  alert: CoachAlert;
  onMarkRead: () => void;
  onResolve: () => void;
}

const TYPE_LABEL: Record<CoachAlert['type'], string> = {
  sos_pain: 'SOS Dolor',
  sos_machine: 'SOS Máquina',
  rpe_flag: 'RPE alto',
  rm_skipped: 'RM salteado',
  rm_week_starting: 'Semana RM',
};

const TYPE_ICON: Record<CoachAlert['type'], typeof AlertTriangle> = {
  sos_pain: AlertTriangle,
  sos_machine: Activity,
  rpe_flag: AlertTriangle,
  rm_skipped: Bell,
  rm_week_starting: Bell,
};

export function AlertCard({ alert, onMarkRead, onResolve }: Props) {
  const Icon = TYPE_ICON[alert.type];
  const sev = alert.severity;
  const payload = alert.payload as { zone?: string; intensity?: number };

  return (
    <Card
      className={cn(
        sev === 'red' && 'border-destructive',
        sev === 'yellow' && 'border-yellow-500',
        alert.read_at && 'opacity-60',
      )}
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Icon
              size={18}
              className={cn(
                sev === 'red' && 'text-destructive',
                sev === 'yellow' && 'text-yellow-500',
                sev === 'info' && 'text-muted-foreground',
              )}
            />
            <div className="font-semibold">{TYPE_LABEL[alert.type]}</div>
            <Badge variant={alert.read_at ? 'outline' : 'secondary'}>
              {alert.read_at ? 'Leída' : 'Sin leer'}
            </Badge>
            {alert.resolved_at && <Badge variant="default">Resuelta</Badge>}
          </div>
          <div className="text-xs text-muted-foreground">
            {format(new Date(alert.created_at), 'dd/MM HH:mm')}
          </div>
        </div>

        <div className="space-y-1 text-sm">
          <div>
            <span className="text-muted-foreground">Atleta:</span>{' '}
            <span className="font-medium">{alert.athlete_name}</span>
          </div>
          {alert.exercise_name && (
            <div>
              <span className="text-muted-foreground">Ejercicio:</span>{' '}
              <span className="font-medium">{alert.exercise_name}</span>
            </div>
          )}
          {payload.zone && (
            <div>
              <span className="text-muted-foreground">Zona:</span>{' '}
              <span className="font-medium capitalize">{payload.zone}</span>
              {payload.intensity != null && (
                <>
                  {' '}· <span className="text-muted-foreground">Intensidad:</span>{' '}
                  <span className="font-medium">{payload.intensity}/10</span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          {!alert.read_at && (
            <Button size="sm" variant="outline" onClick={onMarkRead}>
              Marcar leída
            </Button>
          )}
          {!alert.resolved_at && (
            <Button size="sm" onClick={onResolve}>
              Resolver
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
