import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { CheckCircle2 } from 'lucide-react';
import { ListPane } from '@/components/admin/rutinas/ListPane';
import { DetailPane } from '@/components/admin/rutinas/DetailPane';
import { RutinasTabs } from '@/components/admin/rutinas/RutinasTabs';
import { ActivasPane } from '@/components/admin/rutinas/activas/ActivasPane';
import { usePendingRutinas } from '@/hooks/usePendingRutinas';

export default function Rutinas() {
  const loc = useLocation();
  const isActivas = loc.pathname.startsWith('/admin/rutinas/atleta');

  return (
    <div className="-m-4 flex h-[calc(100dvh-56px)] min-h-0 flex-col overflow-hidden sm:-m-6 lg:-m-7">
      <RutinasTabs />
      <div className="flex-1 overflow-hidden">
        {isActivas ? <ActivasPane /> : <ColaPane />}
      </div>
    </div>
  );
}

function ColaPane() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: queue = [] } = usePendingRutinas();

  const activeIndex = useMemo(
    () => queue.findIndex((r) => r.id === id),
    [queue, id]
  );

  useEffect(() => {
    if (!id && queue.length > 0) {
      navigate(`/admin/rutinas/${queue[0].id}${location.search}`, {
        replace: true,
      });
    }
  }, [id, queue, navigate, location.search]);

  function goToId(nextId: string) {
    navigate(`/admin/rutinas/${nextId}${location.search}`);
  }

  function goNext() {
    if (queue.length === 0) return;
    if (queue.length === 1) {
      toast.info('No hay otra rutina en la cola');
      return;
    }
    const idx = activeIndex >= 0 ? activeIndex : -1;
    const next = queue[(idx + 1) % queue.length];
    if (next) goToId(next.id);
  }

  function goPrev() {
    if (queue.length === 0) return;
    if (queue.length === 1) {
      toast.info('No hay otra rutina en la cola');
      return;
    }
    const idx = activeIndex >= 0 ? activeIndex : 0;
    const prev = queue[(idx - 1 + queue.length) % queue.length];
    if (prev) goToId(prev.id);
  }

  function skip() {
    if (queue.length <= 1) {
      toast.info('No hay otra rutina en la cola');
      return;
    }
    advance();
  }

  function advance() {
    const remaining = queue.filter((r) => r.id !== id);
    if (remaining.length === 0) {
      navigate(`/admin/rutinas${location.search}`, { replace: true });
      return;
    }
    const nextIdx =
      activeIndex >= 0 && activeIndex < queue.length - 1 ? activeIndex + 1 : 0;
    const next = queue[nextIdx]?.id;
    if (next && next !== id) goToId(next);
    else goToId(remaining[0].id);
  }

  const empty = !id && queue.length === 0;

  return (
    <div className="grid h-full grid-cols-1 overflow-y-auto lg:grid-cols-[340px_1fr] lg:overflow-hidden">
      <ListPane activeId={id} onSelect={goToId} />
      <div className="flex min-h-0 flex-col lg:overflow-hidden">
        {id ? (
          <DetailPane
            id={id}
            onSkip={skip}
            onAdvance={advance}
            onNext={goNext}
            onPrev={goPrev}
          />
        ) : empty ? (
          <EmptyAllDone />
        ) : null}
      </div>
    </div>
  );
}

function EmptyAllDone() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-7 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-brand/15 text-brand">
        <CheckCircle2 size={24} />
      </span>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Todo al día</h2>
        <p className="text-sm text-muted-foreground">
          Sin rutinas pendientes de revisar.
        </p>
      </div>
    </div>
  );
}
