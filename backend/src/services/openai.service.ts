import OpenAI from 'openai';
import { env } from '../config/env.js';
import { aiSkeletonOutput, type AiSkeletonOutput } from '../domain/schemas.js';
import type { AthleteProfile, Exercise } from '../domain/types.js';
import logger from '../utils/logger.js';

const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export interface GenerateSkeletonInput {
  profile: AthleteProfile;
  exercises: Exercise[];
  rejectionFeedback?: string;
}

const MAX_ATTEMPTS = 3;

const SYSTEM_PROMPT = `Sos un entrenador de fuerza experto. Generás rutinas de gimnasio en formato JSON.
Reglas estrictas:
- El campo "days" debe tener exactamente la cantidad indicada en "days_per_week".
- Cada día tiene al menos 1 slot con role="principal" (compuesto pesado).
- Cada día tiene entre 5 y 8 slots en total. slot_index empieza en 1.
- Sólo podés usar exercise_id que aparezcan en el catálogo provisto.
- No usar ejercicios contraindicados para las lesiones del atleta.
- Distribuir grupos musculares para evitar repetir el mismo en días consecutivos.
- Adaptar volumen según commitment (suave=menos series, exigente=más).
- Adaptar cantidad ejercicios según exercise_minutes (30-45 min → 4 ej, 60 min → 5-6 ej, 75-90 min → 6-7 ej).
- Si training_mode='casa', priorizá ejercicios con equipment compatible (bw, mancuerna, elastico).
- Devolver SIEMPRE JSON parseable que cumpla el schema.`;

export async function generateSkeleton(
  input: GenerateSkeletonInput,
): Promise<AiSkeletonOutput> {
  const { profile, exercises, rejectionFeedback } = input;

  const userMessage = JSON.stringify({
    athlete: {
      gender: profile.gender, age: profile.age, height_cm: profile.height_cm,
      weight_kg: profile.weight_kg, level: profile.level, goal: profile.goal,
      days_per_week: profile.days_per_week, equipment: profile.equipment,
      injuries: profile.injuries,
      training_mode: profile.training_mode,
      commitment: profile.commitment,
      exercise_minutes: profile.exercise_minutes,
    },
    constraints: {
      days: profile.days_per_week,
      slots_per_day: { min: 5, max: 8 },
      principal_per_day: { min: 1, max: 2 },
    },
    exercise_catalog: exercises.map((e) => ({
      id: e.id, name: e.name, muscle_group: e.muscle_group,
      equipment: e.equipment, movement_pattern: e.movement_pattern,
      is_principal: e.is_principal, level_min: e.level_min,
      contraindicated_for: e.contraindicated_for,
    })),
    ...(rejectionFeedback ? { coach_feedback: rejectionFeedback } : {}),
  });

  const exerciseIds = new Set(exercises.map((e) => e.id));
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ];
    if (lastError) {
      messages.push({
        role: 'user',
        content: `Tu output anterior fue inválido: ${lastError}. Corregilo.`,
      });
    }

    const completion = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      response_format: { type: 'json_object' },
      messages,
      temperature: 0.3,
    });

    const content = completion.choices[0]?.message?.content ?? '';
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      lastError = 'JSON malformado';
      logger.warn({ attempt, content }, 'openai: malformed JSON');
      continue;
    }

    const result = aiSkeletonOutput.safeParse(parsed);
    if (!result.success) {
      lastError = `schema violation: ${result.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`;
      logger.warn({ attempt, error: lastError }, 'openai: schema violation');
      continue;
    }

    const out = result.data;

    // Server-side constraints
    if (out.days.length !== profile.days_per_week) {
      lastError = `days.length=${out.days.length} debe ser ${profile.days_per_week}`;
      continue;
    }
    let allValid = true;
    for (const day of out.days) {
      if (!day.slots.some((s) => s.role === 'principal')) {
        lastError = `day ${day.day_index} sin principal`;
        allValid = false; break;
      }
      for (const s of day.slots) {
        if (!exerciseIds.has(s.exercise_id)) {
          lastError = `exercise_id ${s.exercise_id} no en catálogo`;
          allValid = false; break;
        }
      }
      if (!allValid) break;
    }
    if (!allValid) continue;

    return out;
  }

  throw new Error(`skeleton generation invalid after ${MAX_ATTEMPTS} attempts: ${lastError}`);
}
