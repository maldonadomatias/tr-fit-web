import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ListPaneActivas } from './ListPaneActivas';
import { DetailPaneActivas } from './DetailPaneActivas';

export function ActivasPane() {
  const { athleteId } = useParams<{ athleteId: string }>();
  const navigate = useNavigate();
  const [dirty, setDirty] = useState(false);

  function onSelect(id: string) {
    if (id === athleteId) return;
    if (
      dirty &&
      !window.confirm(
        'Hay cambios sin guardar. ¿Descartarlos y cambiar de atleta?'
      )
    ) {
      return;
    }
    setDirty(false);
    navigate(`/admin/rutinas/atleta/${id}`);
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 overflow-y-auto lg:grid-cols-[340px_1fr] lg:overflow-hidden">
      <ListPaneActivas activeId={athleteId} onSelect={onSelect} />
      <div className="flex min-h-0 flex-col lg:overflow-hidden">
        {athleteId ? (
          <DetailPaneActivas
            key={athleteId}
            athleteId={athleteId}
            onDirtyChange={setDirty}
          />
        ) : (
          <EmptyHint />
        )}
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
