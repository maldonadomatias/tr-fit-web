import { GripVertical } from 'lucide-react';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { RutinaSlot, RutinaPeriodization } from '@/types/api';
import {
  EditSlotPopover,
  type SlotOverride,
} from './EditSlotPopover';
import { AddSlotPopover, type AddedSlotData } from './AddSlotPopover';

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

/**
 * Resolved set scheme for a slot. Accessories use their per-slot prescription
 * (or the admin's local edit) and fall back to the week config; principals and
 * warmups always follow the week config.
 */
function prescription(
  s: RutinaSlot,
  ov: SlotOverride | undefined,
  cfg: RutinaPeriodization | null,
): { sets: string; descanso: string | null } | null {
  if (s.role === 'calentamiento') return { sets: '2 series', descanso: null };
  if (!cfg) return null;
  if (s.role === 'principal') {
    return {
      sets: `${cfg.principal_series} × ${cfg.principal_reps}`,
      descanso: cfg.principal_descanso ?? null,
    };
  }
  // accesorio: an active override fully replaces the slot's stored scheme.
  const edited = ov && 'series' in ov;
  const series = (edited ? ov!.series : s.series) ?? cfg.accesorio_series;
  const reps = (edited ? ov!.reps : s.reps) ?? cfg.accesorio_reps;
  const descanso = (edited ? ov!.descanso : s.descanso) ?? cfg.accesorio_descanso;
  return { sets: `${series} × ${reps}`, descanso: descanso ?? null };
}

export function TabRutina({
  slots,
  daysSpecific,
  periodization,
  overrides,
  onOverride,
  onDelete,
  onAdd,
}: {
  slots: RutinaSlot[];
  daysSpecific?: DayCode[] | null;
  periodization: RutinaPeriodization | null;
  overrides: Record<string, SlotOverride>;
  onOverride: (slotId: string, payload: SlotOverride) => void;
  onDelete: (slotId: string) => void;
  onAdd: (day: number, data: AddedSlotData) => void;
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
                    onDelete={onDelete}
                  />
                ))}
              </ul>
            </SortableContext>
            <div className="border-t border-border">
              <AddSlotPopover
                disabled={items.length >= 12}
                onAdd={(data) => onAdd(day, data)}
              />
            </div>
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
  onDelete,
}: {
  slot: RutinaSlot;
  periodization: RutinaPeriodization | null;
  override: SlotOverride | undefined;
  onOverride: (slotId: string, payload: SlotOverride) => void;
  onDelete: (slotId: string) => void;
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
  const presc = prescription(s, ov, periodization);

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
        <span className="flex flex-col items-end gap-0.5">
          <span className="whitespace-nowrap rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] tabular-nums text-foreground">
            {presc.sets}
          </span>
          {presc.descanso && (
            <span className="whitespace-nowrap font-mono text-[10px] text-muted-foreground">
              ⏱ {presc.descanso}
            </span>
          )}
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
        role={s.role}
        currentExerciseId={ov?.exercise_id ?? s.exercise_id}
        currentExerciseName={name}
        currentMuscleGroup={muscle}
        currentNotes={ov?.notes}
        currentSeries={(ov && 'series' in ov ? ov.series : s.series) ?? null}
        currentReps={(ov && 'reps' in ov ? ov.reps : s.reps) ?? null}
        currentDescanso={(ov && 'descanso' in ov ? ov.descanso : s.descanso) ?? null}
        onSave={(payload) => onOverride(s.id, payload)}
        onDelete={() => onDelete(s.id)}
      />
    </li>
  );
}
