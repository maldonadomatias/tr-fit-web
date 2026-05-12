import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useAthletes } from '@/hooks/useAthletes';

const skeletonStatusLabel: Record<string, string> = {
  pending_review: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  superseded: 'Reemplazado',
};

export default function Athletes() {
  const navigate = useNavigate();
  const { data: athletes = [], isLoading } = useAthletes();

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Cargando atletas...</div>;
  }

  if (athletes.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
        Aún no tenés atletas asignados.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Nivel</TableHead>
          <TableHead>Semana</TableHead>
          <TableHead>Última sesión</TableHead>
          <TableHead>Skeleton</TableHead>
          <TableHead className="text-right">Alertas</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {athletes.map((a) => (
          <TableRow
            key={a.id}
            onClick={() => navigate(`/coach/athletes/${a.id}`)}
            className="cursor-pointer"
          >
            <TableCell className="font-medium">{a.name}</TableCell>
            <TableCell className="text-muted-foreground">{a.email}</TableCell>
            <TableCell className="capitalize">{a.level}</TableCell>
            <TableCell>{a.current_week ?? '—'}</TableCell>
            <TableCell>
              {a.last_session_at
                ? format(new Date(a.last_session_at), 'dd/MM HH:mm')
                : '—'}
            </TableCell>
            <TableCell>
              {a.skeleton_status ? (
                <Badge
                  variant={
                    a.skeleton_status === 'approved'
                      ? 'default'
                      : a.skeleton_status === 'pending_review'
                        ? 'secondary'
                        : 'outline'
                  }
                >
                  {skeletonStatusLabel[a.skeleton_status]}
                </Badge>
              ) : (
                '—'
              )}
            </TableCell>
            <TableCell className="text-right">
              {a.unread_alerts_count > 0 ? (
                <Badge variant="destructive">{a.unread_alerts_count}</Badge>
              ) : (
                '0'
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
