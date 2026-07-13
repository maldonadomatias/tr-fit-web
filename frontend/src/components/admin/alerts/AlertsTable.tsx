// frontend/src/components/admin/alerts/AlertsTable.tsx
import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';
import { es } from 'date-fns/locale';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { CoachAlert } from '@/types/api';
import { AlertRowActions } from './AlertRowActions';
import { cn } from '@/lib/utils';

const SEV_DOT: Record<string, string> = {
  red: 'bg-destructive',
  yellow: 'bg-yellow-500',
  info: 'bg-muted-foreground',
};

const TYPE_LABEL: Record<CoachAlert['type'], string> = {
  sos_pain: 'SOS dolor',
  sos_machine: 'SOS máquina',
  rpe_flag: 'RPE alto',
  rm_skipped: 'RM salteado',
  rm_week_starting: 'Semana RM',
  membership_expiring: 'Cuota por vencer',
  membership_overdue: 'Cuota vencida',
  sos_no_machine: 'SOS sin máquina',
  program_reset: 'Programa reiniciado',
};

function summary(a: CoachAlert): string {
  const p = a.payload as {
    zone?: string;
    intensity?: number;
    switched_to_exercise_id?: number;
    paid_until?: string;
  };
  if (a.type === 'sos_pain' && p.zone)
    return `${p.zone} ${p.intensity ?? '?'}/10 · ${a.exercise_name ?? '?'}`;
  if (a.type === 'sos_machine') return `${a.exercise_name ?? '?'} ocupado`;
  if (a.type === 'membership_expiring' || a.type === 'membership_overdue') {
    const until = p.paid_until
      ? new Date(p.paid_until).toLocaleDateString('es-AR')
      : '';
    return until ? `Vence: ${until}` : 'Cuota';
  }
  return a.exercise_name ?? '—';
}

interface Props {
  alerts: CoachAlert[];
}

export function AlertsTable({ alerts }: Props) {
  if (alerts.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
        Sin alertas en esta vista.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">Sev</TableHead>
            <TableHead>Atleta</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Detalle</TableHead>
            <TableHead className="w-24">Hace</TableHead>
            <TableHead className="w-32">Resolución</TableHead>
            <TableHead className="w-40"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {alerts.map((a) => (
            <TableRow key={a.id} className={cn(a.resolved_at && 'opacity-60')}>
              <TableCell>
                <span
                  className={cn(
                    'inline-block h-2.5 w-2.5 rounded-full',
                    SEV_DOT[a.severity]
                  )}
                />
              </TableCell>
              <TableCell className="font-medium">{a.athlete_name}</TableCell>
              <TableCell>{TYPE_LABEL[a.type] ?? a.type}</TableCell>
              <TableCell className="text-sm">{summary(a)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(a.created_at), {
                  locale: es,
                  addSuffix: false,
                })}
              </TableCell>
              <TableCell>
                {a.resolution_action ? (
                  <Badge
                    variant="secondary"
                    title={a.resolution_note ?? undefined}
                  >
                    {a.resolution_action}
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-2">
                  {a.type === 'sos_pain' && (
                    <Link
                      className="whitespace-nowrap text-xs font-medium text-primary hover:underline"
                      to={`/admin/rutinas/atleta/${a.athlete_id}`}
                    >
                      Ir a la Rutina
                    </Link>
                  )}
                  {!a.resolved_at && <AlertRowActions alert={a} />}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
