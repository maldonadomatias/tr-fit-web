import { useEffect, useRef, useState } from 'react';
import { Check, Plus, Search } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useExercisesSearch } from '@/hooks/useAdminExercises';
import type { Exercise } from '@/types/api';
import { cn } from '@/lib/utils';

export type AddedSlotData = {
  exercise_id: number;
  exercise_name: string;
  muscle_group: string;
  notes?: string;
  series?: number | null;
  reps?: string | null;
  descanso?: string | null;
};

/**
 * Adds a brand-new accessory slot to a day. New exercises always enter as
 * accessories: the admin may set a per-slot scheme or leave it blank to follow
 * the week's periodization (mirrors {@link EditSlotPopover}).
 */
export function AddSlotPopover({
  disabled,
  onAdd,
}: {
  disabled?: boolean;
  onAdd: (data: AddedSlotData) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [notes, setNotes] = useState('');
  const [series, setSeries] = useState('');
  const [reps, setReps] = useState('');
  const [descanso, setDescanso] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(null);
      setNotes('');
      setSeries('');
      setReps('');
      setDescanso('');
      setTimeout(() => searchRef.current?.focus(), 30);
    }
  }, [open]);

  const { data: results = [] } = useExercisesSearch(query, {
    enabled: open,
    limit: 8,
  });

  function commit() {
    const ex = selected ?? results.find((r) => r.name === query.trim()) ?? null;
    if (!ex) return;
    onAdd({
      exercise_id: ex.id,
      exercise_name: ex.name,
      muscle_group: ex.muscle_group,
      notes: notes.trim() || undefined,
      series: series.trim() ? Number(series) : null,
      reps: reps.trim() || null,
      descanso: descanso.trim() || null,
    });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex w-full items-center justify-center gap-1.5 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground transition hover:bg-muted/40 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <Plus size={13} />
          Agregar ejercicio
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] space-y-3">
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Ejercicio
          </label>
          <div className="relative">
            <Search
              size={13}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
              }}
              placeholder="Buscar ejercicio…"
              className="h-9 w-full rounded-md border border-input bg-background pl-7 pr-2 text-[13px] outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            />
          </div>
          <ul className="mt-1 max-h-44 overflow-y-auto rounded-md border border-border">
            {results.length === 0 && (
              <li className="px-2 py-1.5 text-[12px] text-muted-foreground">
                Sin resultados.
              </li>
            )}
            {results.map((r) => {
              const active = selected?.id === r.id;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(r);
                      setQuery(r.name);
                    }}
                    className={cn(
                      'flex w-full items-center justify-between px-2 py-1.5 text-left text-[12px] transition hover:bg-muted',
                      active && 'bg-muted',
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      {active && <Check size={11} className="text-brand" />}
                      <span className={cn(!active && 'pl-[16px]')}>
                        {r.name}
                      </span>
                    </span>
                    <span className="font-mono text-[10px] capitalize text-muted-foreground">
                      {r.muscle_group}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Series
            </label>
            <input
              type="number"
              min={1}
              max={6}
              value={series}
              onChange={(e) => setSeries(e.target.value)}
              placeholder="3"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-[13px] outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Reps
            </label>
            <input
              type="text"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              placeholder="8 a 10 · 10x10x10 · 10 - 8 - 6"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-[13px] outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="col-span-3">
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Descanso
            </label>
            <input
              type="text"
              value={descanso}
              onChange={(e) => setDescanso(e.target.value)}
              placeholder="Ej: 1:30 a 2 min"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-[13px] outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            />
          </div>
          <p className="col-span-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
            Entra como accesorio. Vacío = usa la periodización de la semana.
            Superserie: 10x10x10 · Pirámide: 10 - 8 - 6.
          </p>
        </div>

        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Notas (opcional)
          </label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej: cambia variante por equipo limitado."
            rows={2}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={commit}
            disabled={!selected && !results.some((r) => r.name === query.trim())}
          >
            Agregar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
