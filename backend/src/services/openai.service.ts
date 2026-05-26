import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
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

const MAX_ATTEMPTS = 5;

const SYSTEM_PROMPT = `Sos un entrenador de fuerza experto. Generás rutinas de gimnasio en formato JSON.
Reglas estrictas:
- El array "days" DEBE tener EXACTAMENTE la cantidad N indicada en el mensaje del usuario como days_per_week. Ni más, ni menos. Si N=3, devolvé 3 días. Si N=4, devolvé 4 días. Esta regla es la más importante: violarla invalida toda la respuesta.
- Cada día arranca con 1 o 2 slots role="calentamiento" (slot_index 1, 2) antes del trabajo principal. Elegí del muscle_group "Calentamiento" del catálogo.
- Cada día tiene al menos 1 slot con role="principal" (compuesto pesado) después de los calentamientos.
- Cada día tiene entre 5 y 8 slots en total contando calentamiento. slot_index empieza en 1 y es consecutivo.
- El campo "role" SIEMPRE en español: usar exactamente "calentamiento", "principal" o "accesorio". Nunca "warmup", "accessory" ni "main".
- Sólo podés usar exercise_id que aparezcan en el catálogo provisto.
- No usar ejercicios contraindicados para las lesiones del atleta.
- Distribuir grupos musculares para evitar repetir el mismo en días consecutivos.
- Adaptar volumen según commitment (suave=menos series, exigente=más).
- Adaptar cantidad ejercicios según exercise_minutes (30-45 min → 4 ej, 60 min → 5-6 ej, 75-90 min → 6-7 ej).
- Si training_mode='casa', priorizá ejercicios con equipment compatible (bw, mancuerna, elastico).
- Campo "notes": indicación libre del coach por ejercicio (ej. "Disminuir peso cada 10 reps! son seguidas", "Aumentar peso al finalizar cada serie", "Hacer series de aproximación"). Usar null si no hay indicación.
- Devolver SIEMPRE el JSON con TODOS los campos del schema, incluido "rationale" (string no vacío) y "notes" en cada slot (string o null).`;

export async function generateSkeleton(
  input: GenerateSkeletonInput,
): Promise<AiSkeletonOutput> {
  const { profile, exercises, rejectionFeedback } = input;

  const N = profile.days_per_week;
  const validIds = exercises.map((e) => e.id);
  const userMessage = JSON.stringify({
    REQUIRED_DAYS_COUNT: N,
    note: `El array "days" debe tener exactamente ${N} elementos. Cualquier otra cantidad será rechazada.`,
    valid_exercise_ids: validIds,
    valid_exercise_ids_note: `SOLO podés usar exercise_id que estén en valid_exercise_ids (${validIds.length} disponibles). Cualquier id fuera de esta lista será rechazado. NO inventes ids.`,
    athlete: {
      gender: profile.gender, age: profile.age, height_cm: profile.height_cm,
      weight_kg: profile.weight_kg, level: profile.level, goal: profile.goal,
      days_per_week: N, equipment: profile.equipment,
      injuries: profile.injuries,
      training_mode: profile.training_mode,
      commitment: profile.commitment,
      exercise_minutes: profile.exercise_minutes,
    },
    constraints: {
      days: N,
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
        content: `ATENCIÓN: tu output anterior violó la restricción: "${lastError}". Recordatorios:\n- REQUIRED_DAYS_COUNT=${N} (array "days" debe tener exactamente ${N} elementos)\n- valid_exercise_ids tiene ${validIds.length} ids permitidos: [${validIds.join(', ')}]\n- SOLO usar ids de esa lista. NO inventes ids.\n- Cada día debe tener al menos 1 slot role="principal".\nGenerá nuevamente respetando TODAS las reglas.`,
      });
    }

    const isGpt5 = env.OPENAI_MODEL.startsWith('gpt-5');
    const completion = await client.chat.completions.parse({
      model: env.OPENAI_MODEL,
      messages,
      ...(isGpt5 ? {} : { temperature: 0.2 }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      response_format: zodResponseFormat(aiSkeletonOutput as any, 'skeleton'),
    });

    const choice = completion.choices[0];
    if (choice?.message?.refusal) {
      lastError = `model refusal: ${choice.message.refusal}`;
      logger.warn({ attempt, refusal: choice.message.refusal }, 'openai: refusal');
      continue;
    }

    const out = choice?.message?.parsed;
    if (!out) {
      lastError = 'no parsed output';
      logger.warn({ attempt }, 'openai: no parsed output');
      continue;
    }

    // Server-side business constraints (Structured Outputs cannot enforce these)
    if (out.days.length !== profile.days_per_week) {
      lastError = `days.length=${out.days.length} debe ser ${profile.days_per_week}`;
      logger.warn({ attempt, error: lastError }, 'openai: business constraint');
      continue;
    }
    let allValid = true;
    for (const day of out.days) {
      if (!day.slots.some((s: { role: string }) => s.role === 'principal')) {
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
    if (!allValid) {
      logger.warn({ attempt, error: lastError }, 'openai: business constraint');
      continue;
    }

    return out;
  }

  throw new Error(`skeleton generation invalid after ${MAX_ATTEMPTS} attempts: ${lastError}`);
}
