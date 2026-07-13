import { useEffect, useRef, useState } from 'react';
import { Check, Pencil, Search, Trash2 } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useExercisesSearch } from '@/hooks/useAdminExercises';
import type { Exercise, RutinaSlot } from '@/types/api';
import { cn } from '@/lib/utils';

export type SlotOverride = {
  exercise_id: number;
  exercise_name: string;
  muscle_group: string;
  notes?: string;
  // Per-slot set scheme (accessories only). null clears back to periodization.
  series?: number | null;
  reps?: string | null;
  descanso?: string | null;
};

export function EditSlotPopover({
  role,
  currentExerciseId,
  currentExerciseName,
  currentMuscleGroup,
  currentNotes,
  currentSeries,
  currentReps,
  currentDescanso,
  onSave,
  onDelete,
}: {
  role: RutinaSlot['role'];
  currentExerciseId: number;
  currentExerciseName: string;
  currentMuscleGroup?: string;
  currentNotes?: string;
  currentSeries?: number | null;
  currentReps?: string | null;
  currentDescanso?: string | null;
  onSave: (payload: SlotOverride) => void;
  onDelete: () => void;
}) {
  const editableScheme = role === 'accesorio';
  const editableSeries = role !== 'principal';
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(currentExerciseName);
  const [selectedGroup, setSelectedGroup] = useState(currentMuscleGroup ?? '');
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [notes, setNotes] = useState(currentNotes ?? '');
  const [series, setSeries] = useState(
    currentSeries != null ? String(currentSeries) : ''
  );
  const [reps, setReps] = useState(currentReps ?? '');
  const [descanso, setDescanso] = useState(currentDescanso ?? '');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery(currentExerciseName);
      setSelectedGroup(currentMuscleGroup ?? '');
      setSelected(null);
      setNotes(currentNotes ?? '');
      setSeries(currentSeries != null ? String(currentSeries) : '');
      setReps(currentReps ?? '');
      setDescanso(currentDescanso ?? '');
      setTimeout(() => searchRef.current?.focus(), 30);
    }
  }, [
    open,
    currentExerciseName,
    currentMuscleGroup,
    currentNotes,
    currentSeries,
    currentReps,
    currentDescanso,
  ]);

  // Slots store a subgroup like 'Pecho - Mayor'; show only the parent ('Pecho')
  // in the toggle since the filter widens to the whole parent group.
  const { data: catalog = [] } = useExercisesSearch('', {
    enabled: open,
    limit: 300,
  });
  const groups = [
    ...new Set(catalog.map((exercise) => exercise.muscle_group)),
  ].sort();
  const { data: results = [] } = useExercisesSearch(query, {
    enabled: open,
    // High enough to list a whole muscle group (and the full catalog when the
    // group filter is off) instead of truncating to a short autocomplete.
    limit: 250,
    muscle_group: selectedGroup || undefined,
  });

  function commit() {
    const ex = selected ?? results.find((r) => r.name === query.trim()) ?? null;
    const scheme = editableScheme
      ? {
          series: series.trim() ? Number(series) : null,
          reps: reps.trim() || null,
          descanso: descanso.trim() || null,
        }
      : editableSeries
        ? { series: series.trim() ? Number(series) : 1 }
        : {};
    if (!ex) {
      // user kept current name; save only notes / scheme change
      onSave({
        exercise_id: currentExerciseId,
        exercise_name: currentExerciseName,
        muscle_group: currentMuscleGroup ?? '',
        notes: notes.trim() || undefined,
        ...scheme,
      });
    } else {
      onSave({
        exercise_id: ex.id,
        exercise_name: ex.name,
        muscle_group: ex.muscle_group,
        notes: notes.trim() || undefined,
        ...scheme,
      });
    }
    setOpen(false);
  }

  function handleDelete() {
    if (!confirm('¿Eliminar este ejercicio de la rutina?')) return;
    onDelete();
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
      <PopoverContent
        align="end"
        collisionPadding={12}
        className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[340px] space-y-3 overflow-y-auto overscroll-contain"
      >
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
          <select
            aria-label="Grupo muscular"
            value={selectedGroup}
            onChange={(event) => setSelectedGroup(event.target.value)}
            className="mt-1.5 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">Todos los grupos musculares</option>
            {groups.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
          <ul className="mt-1 max-h-60 overflow-y-auto rounded-md border border-border">
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
                      active && 'bg-muted'
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

        {editableScheme ? (
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
              Vacío = usa la periodización de la semana. Superserie: 10x10x10 ·
              Pirámide: 10 - 8 - 6.
            </p>
          </div>
        ) : editableSeries ? (
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Series
            </label>
            <input
              type="number"
              min={1}
              max={6}
              value={series || '1'}
              onChange={(e) => setSeries(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-[13px]"
            />
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              Los calentamientos usan 1 serie por defecto.
            </p>
          </div>
        ) : (
          <p className="rounded-md border border-border bg-muted/30 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
            Series, reps y descanso de los ejercicios principales los define la
            periodización de la semana.
          </p>
        )}

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

        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 size={13} className="mr-1" />
            Eliminar
          </Button>
          <div className="flex gap-2">
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
        </div>
      </PopoverContent>
    </Popover>
  );
}
