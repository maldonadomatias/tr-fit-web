import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { usePendingSkeletons } from '@/hooks/usePendingSkeletons';

export default function Skeletons() {
  const { data = [], isLoading } = usePendingSkeletons();

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Cargando...</div>;
  }
  if (data.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
        Sin skeletons pending. 🎉
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((s) => (
        <Link key={s.id} to={`/coach/skeletons/${s.id}`}>
          <Card className="cursor-pointer transition hover:bg-muted/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{s.athlete_name}</CardTitle>
              <Badge variant="secondary">Pending review</Badge>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-sm text-muted-foreground">
                {s.generation_rationale ?? 'Sin rationale'}
              </div>
              <div className="text-xs text-muted-foreground">
                Creado: {format(new Date(s.created_at), 'dd/MM/yyyy HH:mm')}
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
