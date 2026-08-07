// Deterministic replacement of template exercises the athlete cannot do.
//
// The coach's Excel templates are gym routines. An athlete training at home,
// or a beginner, loses a large part of them to the equipment/level/injury
// filter in listExercisesForAthlete. Handing that whole rewrite to the AI
// adjuster meant a request big enough to blow the OpenAI client timeout, so
// onboarding took ~10 min (or failed). A same-muscle-group swap is a
// mechanical decision, so it is made here in code — the AI is left for the
// structural adjustments only.

import type { Exercise } from '../domain/types.js';
import type { RoutineTemplate, TemplateSlot } from './template.service.js';

export interface SubstitutionResult {
  template: RoutineTemplate;
  substituted: { from: string; to: string }[];
  unresolved: string[];
}

function rank(orig: Exercise, cand: Exercise): [number, number, number, number] {
  return [
    cand.movement_pattern === orig.movement_pattern ? 0 : 1,
    cand.is_principal === orig.is_principal ? 0 : 1,
    cand.equipment === orig.equipment ? 0 : 1,
    cand.id,
  ];
}

function pickReplacement(
  orig: Exercise,
  allowed: Exercise[],
  usedInDay: Set<number>,
): Exercise | null {
  const pool = allowed.filter((e) => !usedInDay.has(e.id));

  // Curated picks win outright, in the admin's own order — same rule the
  // athlete-facing swap picker uses (alternatives.service.ts).
  for (const id of orig.alternatives_ids ?? []) {
    const hit = pool.find((e) => e.id === id);
    if (hit) return hit;
  }

  const sameGroup = pool.filter((e) => e.muscle_group === orig.muscle_group);
  if (sameGroup.length === 0) return null;
  sameGroup.sort((a, b) => {
    const ra = rank(orig, a);
    const rb = rank(orig, b);
    for (let i = 0; i < ra.length; i++) {
      if (ra[i] !== rb[i]) return ra[i] - rb[i];
    }
    return 0;
  });
  return sameGroup[0];
}

/**
 * Rewrites `template` so every slot uses an exercise present in `allowed`.
 *
 * @param allowed athlete-filtered catalog (listExercisesForAthlete output)
 * @param catalog full catalog, needed to look up originals that `allowed`
 *                already filtered out
 */
export function substituteUnavailableSlots(
  template: RoutineTemplate,
  allowed: Exercise[],
  catalog: Exercise[],
): SubstitutionResult {
  const allowedIds = new Set(allowed.map((e) => e.id));
  const byId = new Map(catalog.map((e) => [e.id, e]));
  const substituted: { from: string; to: string }[] = [];
  const unresolved: string[] = [];

  const days_detail = template.days_detail.map((day) => {
    // Uniqueness is per day: the same exercise may legitimately appear on
    // two different days, but never twice in one session.
    const usedInDay = new Set<number>(
      day.slots.filter((s) => allowedIds.has(s.exercise_id)).map((s) => s.exercise_id),
    );
    const slots: TemplateSlot[] = day.slots.map((s) => {
      if (allowedIds.has(s.exercise_id)) return { ...s };
      const orig = byId.get(s.exercise_id);
      if (!orig) {
        unresolved.push(s.exercise_name);
        return { ...s };
      }
      const repl = pickReplacement(orig, allowed, usedInDay);
      if (!repl) {
        unresolved.push(s.exercise_name);
        return { ...s };
      }
      usedInDay.add(repl.id);
      substituted.push({ from: s.exercise_name, to: repl.name });
      return {
        ...s,
        exercise_id: repl.id,
        exercise_name: repl.name,
        muscle_group: repl.muscle_group,
      };
    });
    return { focus: day.focus, slots };
  });

  return { template: { ...template, days_detail }, substituted, unresolved };
}
