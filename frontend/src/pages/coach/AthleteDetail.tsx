import { useParams, Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function AthleteDetail() {
  const { id } = useParams<{ id: string }>();
  return (
    <Card>
      <CardContent className="space-y-4 p-8 text-center">
        <h2 className="text-xl font-semibold">Detalle del atleta</h2>
        <p className="text-sm text-muted-foreground">
          Vista detallada del atleta <code>{id}</code> — próximamente.
        </p>
        <Button asChild variant="outline">
          <Link to="/coach/athletes">Volver a la lista</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
