import { useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Button } from '@/components/ui/button';
import { useCreateSlot } from '@/hooks/useAdminRutina';
import { ExerciseSwapDialog } from './ExerciseSwapDialog';
import { SlotRow } from './SlotRow';
import type { RutinaSlot } from '@/types/api';

const DAY_LABEL: Record<number, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
};

export function DayCard({
  athleteId,
  dayOfWeek,
  focus,
  slots,
  flaggedExerciseIds,
}: {
  athleteId: string;
  dayOfWeek: number;
  focus: string | null;
  slots: RutinaSlot[];
  flaggedExerciseIds: Set<number>;
}) {
  const nextIndex = slots.length + 1;

  return (
    <section className="rounded-2xl border border-border bg-card">
      <header className="border-b border-border px-4 py-3 sm:px-5">
        <h3 className="text-sm font-semibold">
          {DAY_LABEL[dayOfWeek] ?? `Día ${dayOfWeek}`}
        </h3>
        {focus && <p className="text-xs text-muted-foreground">{focus}</p>}
      </header>
      <div className="divide-y divide-border">
        {slots.length === 0 && (
          <div className="px-4 py-4 text-xs text-muted-foreground sm:px-5">
            Día sin ejercicios.
          </div>
        )}
        <SortableContext
          items={slots.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          {slots.map((s) => (
            <SlotRow
              key={s.id}
              athleteId={athleteId}
              slot={s}
              flagged={flaggedExerciseIds.has(s.exercise_id)}
            />
          ))}
        </SortableContext>
      </div>
      <DayFooter
        athleteId={athleteId}
        dayOfWeek={dayOfWeek}
        nextIndex={nextIndex}
      />
    </section>
  );
}

function DayFooter({
  athleteId,
  dayOfWeek,
  nextIndex,
}: {
  athleteId: string;
  dayOfWeek: number;
  nextIndex: number;
}) {
  const create = useCreateSlot(athleteId);
  const [open, setOpen] = useState(false);

  function onPick(exerciseId: number) {
    create.mutate(
      {
        day_of_week: dayOfWeek,
        slot_index: nextIndex,
        exercise_id: exerciseId,
        role: 'accesorio',
        notes: null,
      },
      { onError: () => toast.error('No se pudo agregar el ejercicio') },
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-y-1 px-4 py-3 sm:px-5">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={create.isPending || nextIndex > 12}
      >
        <Plus size={14} className="mr-1" /> Agregar ejercicio
      </Button>
      {nextIndex > 12 && (
        <span className="ml-2 text-xs text-muted-foreground">
          Máximo 12 por día.
        </span>
      )}
      <ExerciseSwapDialog
        open={open}
        onClose={() => setOpen(false)}
        onSelect={onPick}
        title={`Agregar ejercicio al día ${dayOfWeek}`}
      />
    </div>
  );
}
