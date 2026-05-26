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

function slotRangeFor(minutes: number): { min: number; max: number } {
  if (minutes <= 30) return { min: 5, max: 5 };
  if (minutes <= 45) return { min: 6, max: 7 };
  if (minutes <= 60) return { min: 8, max: 9 };
  if (minutes <= 75) return { min: 9, max: 10 };
  return { min: 10, max: 11 };
}

function broadMuscleGroup(mg: string): string {
  return mg.split('-')[0].trim().toLowerCase();
}

const SYSTEM_PROMPT = `Sos un entrenador de fuerza experto. Generás rutinas de gimnasio en formato JSON.
Reglas estrictas:
- El array "days" DEBE tener EXACTAMENTE la cantidad N indicada en el mensaje del usuario como days_per_week. Ni más, ni menos. Si N=3, devolvé 3 días. Si N=4, devolvé 4 días. Esta regla es la más importante: violarla invalida toda la respuesta.
- Cada día arranca con 2 slots role="calentamiento" (slot_index 1, 2) antes del trabajo principal. Elegí del muscle_group "Calentamiento" del catálogo. Sólo bajá a 1 calentamiento si exercise_minutes <= 30.
- Cada día debe tener 2 slots role="principal" (compuestos pesados) después de los calentamientos. Sólo usá 1 principal si exercise_minutes <= 30 o el level del atleta es 'nunca'.
- REGLA CRÍTICA de principales: si un día tiene 2 principales, DEBEN trabajar grupos musculares base distintos. El "grupo base" es la palabra antes del guión en muscle_group (ej. "Pecho - Mayor" → "Pecho", "Piernas - Cuadriceps" → "Piernas"). NO PUEDE haber dos principales con el mismo grupo base en un mismo día. Ejemplos OK: Sentadilla (Piernas) + Press Militar (Hombros); Press Plano (Pecho) + Remo con Barra (Espalda). Ejemplos KO: Press Plano (Pecho-Mayor) + Press Inclinado (Pecho-Superior); Sentadilla (Piernas-Cuadriceps) + Peso Muerto (Piernas-Femorales).
- Después de los principales, agregá 3 a 5 slots role="accesorio" para completar grupos musculares y un slot de core/abs cuando exercise_minutes >= 60.
- Templates típicos de split (inspirados en rutinas de entrenadores reales) — elegí en base a days_per_week y al goal:
  · Push/bíceps: 1 principal de Pecho + accesorios de Pecho (subgrupos Mayor/Superior/Inferior) + 2-3 accesorios de Bíceps + 1 core. (Variante: 2 principales si exercise_minutes lo permite y el segundo es de otro grupo base, ej Pecho + Hombros).
  · Pull/tríceps: 1 principal de Espalda + accesorios de Espalda (Dorsales, Trapecios) + 2-3 accesorios de Tríceps. Sin core si ya hay otros días con core.
  · Piernas+hombros: 1 principal de Piernas + 1 principal de Hombros + accesorios de Femorales/Pantorrillas + 1 core.
- Foco diario: cada día tiene 1 (a lo sumo 2) grupos base como protagonistas; los accesorios apuntan a esos grupos y/o complementarios (ej. pecho ↔ bíceps, espalda ↔ tríceps, piernas ↔ hombros).
- Cantidad TOTAL de slots por día (calentamiento + principal + accesorio) según exercise_minutes:
  · 30 min → 5 slots (1 calent + 1 princ + 3 acces)
  · 45 min → 7 slots (2 calent + 2 princ + 3 acces)
  · 60 min → 8-9 slots (2 calent + 2 princ + 4-5 acces, uno de ellos core)
  · 75 min → 9-10 slots (2 calent + 2 princ + 5-6 acces, uno de ellos core)
  · 90 min → 10-11 slots (2 calent + 2 princ + 6-7 acces, incluir core)
  Este conteo es OBLIGATORIO: si exercise_minutes=60, NO devuelvas 6 slots; tenés que devolver 8 o 9.
- slot_index empieza en 1 y es consecutivo.
- El campo "role" SIEMPRE en español: usar exactamente "calentamiento", "principal" o "accesorio". Nunca "warmup", "accessory" ni "main".
- Sólo podés usar exercise_id que aparezcan en el catálogo provisto.
- No usar ejercicios contraindicados para las lesiones del atleta.
- Distribuir grupos musculares para evitar repetir el mismo en días consecutivos.
- Adaptar volumen (series/reps) según commitment (suave=menos series, exigente=más), pero NO reduzcas la cantidad de slots por commitment: el slot count lo manda exercise_minutes.
- Si training_mode='casa', priorizá ejercicios con equipment compatible (bw, mancuerna, elastico).
- Campo "notes": indicación libre del coach por ejercicio (ej. "Disminuir peso cada 10 reps! son seguidas", "Aumentar peso al finalizar cada serie", "Hacer series de aproximación"). Usar null si no hay indicación.
- Devolver SIEMPRE el JSON con TODOS los campos del schema, incluido "rationale" (string no vacío) y "notes" en cada slot (string o null).`;

export async function generateSkeleton(
  input: GenerateSkeletonInput,
): Promise<AiSkeletonOutput> {
  const { profile, exercises, rejectionFeedback } = input;

  const N = profile.days_per_week;
  const minutes = profile.exercise_minutes ?? 60;
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
      exercise_minutes: minutes,
    },
    constraints: {
      days: N,
      slots_per_day: slotRangeFor(minutes),
      principal_per_day: minutes <= 30 || profile.level === 'nunca'
        ? { min: 1, max: 1 }
        : { min: 2, max: 2 },
      accessory_per_day_min: minutes >= 60 ? 4 : 3,
      include_core_when_minutes_gte_60: minutes >= 60,
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
    const expectedRange = slotRangeFor(minutes);
    const exerciseById = new Map(exercises.map((e) => [e.id, e]));
    let allValid = true;
    for (const day of out.days) {
      const principals = day.slots.filter(
        (s: { role: string }) => s.role === 'principal',
      );
      if (principals.length === 0) {
        lastError = `day ${day.day_index} sin principal`;
        allValid = false; break;
      }
      if (
        day.slots.length < expectedRange.min ||
        day.slots.length > expectedRange.max
      ) {
        lastError = `day ${day.day_index} tiene ${day.slots.length} slots; debe tener entre ${expectedRange.min} y ${expectedRange.max} (exercise_minutes=${minutes})`;
        allValid = false; break;
      }
      for (const s of day.slots) {
        if (!exerciseIds.has(s.exercise_id)) {
          lastError = `exercise_id ${s.exercise_id} no en catálogo`;
          allValid = false; break;
        }
      }
      if (!allValid) break;
      if (principals.length >= 2) {
        const broadGroups = principals.map((s: { exercise_id: number }) => {
          const ex = exerciseById.get(s.exercise_id);
          return ex ? broadMuscleGroup(ex.muscle_group) : '';
        });
        const uniq = new Set(broadGroups);
        if (uniq.size !== broadGroups.length) {
          const names = principals
            .map((s: { exercise_id: number }) => exerciseById.get(s.exercise_id)?.name ?? `id ${s.exercise_id}`)
            .join(', ');
          lastError = `day ${day.day_index} tiene 2 principales del mismo grupo base (${[...uniq].join('/')}): ${names}. Los principales deben trabajar grupos base distintos.`;
          allValid = false; break;
        }
      }
    }
    if (!allValid) {
      logger.warn({ attempt, error: lastError }, 'openai: business constraint');
      continue;
    }

    return out;
  }

  throw new Error(`skeleton generation invalid after ${MAX_ATTEMPTS} attempts: ${lastError}`);
}
