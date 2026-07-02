// Template-first routine generation: the coach's real Excel routines
// (docs/routine-templates-src/, imported by scripts/import-routine-templates.py
// into src/data/routine-templates.json) are the LITERAL base of every
// generated routine. This service selects the right template for a profile
// and materializes it into the skeleton output shape.

import templatesJson from '../data/routine-templates.json' with { type: 'json' };
import type { AiSkeletonOutput } from '../domain/schemas.js';
import type { Weekday } from '../domain/types.js';

export interface TemplateSlot {
  exercise_id: number;
  exercise_name: string;
  muscle_group: string;
  role: 'calentamiento' | 'principal' | 'accesorio';
  series: number | null;
  reps: string | null;
  rir: string | null;
  descanso: string | null;
  notes: string | null;
}

export interface RoutineTemplate {
  source: string;
  gender: 'male' | 'female';
  days: number;
  leg_days: number | null;
  schedules: Weekday[][];
  days_detail: { focus: string; slots: TemplateSlot[] }[];
}

export const ROUTINE_TEMPLATES = templatesJson as RoutineTemplate[];

export interface SelectTemplateProfile {
  gender: 'male' | 'female' | 'other';
  days_per_week: number;
  leg_days: number | null;
  days_specific: Weekday[] | null;
}

const sameSchedule = (a: Weekday[], b: Weekday[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

// Picks the coach template closest to the profile. exactMatch=false means the
// profile falls outside the coach's matrix (days clamped or gender 'other')
// and the AI adjuster must adapt the base.
export function selectTemplate(profile: SelectTemplateProfile): {
  template: RoutineTemplate;
  exactMatch: boolean;
} {
  const days = Math.min(5, Math.max(3, profile.days_per_week));
  let exactMatch = days === profile.days_per_week;

  // Coach templates exist per gender; 'other' rides on the female matrix
  // (lower-biased default) and gets AI-adjusted.
  const gender = profile.gender === 'male' ? 'male' : 'female';
  if (profile.gender === 'other') exactMatch = false;

  let candidates = ROUTINE_TEMPLATES.filter(
    (t) => t.gender === gender && t.days === days,
  );
  if (gender === 'male') {
    const legs = Math.min(2, Math.max(1, profile.leg_days ?? 1));
    candidates = candidates.filter((t) => t.leg_days === legs);
  }
  if (candidates.length === 0) {
    throw new Error(
      `no routine template for gender=${gender} days=${days} (templates JSON incomplete)`,
    );
  }

  // Several female files share a days-count and differ by the weekly
  // schedules they were designed for — match the athlete's chosen weekdays.
  if (candidates.length > 1 && profile.days_specific?.length) {
    const scheduled = candidates.find((t) =>
      t.schedules.some((s) => sameSchedule(s, profile.days_specific!)),
    );
    if (scheduled) return { template: scheduled, exactMatch };
  }
  return { template: candidates[0], exactMatch };
}

// Materializes a template into the generator output shape so it can feed
// createPendingSkeleton unchanged. Accessories keep the Excel prescription
// verbatim; principals/warmups leave series/reps/descanso null (the 30-week
// periodization and the engine warmup defaults own those at runtime).
export function buildSkeletonFromTemplate(
  template: RoutineTemplate,
): AiSkeletonOutput {
  return {
    rationale: `Rutina base del entrenador: ${template.source}`,
    days: template.days_detail.map((day, di) => ({
      day_index: di + 1,
      focus: day.focus,
      slots: day.slots.map((s, si) => {
        const isAccessory = s.role === 'accesorio';
        return {
          slot_index: si + 1,
          exercise_id: s.exercise_id,
          role: s.role,
          notes: s.notes,
          series: isAccessory ? s.series : null,
          reps: isAccessory ? s.reps : null,
          descanso: isAccessory ? s.descanso : null,
        };
      }),
    })),
  };
}
