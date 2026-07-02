// Orchestrator for template-first routine generation.
//
// The coach's Excel templates are the literal base of every routine. A
// profile that fits a template cleanly gets it verbatim — no OpenAI call.
// The AI is only invoked as an ADJUSTER when something in the profile
// prevents using the template as-is: unavailable exercises (injury /
// equipment / level / exclusions), shorter sessions, a day count outside the
// coach matrix, gender without its own matrix, or coach rejection feedback.

import type { AiSkeletonOutput } from '../domain/schemas.js';
import type { AthleteProfile, Exercise } from '../domain/types.js';
import { adjustSkeleton } from './openai.service.js';
import {
  buildSkeletonFromTemplate,
  selectTemplate,
  type RoutineTemplate,
} from './template.service.js';
import { seriesRangeFor } from './series-budget.js';

export interface GenerateRoutineInput {
  profile: AthleteProfile;
  /** Athlete-filtered catalog (listExercisesForAthlete): already excludes
   *  injury-contraindicated, incompatible-equipment, above-level and
   *  coach-excluded exercises. */
  exercises: Exercise[];
  rejectionFeedback?: string;
}

export interface GenerateRoutineResult {
  skeleton: AiSkeletonOutput;
  source: 'template' | 'template+ai';
  templateSource: string;
  reasons: string[];
}

function adjustmentReasons(
  profile: AthleteProfile,
  template: RoutineTemplate,
  allowedIds: Set<number>,
  rejectionFeedback?: string,
): string[] {
  const reasons: string[] = [];

  const unavailable = [
    ...new Map(
      template.days_detail
        .flatMap((d) => d.slots)
        .filter((s) => !allowedIds.has(s.exercise_id))
        .map((s) => [s.exercise_id, s.exercise_name]),
    ).values(),
  ];
  if (unavailable.length > 0) {
    reasons.push(
      `Ejercicios de la rutina base NO disponibles para este atleta (lesión, equipamiento, nivel o exclusiones): ${unavailable.join(', ')}. Reemplazá cada uno por un equivalente del catálogo provisto que trabaje el mismo grupo muscular con un estímulo similar.`,
    );
  }

  const minutes = profile.exercise_minutes ?? 60;
  if (minutes < 60) {
    const { min, max } = seriesRangeFor(minutes);
    reasons.push(
      `El atleta entrena ${minutes} min (la rutina base es de 60): bajá el volumen quitando accesorios o series hasta ${min}-${max} series totales por día (cada calentamiento cuenta 1 serie; los principales hacen 3).`,
    );
  }

  if (profile.days_per_week !== template.days) {
    reasons.push(
      `El atleta entrena ${profile.days_per_week} días pero la rutina base es de ${template.days}: reacomodá el plan a exactamente ${profile.days_per_week} días manteniendo el estilo y las prioridades del entrenador.`,
    );
  }

  if (profile.gender === 'other') {
    reasons.push(
      'El atleta no se identifica con el género de la rutina base (matriz mujer): mantené la estructura, ajustando énfasis sólo si el objetivo lo pide.',
    );
  }

  if (rejectionFeedback) {
    reasons.push(
      `El coach RECHAZÓ la rutina anterior con este feedback, aplicalo: "${rejectionFeedback}".`,
    );
  }

  return reasons;
}

export async function generateRoutine(
  input: GenerateRoutineInput,
): Promise<GenerateRoutineResult> {
  const { profile, exercises, rejectionFeedback } = input;
  const { template } = selectTemplate(profile);
  const allowedIds = new Set(exercises.map((e) => e.id));
  const reasons = adjustmentReasons(
    profile, template, allowedIds, rejectionFeedback,
  );

  if (reasons.length === 0) {
    return {
      skeleton: buildSkeletonFromTemplate(template),
      source: 'template',
      templateSource: template.source,
      reasons,
    };
  }

  const skeleton = await adjustSkeleton({
    template,
    profile,
    exercises,
    reasons,
  });
  return {
    skeleton,
    source: 'template+ai',
    templateSource: template.source,
    reasons,
  };
}
