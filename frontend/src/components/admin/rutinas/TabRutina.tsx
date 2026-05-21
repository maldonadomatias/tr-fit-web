import type { RutinaSlot } from '@/types/api';
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

export function TabRutina({
  slots,
  daysSpecific,
  overrides,
  onOverride,
}: {
  slots: RutinaSlot[];
  daysSpecific?: DayCode[] | null;
  overrides: Record<string, SlotOverride>;
  onOverride: (slotId: string, payload: SlotOverride) => void;
}) {
  const byDay = new Map<number, RutinaSlot[]>();
  for (const s of slots) {
    if (!byDay.has(s.day_of_week)) byDay.set(s.day_of_week, []);
    byDay.get(s.day_of_week)!.push(s);
  }
  const dayKeys = Array.from(byDay.keys()).sort();

  function dayLabel(seq: number): string | null {
    if (daysSpecific && daysSpecific[seq - 1]) {
      return DAY_LABEL[daysSpecific[seq - 1]] ?? null;
    }
    return null;
  }

  return (
    <div className="space-y-5">
      {dayKeys.map((day) => {
        const items = byDay
          .get(day)!
          .sort((a, b) => a.slot_index - b.slot_index);
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
            <ul className="divide-y divide-border">
              {items.map((s) => {
                const ov = overrides[s.id];
                const name = ov?.exercise_name ?? s.exercise_name ?? 'Ejercicio sin nombre';
                const muscle = ov?.muscle_group ?? s.muscle_group;
                const isModified = !!ov;
                return (
                  <li
                    key={s.id}
                    className={
                      isModified
                        ? 'relative flex items-center gap-3 border-l-2 border-amber-500 bg-amber-500/5 px-4 py-2.5 text-[13px]'
                        : 'flex items-center gap-3 px-4 py-2.5 text-[13px]'
                    }
                  >
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {s.slot_index}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{name}</span>
                      {ov?.notes && (
                        <span className="truncate text-[11px] italic text-muted-foreground">
                          {ov.notes}
                        </span>
                      )}
                    </span>
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
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
