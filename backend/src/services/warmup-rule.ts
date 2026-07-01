import type { AiSkeletonOutput } from '../domain/schemas.js';
import type { Exercise } from '../domain/types.js';

// Coach rule (obligatoria): every upper-body day must OPEN with the joint
// mobility warm-up with/without band; every lower-body day must OPEN with the
// full leg joint mobility warm-up. Enforced deterministically post-generation
// (the AI prompt also states it, but this is the backstop).
export const WARMUP_UPPER_NAME = 'MOVIMIENTO ARTICULAR CON Y SIN ELÁSTICO';
export const WARMUP_LOWER_NAME = 'MOVIMIENTOS ARTICULARES COMPLETOS PIERNAS';

const LOWER_GROUPS = new Set(['piernas']);
const UPPER_GROUPS = new Set([
  'pecho',
  'espalda',
  'hombros',
  'biceps',
  'triceps',
  'antebrazos',
]);

type AiDay = AiSkeletonOutput['days'][number];
type AiSlot = AiDay['slots'][number];

export type DayRegion = 'upper' | 'lower';

function normalizeName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

function broadGroup(muscleGroup: string): string {
  return muscleGroup.split('-')[0].trim().toLowerCase();
}

function regionOf(muscleGroup: string): DayRegion | null {
  const g = broadGroup(muscleGroup);
  if (LOWER_GROUPS.has(g)) return 'lower';
  if (UPPER_GROUPS.has(g)) return 'upper';
  return null; // core / cardio / warmup — neutral
}

/**
 * Classifies a day as upper or lower body from its working slots
 * (principal + accesorio; warmups don't count). Predominant region wins;
 * on a tie the region of the first working slot wins (the warm-up precedes
 * the first block). Returns null when no working slot is classifiable
 * (e.g. core-only days).
 */
export function classifyDayRegion(
  day: AiDay,
  exercises: Pick<Exercise, 'id' | 'muscle_group'>[]
): DayRegion | null {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  let upper = 0;
  let lower = 0;
  let first: DayRegion | null = null;
  for (const s of day.slots) {
    if (s.role === 'calentamiento') continue;
    const ex = byId.get(s.exercise_id);
    if (!ex) continue;
    const region = regionOf(ex.muscle_group);
    if (!region) continue;
    if (region === 'upper') upper++;
    else lower++;
    first ??= region;
  }
  if (upper === 0 && lower === 0) return null;
  if (upper === lower) return first;
  return upper > lower ? 'upper' : 'lower';
}

const MAX_SLOTS_PER_DAY = 12;

/**
 * Forces the mandatory joint-mobility warm-up into slot 1 of every day,
 * according to the day's region. Mechanics per day:
 *  - required warm-up already first → untouched.
 *  - required warm-up elsewhere → any duplicate is removed and slot 1 is taken.
 *  - day opens with another warm-up → its exercise is swapped for the required
 *    one (keeps slot count and any mid-day second warm-up intact).
 *  - day opens with a working slot → the warm-up is prepended; if that would
 *    exceed the 12-slot DB cap, the last accessory is dropped to make room.
 * Days with no classifiable region, or catalogs missing the warm-up exercise,
 * are left untouched.
 */
export function enforceFirstWarmup(
  out: AiSkeletonOutput,
  exercises: Pick<Exercise, 'id' | 'name' | 'muscle_group'>[]
): AiSkeletonOutput {
  const byName = new Map(exercises.map((e) => [normalizeName(e.name), e]));
  const upperEx = byName.get(normalizeName(WARMUP_UPPER_NAME));
  const lowerEx = byName.get(normalizeName(WARMUP_LOWER_NAME));

  const days = out.days.map((day) => {
    const region = classifyDayRegion(day, exercises);
    if (!region) return day;
    const required = region === 'upper' ? upperEx : lowerEx;
    if (!required) return day;
    if (day.slots[0]?.exercise_id === required.id) return day;

    const requiredSlot: AiSlot = {
      slot_index: 1,
      exercise_id: required.id,
      role: 'calentamiento',
      notes: null,
      series: null,
      reps: null,
      descanso: null,
    };

    // Drop any pre-existing occurrence of the required warm-up (it moves to
    // slot 1), then decide whether slot 1 is a swap or an insertion.
    let rest = day.slots.filter((s) => s.exercise_id !== required.id);
    if (rest[0]?.role === 'calentamiento') {
      rest = rest.slice(1);
    } else if (rest.length >= MAX_SLOTS_PER_DAY) {
      const lastAccessory = rest.map((s) => s.role).lastIndexOf('accesorio');
      const dropAt = lastAccessory === -1 ? rest.length - 1 : lastAccessory;
      rest = rest.filter((_, i) => i !== dropAt);
    }

    const slots = [requiredSlot, ...rest].map((s, i) => ({
      ...s,
      slot_index: i + 1,
    }));
    return { ...day, slots };
  });

  return { ...out, days };
}
