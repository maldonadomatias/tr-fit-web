import { GripVertical } from 'lucide-react';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { RutinaSlot, RutinaPeriodization } from '@/types/api';
import {
  EditSlotPopover,
  type SlotOverride,
} from './EditSlotPopover';

const DAY_LABEL: Record<string, string> = {
  lun: 'Lun',
  mar: 'Mar',
  mie: 'Mié',
  jue: 'Jue',
  vie: 'Vie',
  sab: 'Sáb',
  dom: 'Dom',
};

type DayCode = keyof typeof DAY_LABEL;

/** Series × reps prescription for a slot, derived from the week config. */
function prescription(
  role: RutinaSlot['role'],
  cfg: RutinaPeriodization | null,
): string | null {
  if (role === 'calentamiento') return '2 series';
  if (!cfg) return null;
  if (role === 'principal') {
    return `${cfg.principal_series} × ${cfg.principal_reps}`;
  }
  return `${cfg.accesorio_series} × ${cfg.accesorio_reps}`;
}

export function TabRutina({
  slots,
  daysSpecific,
  periodization,
  overrides,
  onOverride,
}: {
  slots: RutinaSlot[];
  daysSpecific?: DayCode[] | null;
  periodization: RutinaPeriodization | null;
  overrides: Record<string, SlotOverride>;
  onOverride: (slotId: string, payload: SlotOverride) => void;
}) {
  // Preserve incoming array order (the parent owns it); group by day.
  const byDay = new Map<number, RutinaSlot[]>();
  for (const s of slots) {
    if (!byDay.has(s.day_of_week)) byDay.set(s.day_of_week, []);
    byDay.get(s.day_of_week)!.push(s);
  }
  const dayKeys = Array.from(byDay.keys()).sort((a, b) => a - b);

  function dayLabel(seq: number): string | null {
    if (daysSpecific && daysSpecific[seq - 1]) {
      return DAY_LABEL[daysSpecific[seq - 1]] ?? null;
    }
    return null;
  }

  return (
    <div className="space-y-5">
      {dayKeys.map((day) => {
        const items = byDay.get(day)!;
        const label = dayLabel(day);
        return (
          <section
            key={day}
            className="overflow-hidden rounded-md border border-border bg-card"
          >
            <header className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-background px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums">
                  DÍA {day}
                </span>
                {label && (
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    {label}
                  </span>
                )}
              </div>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {items.length} ejercicios
              </span>
            </header>
            <SortableContext
              items={items.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="divide-y divide-border">
                {items.map((s) => (
                  <SlotRow
                    key={s.id}
                    slot={s}
                    periodization={periodization}
                    override={overrides[s.id]}
                    onOverride={onOverride}
                  />
                ))}
              </ul>
            </SortableContext>
          </section>
        );
      })}
    </div>
  );
}

function SlotRow({
  slot: s,
  periodization,
  override: ov,
  onOverride,
}: {
  slot: RutinaSlot;
  periodization: RutinaPeriodization | null;
  override: SlotOverride | undefined;
  onOverride: (slotId: string, payload: SlotOverride) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: s.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const name = ov?.exercise_name ?? s.exercise_name ?? 'Ejercicio sin nombre';
  const muscle = ov?.muscle_group ?? s.muscle_group;
  const isModified = !!ov;
  const presc = prescription(s.role, periodization);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={
        isModified
          ? 'relative flex items-center gap-3 border-l-2 border-amber-500 bg-amber-500/5 px-4 py-2.5 text-[13px]'
          : 'flex items-center gap-3 px-4 py-2.5 text-[13px]'
      }
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        aria-label="Reordenar ejercicio"
        className="cursor-grab text-muted-foreground transition hover:text-foreground active:cursor-grabbing"
      >
        <GripVertical size={14} />
      </button>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{name}</span>
        {ov?.notes && (
          <span className="truncate text-[11px] italic text-muted-foreground">
            {ov.notes}
          </span>
        )}
      </span>
      {presc && (
        <span className="whitespace-nowrap rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] tabular-nums text-foreground">
          {presc}
        </span>
      )}
      {muscle && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] capitalize text-muted-foreground">
          {muscle}
        </span>
      )}
      <span
        className={
          s.role === 'principal'
            ? 'rounded-full bg-brand/15 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-brand'
            : 'rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground'
        }
      >
        {s.role}
      </span>
      <EditSlotPopover
        currentExerciseId={ov?.exercise_id ?? s.exercise_id}
        currentExerciseName={name}
        currentMuscleGroup={muscle}
        currentNotes={ov?.notes}
        onSave={(payload) => onOverride(s.id, payload)}
      />
    </li>
  );
}
