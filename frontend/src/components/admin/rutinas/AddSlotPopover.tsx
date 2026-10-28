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
import { catalogSlotPreset, nextSlotForm } from './catalog-slot-preset';

export type AddedSlotData = {
  exercise_id: number;
  exercise_name: string;
  muscle_group: string;
  role: 'calentamiento' | 'principal' | 'accesorio';
  notes?: string;
  series?: number | null;
  reps?: string | null;
  descanso?: string | null;
};

/**
 * Adds a slot to a day. Principal lifts default to weekly periodization;
 * accessories may set a scheme or leave it blank to follow the week's
 * accessory prescription (mirrors {@link EditSlotPopover}).
 */
/* eslint-disable no-unused-vars -- callback parameter names document the API */
type AddSlotPopoverProps = {
  disabled?: boolean;
  onAdd(data: AddedSlotData): void;
};
/* eslint-enable no-unused-vars */

export function AddSlotPopover({ disabled, onAdd }: AddSlotPopoverProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [notes, setNotes] = useState('');
  const [series, setSeries] = useState('');
  const [reps, setReps] = useState('');
  const [descanso, setDescanso] = useState('');
  const [role, setRole] = useState<AddedSlotData['role']>('accesorio');
  // True after the coach edits series/reps/rest/notes. A catalog preset must
  // not overwrite that edit, and must not leak onto the next exercise.
  const [schemeDirty, setSchemeDirty] = useState(false);
  const [appliedPreset, setAppliedPreset] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedGroup('');
      setSelected(null);
      setNotes('');
      setSeries('');
      setReps('');
      setDescanso('');
      setRole('accesorio');
      setSchemeDirty(false);
      setAppliedPreset(null);
      const focusSearch = window.setTimeout(() => {
        const field = searchRef.current;
        const popover = field?.closest('[data-slot="popover-content"]');
        const active = document.activeElement;
        // Don't pull the cursor back if the coach already moved into the form.
        if (popover && active instanceof Node && popover.contains(active) && active !== popover) {
          return;
        }
        field?.focus();
      }, 30);
      return () => window.clearTimeout(focusSearch);
    }
  }, [open]);

  // Full catalog (no group filter) to populate the group dropdown.
  const { data: catalog = [] } = useExercisesSearch('', {
    enabled: open,
    limit: 300,
  });
  const groups = [
    ...new Set(catalog.map((exercise) => exercise.muscle_group)),
  ].sort();
  const { data: results = [] } = useExercisesSearch(query, {
    enabled: open,
    // High enough to list a whole subgroup instead of a short autocomplete.
    limit: 250,
    muscle_group: selectedGroup || undefined,
  });

  function selectExercise(exercise: Exercise) {
    const preset = catalogSlotPreset(exercise);
    // Search edits null out `selected`, so a block already on screen is
    // remembered by name. A series value marks it as a block to clear.
    const previous =
      selected ??
      (appliedPreset ? { name: appliedPreset, default_series: 1 } : null);
    const next = nextSlotForm(
      { series, reps, descanso, notes },
      previous,
      exercise,
      { sameExercise: false }
    );
    setSelected(exercise);
    setQuery(exercise.name);
    setRole(
      preset?.forceAccessory
        ? 'accesorio'
        : exercise.is_principal
          ? 'principal'
          : 'accesorio'
    );
    setSchemeDirty(false);
    setSeries(next.series);
    setReps(next.reps);
    setDescanso(next.descanso);
    setNotes(next.notes);
    setAppliedPreset(preset?.replacesBlock ? exercise.name : null);
  }

  function commit() {
    const ex = selected ?? results.find((r) => r.name === query.trim()) ?? null;
    if (!ex) return;
    const preset = catalogSlotPreset(ex);
    const untouched =
      !schemeDirty &&
      !series.trim() &&
      !reps.trim() &&
      !descanso.trim() &&
      !notes.trim();
    const commitRole =
      preset?.forceAccessory && untouched
        ? 'accesorio'
        : selected
          ? role
          : ex.is_principal
            ? 'principal'
            : role === 'principal'
              ? 'accesorio'
              : role;
    const prescription =
      preset && untouched
        ? {
            notes: preset.notes ?? undefined,
            series: preset.series,
            reps: preset.reps,
            descanso: preset.descanso,
          }
        : {
            notes: notes.trim() || undefined,
            series: series.trim() ? Number(series) : null,
            reps: reps.trim() || null,
            descanso: descanso.trim() || null,
          };
    onAdd({
      exercise_id: ex.id,
      exercise_name: ex.name,
      muscle_group: ex.muscle_group,
      role: commitRole,
      ...prescription,
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
      <PopoverContent
        align="end"
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
                if (appliedPreset && !schemeDirty) {
                  setSeries('');
                  setReps('');
                  setDescanso('');
                  setNotes('');
                  setAppliedPreset(null);
                }
              }}
              placeholder="Buscar ejercicio…"
              className="h-9 w-full rounded-md border border-input bg-background pl-7 pr-2 text-[13px] outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            />
          </div>
          <select
            aria-label="Grupo muscular"
            value={selectedGroup}
            onChange={(event) => {
              setSelectedGroup(event.target.value);
              setSelected(null);
            }}
            className="mt-1.5 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">Todos los grupos musculares</option>
            {groups.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
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
                      if (selected?.id === r.id) return;
                      selectExercise(r);
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

        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Rol en la rutina
          </label>
          <select
            aria-label="Rol en la rutina"
            value={role}
            onChange={(e) => setRole(e.target.value as AddedSlotData['role'])}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-[13px]"
          >
            <option value="accesorio">Accesorio</option>
            <option
              value="principal"
              disabled={selected ? !selected.is_principal : false}
            >
              Principal (periodización semanal)
            </option>
            <option value="calentamiento">Calentamiento</option>
          </select>
        </div>

        {role === 'accesorio' && (
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
                onChange={(e) => {
                  setSchemeDirty(true);
                  setSeries(e.target.value);
                }}
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
                onChange={(e) => {
                  setSchemeDirty(true);
                  setReps(e.target.value);
                }}
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
                onChange={(e) => {
                  setSchemeDirty(true);
                  setDescanso(e.target.value);
                }}
                placeholder="Ej: 1:30 a 2 min"
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-[13px] outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
            </div>
            <p className="col-span-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
              Entra como accesorio. Vacío = usa la periodización de la semana.
              Superserie: 10x10x10 · Pirámide: 10 - 8 - 6.
            </p>
          </div>
        )}

        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Notas (opcional)
          </label>
          <Textarea
            value={notes}
            onChange={(e) => {
              setSchemeDirty(true);
              setNotes(e.target.value);
            }}
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
            disabled={
              !selected && !results.some((r) => r.name === query.trim())
            }
          >
            Agregar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
