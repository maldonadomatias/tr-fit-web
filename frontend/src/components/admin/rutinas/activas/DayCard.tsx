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
}: {
  athleteId: string;
  dayOfWeek: number;
  focus: string | null;
  slots: RutinaSlot[];
}) {
  return (
    <section className="rounded-2xl border border-border bg-card">
      <header className="border-b border-border px-5 py-3">
        <h3 className="text-sm font-semibold">
          {DAY_LABEL[dayOfWeek] ?? `Día ${dayOfWeek}`}
        </h3>
        {focus && <p className="text-xs text-muted-foreground">{focus}</p>}
      </header>
      <div className="divide-y divide-border">
        {slots.length === 0 && (
          <div className="px-5 py-4 text-xs text-muted-foreground">
            Día sin ejercicios.
          </div>
        )}
        {slots.map((s) => (
          <SlotRow key={s.id} athleteId={athleteId} slot={s} />
        ))}
      </div>
    </section>
  );
}
