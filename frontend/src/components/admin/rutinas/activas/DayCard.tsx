import { useState, type CSSProperties } from 'react';
import { GripVertical, Plus } from 'lucide-react';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { ExerciseSwapDialog } from './ExerciseSwapDialog';
import { SlotRow } from './SlotRow';
import type { SlotOverride } from '@/components/admin/rutinas/EditSlotPopover';
import type { Exercise, RutinaSlot } from '@/types/api';

const DAY_LABEL: Record<string, string> = {
  lun: 'Lunes',
  mar: 'Martes',
  mie: 'Miércoles',
  jue: 'Jueves',
  vie: 'Viernes',
  sab: 'Sábado',
  dom: 'Domingo',
};

/** dnd-kit id for a whole day card, kept apart from the slots' uuids. */
const DAY_DRAG_PREFIX = 'day:';

export function dayDragId(dayOfWeek: number) {
  return `${DAY_DRAG_PREFIX}${dayOfWeek}`;
}

export function isDayDragId(id: string) {
  return id.startsWith(DAY_DRAG_PREFIX);
}

export function dayFromDragId(id: string) {
  return Number(id.slice(DAY_DRAG_PREFIX.length));
}

/**
 * Moving `activeDay` onto `overDay` rotates which day sits on which ordinal:
 * the ordinals stay 1..N in place, the contents shift. Returns oldDay ->
 * newOrdinal, or null when the move is a no-op.
 */
export function remapDaysForMove(
  days: number[],
  activeDay: number,
  overDay: number
): Map<number, number> | null {
  const from = days.indexOf(activeDay);
  const to = days.indexOf(overDay);
  if (from < 0 || to < 0 || from === to) return null;
  // moved[i] is the day that ends up occupying ordinal days[i].
  const moved = arrayMove(days, from, to);
  return new Map(moved.map((day, i) => [day, days[i]]));
}

/**
 * `day_of_week` in skeletons is the session ordinal (Día 1..N), not a calendar
 * weekday: the athlete's real weekdays live in `athlete_profiles.days_specific`
 * in the same order. Label by ordinal and only add the weekday when known.
 */
export function dayHeading(
  dayOfWeek: number,
  daysSpecific: string[] | null | undefined
): string {
  const weekday = DAY_LABEL[daysSpecific?.[dayOfWeek - 1] ?? ''];
  return weekday ? `Día ${dayOfWeek} · ${weekday}` : `Día ${dayOfWeek}`;
}

/* eslint-disable no-unused-vars -- callback parameter names document the API */
interface DayCardProps {
  dayOfWeek: number;
  daysSpecific: string[] | null;
  focus: string | null;
  slots: RutinaSlot[];
  trained?: boolean;
  flaggedExerciseIds: Set<number>;
  editedSlotIds: Set<string>;
  onEdit(slotId: string, payload: SlotOverride): void;
  onDelete(slotId: string): void;
  onAdd(dayOfWeek: number, exercise: Exercise): void;
  onFocusChange(dayOfWeek: number, focus: string): void;
}
/* eslint-enable no-unused-vars */

export function DayCard({
  dayOfWeek,
  daysSpecific,
  focus,
  slots,
  trained = false,
  flaggedExerciseIds,
  editedSlotIds,
  onEdit,
  onDelete,
  onAdd,
  onFocusChange,
}: DayCardProps) {
  const nextIndex = nextAvailableSlotIndex(slots);
  const [addOpen, setAddOpen] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: dayDragId(dayOfWeek) });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <section
      ref={setNodeRef}
      style={style}
      className="rounded-2xl border border-border bg-card"
    >
      <header className="border-b border-border px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab text-muted-foreground hover:text-foreground"
            aria-label={`Reordenar día ${dayOfWeek}`}
          >
            <GripVertical size={14} />
          </button>
          <h3 className="text-sm font-semibold">
            {dayHeading(dayOfWeek, daysSpecific)}
          </h3>
          {trained ? (
            <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Ya entrenado esta semana
            </span>
          ) : null}
        </div>
        <input
          value={focus ?? ''}
          onChange={(e) => onFocusChange(dayOfWeek, e.target.value)}
          placeholder="Grupos musculares"
          aria-label={`Grupos musculares del día ${dayOfWeek}`}
          className="ml-6 w-[calc(100%-1.5rem)] rounded-sm bg-transparent text-xs text-muted-foreground outline-none hover:bg-muted/50 focus:bg-muted/50"
        />
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
