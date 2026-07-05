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

// Name-based warmup detection (safety net for bug 2026-07-04): the AI
// adjuster occasionally re-tags a warm-up exercise as accesorio/principal,
// which makes the app ask RPE/reps after a mobility drill. Any exercise whose
// name reads as mobility/activation work is a warm-up no matter what role it
// carries. Matched against the accent-stripped lowercase name.
const WARMUP_NAME_RE =
  /movilidad|movimientos? articular(es)?|activacion|entrada en calor|calentamiento/;

export function isWarmupName(name: string): boolean {
  return WARMUP_NAME_RE.test(normalizeName(name));
}

/**
 * Forces role 'calentamiento' (and nulls the accessory set-scheme) on every
 * slot whose exercise name identifies it as a warm-up. Returns the input
 * object untouched when nothing needs fixing.
 */
export function normalizeWarmupRoles(
  out: AiSkeletonOutput,
  exercises: Pick<Exercise, 'id' | 'name'>[]
): AiSkeletonOutput {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  let changed = false;
  const days = out.days.map((day) => ({
    ...day,
    slots: day.slots.map((s) => {
      if (s.role === 'calentamiento') return s;
      const ex = byId.get(s.exercise_id);
      if (!ex || !isWarmupName(ex.name)) return s;
      changed = true;
      return {
        ...s,
        role: 'calentamiento' as const,
        series: null,
        reps: null,
        descanso: null,
      };
    }),
  }));
  return changed ? { ...out, days } : out;
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
    // Untouched only when the required warm-up already opens the day WITH the
    // right role; a mistagged opener falls through and gets rebuilt.
    if (
      day.slots[0]?.exercise_id === required.id &&
      day.slots[0].role === 'calentamiento'
    ) {
      return day;
    }

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
