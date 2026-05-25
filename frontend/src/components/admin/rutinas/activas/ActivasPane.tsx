import { useNavigate, useParams } from 'react-router-dom';
import { ListPaneActivas } from './ListPaneActivas';
import { DetailPaneActivas } from './DetailPaneActivas';

export function ActivasPane() {
  const { athleteId } = useParams<{ athleteId: string }>();
  const navigate = useNavigate();

  return (
    <div className="grid h-full grid-cols-[340px_1fr] overflow-hidden">
      <ListPaneActivas
        activeId={athleteId}
        onSelect={(id) => navigate(`/admin/rutinas/atleta/${id}`)}
      />
      <div className="flex flex-col overflow-hidden">
        {athleteId ? <DetailPaneActivas athleteId={athleteId} /> : <EmptyHint />}
      </div>
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Seleccioná un atleta para ver y editar su rutina activa.
    </div>
  );
}
