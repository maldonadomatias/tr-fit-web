import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Pencil, Search } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  searchExercises,
  type CatalogExercise,
} from '@/lib/exercisesCatalog';
import { cn } from '@/lib/utils';

export type SlotOverride = {
  exercise_id: number;
  exercise_name: string;
  muscle_group: string;
  notes?: string;
};

export function EditSlotPopover({
  currentExerciseId,
  currentExerciseName,
  currentMuscleGroup,
  currentNotes,
  onSave,
}: {
  currentExerciseId: number;
  currentExerciseName: string;
  currentMuscleGroup?: string;
  currentNotes?: string;
  onSave: (payload: SlotOverride) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(currentExerciseName);
  const [selected, setSelected] = useState<CatalogExercise | null>(null);
  const [notes, setNotes] = useState(currentNotes ?? '');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery(currentExerciseName);
      setSelected(null);
      setNotes(currentNotes ?? '');
      setTimeout(() => searchRef.current?.focus(), 30);
    }
  }, [open, currentExerciseName, currentNotes]);

  const results = useMemo(
    () => (open ? searchExercises(query, 8) : []),
    [query, open],
  );

  function commit() {
    const ex =
      selected ?? results.find((r) => r.name === query.trim()) ?? null;
    if (!ex) {
      // user kept current name; save only notes change
      onSave({
        exercise_id: currentExerciseId,
        exercise_name: currentExerciseName,
        muscle_group: currentMuscleGroup ?? '',
        notes: notes.trim() || undefined,
      });
    } else {
      onSave({
        exercise_id: ex.id,
        exercise_name: ex.name,
        muscle_group: ex.muscle_group,
        notes: notes.trim() || undefined,
      });
    }
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Editar slot"
          className="grid size-7 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <Pencil size={13} />
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
                      {active && (
                        <Check size={11} className="text-brand" />
                      )}
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
          <Button type="button" size="sm" onClick={commit}>
            Guardar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
