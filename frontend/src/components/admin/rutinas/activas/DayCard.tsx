import { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Button } from '@/components/ui/button';
import { ExerciseSwapDialog } from './ExerciseSwapDialog';
import { SlotRow } from './SlotRow';
import type { SlotOverride } from '@/components/admin/rutinas/EditSlotPopover';
import type { Exercise, RutinaSlot } from '@/types/api';

const DAY_LABEL: Record<number, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
};

/* eslint-disable no-unused-vars -- callback parameter names document the API */
interface DayCardProps {
  dayOfWeek: number;
  focus: string | null;
  slots: RutinaSlot[];
  flaggedExerciseIds: Set<number>;
  editedSlotIds: Set<string>;
  onEdit(slotId: string, payload: SlotOverride): void;
  onDelete(slotId: string): void;
  onAdd(dayOfWeek: number, exercise: Exercise): void;
}
/* eslint-enable no-unused-vars */

export function DayCard({
  dayOfWeek,
  focus,
  slots,
  flaggedExerciseIds,
  editedSlotIds,
  onEdit,
  onDelete,
  onAdd,
}: DayCardProps) {
  const nextIndex = nextAvailableSlotIndex(slots);
  const [addOpen, setAddOpen] = useState(false);

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
              slot={s}
              flagged={flaggedExerciseIds.has(s.exercise_id)}
              edited={editedSlotIds.has(s.id)}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </SortableContext>
      </div>
      <div className="flex flex-wrap items-center gap-y-1 px-4 py-3 sm:px-5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAddOpen(true)}
          disabled={nextIndex === null}
        >
          <Plus size={14} className="mr-1" /> Agregar ejercicio
        </Button>
        {nextIndex === null && (
          <span className="ml-2 text-xs text-muted-foreground">
            Máximo 12 por día.
          </span>
        )}
        <ExerciseSwapDialog
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onSelect={(_, exercise) => onAdd(dayOfWeek, exercise)}
          title={`Agregar ejercicio al día ${dayOfWeek}`}
        />
      </div>
    </section>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function nextAvailableSlotIndex(
  slots: Pick<RutinaSlot, 'slot_index'>[]
) {
  const occupied = new Set(slots.map((slot) => slot.slot_index));
  for (let index = 1; index <= 12; index += 1) {
    if (!occupied.has(index)) return index;
  }
  return null;
}
