// Rotación de accesorios cada 2 semanas (ticket "VARIACION EJERCICIOS").
// Lógica pura: el servicio carga datos y aplica; acá solo se decide qué
// slot cambia y por cuál ejercicio.

import type { Exercise } from '../domain/types.js';
import {
  isExcludedFromAutoProgression,
  weightScheme,
} from './progression-helpers.js';

/** Orden de grupos pedido por el coach; vuelve a Espalda después de Hombros. */
export const ROTATION_ORDER: readonly string[] = [
  'Espalda',
  'Pecho',
  'Piernas',
  'Biceps',
  'Triceps',
  'Hombros',
];

/** "Piernas - Cuadriceps" → "piernas"; "Bíceps" → "biceps". */
export function groupKey(muscleGroup: string): string {
  return muscleGroup
    .split(' - ')[0]
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export interface RotationSlot {
  id: string;
  day_of_week: number;
  exercise_id: number;
  role: string;
  reps: string | null;
}

export interface RotationPick {
  slotId: string;
  dayOfWeek: number;
  from: Exercise;
  to: Exercise;
  group: string;
  nextIndex: number;
}

function isRotatable(slot: RotationSlot, ex: Exercise): boolean {
  return (
    slot.role === 'accesorio' &&
    weightScheme(slot.reps) !== 'dropset' &&
    !ex.is_principal &&
    !isExcludedFromAutoProgression(ex.name, ex.muscle_group)
  );
}

function candidatesFor(
  orig: Exercise,
  allowed: Exercise[],
  usedInDay: Set<number>
): Exercise[] {
  const base = allowed.filter(
    (e) =>
      e.id !== orig.id &&
      !usedInDay.has(e.id) &&
      !e.is_principal &&
      e.modality === orig.modality &&
      !isExcludedFromAutoProgression(e.name, e.muscle_group)
  );
  const curated = (orig.alternatives_ids ?? [])
    .map((id) => base.find((e) => e.id === id))
    .filter(
      (e): e is Exercise =>
        !!e && groupKey(e.muscle_group) === groupKey(orig.muscle_group)
    );
  if (curated.length > 0) return curated;
  return base.filter((e) => e.muscle_group === orig.muscle_group);
}

/**
 * Elige el cambio de esta vuelta arrancando por ROTATION_ORDER[startIndex].
 * Si el grupo no tiene nada rotable (o sin candidatos), pasa al siguiente.
 * `allowed` ya viene filtrado por equipamiento, nivel, lesiones y exclusiones.
 */
export function pickRotation(
  slots: RotationSlot[],
  exById: Map<number, Exercise>,
  allowed: Exercise[],
  startIndex: number,
  rng: () => number = Math.random
): RotationPick | null {
  const n = ROTATION_ORDER.length;
  for (let step = 0; step < n; step++) {
    const idx = (((startIndex + step) % n) + n) % n;
    const group = ROTATION_ORDER[idx];
    const options: { slot: RotationSlot; from: Exercise; cands: Exercise[] }[] =
      [];
    for (const slot of slots) {
      const from = exById.get(slot.exercise_id);
      if (!from || !isRotatable(slot, from)) continue;
      if (groupKey(from.muscle_group) !== groupKey(group)) continue;
      const usedInDay = new Set(
        slots
          .filter((s) => s.day_of_week === slot.day_of_week)
          .map((s) => s.exercise_id)
      );
      const cands = candidatesFor(from, allowed, usedInDay);
      if (cands.length > 0) options.push({ slot, from, cands });
    }
    if (options.length === 0) continue;
    const o = options[Math.floor(rng() * options.length)];
    const to = o.cands[Math.floor(rng() * o.cands.length)];
    return {
      slotId: o.slot.id,
      dayOfWeek: o.slot.day_of_week,
      from: o.from,
      to,
      group,
      nextIndex: (idx + 1) % n,
    };
  }
  return null;
}
