import { Link } from 'react-router-dom';
import { ExternalLink, AlertTriangle } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { useActiveRutina, useReorderSlots } from '@/hooks/useAdminRutina';
import { DayCard } from './DayCard';

export function DetailPaneActivas({ athleteId }: { athleteId: string }) {
  const { data, isLoading, error } = useActiveRutina(athleteId);
  const reorder = useReorderSlots(athleteId);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function handleDragEnd(e: DragEndEvent) {
    if (!e.over || !data) return;
    const activeId = String(e.active.id);
    const overId = String(e.over.id);
    if (activeId === overId) return;

    // Build flat list sorted by (day, slot_index)
    const sorted = [...data.slots].sort(
      (a, b) =>
        a.day_of_week - b.day_of_week || a.slot_index - b.slot_index,
    );
    const movingIndex = sorted.findIndex((s) => s.id === activeId);
    const targetIndex = sorted.findIndex((s) => s.id === overId);
    if (movingIndex < 0 || targetIndex < 0) return;
    const target = sorted[targetIndex];

    const moved = sorted.splice(movingIndex, 1)[0];
    moved.day_of_week = target.day_of_week;
    sorted.splice(targetIndex, 0, moved);

    // Reindex 1..N per day
    const byDay = new Map<number, string[]>();
    for (const s of sorted) {
      if (!byDay.has(s.day_of_week)) byDay.set(s.day_of_week, []);
      byDay.get(s.day_of_week)!.push(s.id);
    }

    // Validate no day exceeds 12 slots (DB CHECK constraint)
    for (const ids of byDay.values()) {
      if (ids.length > 12) {
        toast.error('Un día no puede tener más de 12 ejercicios');
        return;
      }
    }

    const payload = {
      slots: Array.from(byDay.entries()).flatMap(([day, ids]) =>
        ids.map((id, idx) => ({
          slot_id: id,
          day_of_week: day,
          slot_index: idx + 1, // 1-based per DB CHECK BETWEEN 1 AND 12
        })),
      ),
    };
    reorder.mutate(payload, {
      onError: () => toast.error('No se pudo reordenar'),
    });
  }

  if (isLoading) {
    return (
      <div className="p-7 text-sm text-muted-foreground">Cargando rutina...</div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        Este atleta aún no tiene rutina activa.
      </div>
    );
  }

  const slotsByDay = new Map<number, typeof data.slots>();
  for (const s of data.slots) {
    if (!slotsByDay.has(s.day_of_week)) slotsByDay.set(s.day_of_week, []);
    slotsByDay.get(s.day_of_week)!.push(s);
  }
  const dayFocus = new Map(data.days.map((d) => [d.day_of_week, d.focus]));
  const days = Array.from(
    new Set<number>([
      ...data.days.map((d) => d.day_of_week),
      ...data.slots.map((s) => s.day_of_week),
    ]),
  ).sort((a, b) => a - b);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b border-border px-7 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">{data.profile.name}</h1>
            <div className="mt-1 text-xs text-muted-foreground">
              <Link
                to={`/admin/users/${athleteId}`}
                className="inline-flex items-center gap-1 hover:underline"
              >
                Perfil <ExternalLink size={12} />
              </Link>
            </div>
          </div>
          <Badge variant="outline">{data.profile.days_per_week} días/sem</Badge>
        </div>
        {data.has_active_session && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle size={14} />
            Atleta tiene sesión en curso. Los cambios aplicarán en la próxima sesión.
          </div>
        )}
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto px-7 py-6">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          {days.map((d) => (
            <DayCard
              key={d}
              athleteId={athleteId}
              dayOfWeek={d}
              focus={dayFocus.get(d) ?? null}
              slots={slotsByDay.get(d) ?? []}
            />
          ))}
        </DndContext>
      </div>
    </div>
  );
}
