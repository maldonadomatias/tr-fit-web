import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold">404</h1>
      <p className="text-muted-foreground">Página no encontrada</p>
      <Button asChild>
        <Link to="/coach">Volver al inicio</Link>
      </Button>
    </div>
  );
}
