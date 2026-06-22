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
  // The coach's gym session body is roughly constant (~8-10 working slots) for a
  // 1-hour session regardless of the cardio add-on; ranges below are widened to
  // fit the real corpus (docs/routine-corpus/shared-mechanics.md, M7).
  if (minutes <= 30) return { min: 5, max: 6 };
  if (minutes <= 45) return { min: 6, max: 8 };
  if (minutes <= 60) return { min: 8, max: 10 };
  if (minutes <= 75) return { min: 9, max: 11 };
  return { min: 10, max: 12 };
}

function broadMuscleGroup(mg: string): string {
  return mg.split('-')[0].trim().toLowerCase();
}

// Min/max principal (heavy compound) slots per day. The coach runs 1-3 heavy
// compounds at 3×6a8 RIR 2 per day depending on how many regions the day spans
// (docs/routine-corpus: P3 revised). Never exactly-2-only.
const PRINCIPAL_MIN = 1;
const PRINCIPAL_MAX = 3;

export type SplitStrategy = 'full_body' | 'split';

// Picks the split shape from gender + frequency + leg-day choice. This is the
// gender-specific layer the corpus established:
//   women  → lower-biased; men → upper-biased; leg_days (men) sets leg frequency.
//   days ≤3 → full-body (rotating emphasis); ≥4 → split.
// See docs/routine-corpus/{mujer,hombre}/LOGIC.md.
export function buildSplitGuidance(profile: AthleteProfile): {
  strategy: SplitStrategy;
  bias: 'lower' | 'upper' | 'balanced';
  leg_days: number;
  text: string;
} {
  const days = profile.days_per_week;
  const strategy: SplitStrategy = days <= 3 ? 'full_body' : 'split';
  if (profile.gender === 'female') {
    const legDays = days <= 3 ? days : days >= 5 ? 3 : 2;
    return {
      strategy,
      bias: 'lower',
      leg_days: legDays,
      text:
        strategy === 'full_body'
          ? `MUJER, ${days} días: FULL-BODY cada día (no PPL), con énfasis de tren inferior rotando entre Glúteos / Cuádriceps / Femorales. Hip Thrust es el principal estrella de glúteo. Cada día toca pierna + algo de tren superior (espalda/pecho/hombros) + core.`
          : `MUJER, ${days} días: SPLIT con sesgo a tren inferior. Dedicá ${legDays} días a pierna (repartidos en énfasis Cuádriceps / Glúteos / Femorales) y el resto a tren superior (un día push: pecho/hombros/tríceps; un día pull: espalda/bíceps). Distribuí hombros y brazos entre los días; NO hagas un día de brazo puro. Hip Thrust como principal de glúteo. NUNCA PPL clásico.`,
    };
  }
  if (profile.gender === 'male') {
    const legDays = profile.leg_days ?? 1;
    if (strategy === 'full_body') {
      return {
        strategy,
        bias: 'upper',
        leg_days: legDays,
        text:
          legDays >= 2
            ? `HOMBRE, ${days} días, ${legDays} días de pierna: split con prioridad de pierna — un día de Cuádriceps (Sentadilla principal) y otro de Femorales (Peso Muerto principal), el día restante tren superior. SIN Hip Thrust; pierna centrada en sentadilla/peso muerto.`
            : `HOMBRE, ${days} días, 1 día de pierna: usá PPL — Push (pecho/hombros/tríceps) / Pierna (cuádriceps+femoral+pantorrilla) / Pull (espalda/bíceps). Sesgo a tren superior. SIN Hip Thrust; pierna centrada en sentadilla/peso muerto.`,
      };
    }
    return {
      strategy,
      bias: 'upper',
      leg_days: legDays,
      text: `HOMBRE, ${days} días, ${legDays} día(s) de pierna: SPLIT con sesgo a tren superior. Asigná ${legDays} día(s) a pierna (si son 2: uno Cuádriceps, otro Femorales) y el resto a push (pecho/hombros/tríceps) y pull (espalda/bíceps), repartiendo hombros y brazos. SIN Hip Thrust; pierna centrada en sentadilla/peso muerto. La emphasis general es pecho/espalda/hombros.`,
    };
  }
  return {
    strategy,
    bias: 'balanced',
    leg_days: days <= 3 ? days : 2,
    text: `${days} días: ${strategy === 'full_body' ? 'full-body cada día con énfasis rotativo' : 'split balanceado entre tren superior e inferior'}.`,
  };
}

const SYSTEM_PROMPT = `Sos un entrenador de fuerza experto. Generás rutinas de gimnasio en formato JSON, replicando el estilo de un entrenador real.
Reglas estrictas:
- El array "days" DEBE tener EXACTAMENTE la cantidad N indicada en el mensaje del usuario como days_per_week. Ni más, ni menos. Si N=3, devolvé 3 días. Si N=4, devolvé 4 días. Esta regla es la más importante: violarla invalida toda la respuesta.

- ESTRUCTURA DEL SPLIT (depende de sexo + días + leg_days): seguí EXACTAMENTE el objeto "split_guidance" del mensaje del usuario. Resumen del criterio:
  · days_per_week <= 3 → FULL-BODY cada día (cada día toca varias regiones), con énfasis rotativo. NO uses un split Push/Pull/Legs salvo que split_guidance lo indique explícitamente (sólo hombre con 1 día de pierna).
  · days_per_week >= 4 → SPLIT (días enfocados por región).
  · MUJER: sesgo a tren INFERIOR (glúteos/femoral/cuádriceps son prioridad). Hip Thrust es el principal estrella de glúteo. NUNCA PPL clásico.
  · HOMBRE: sesgo a tren SUPERIOR (pecho/espalda/hombros/brazos). La cantidad de días de pierna la fija leg_days (1 o 2). Pierna centrada en Sentadilla/Peso Muerto; NO uses Hip Thrust como principal en hombre. Con 2 días de pierna: uno de Cuádriceps y otro de Femorales.
  Respetá el "bias" y el "leg_days" de split_guidance al repartir los días.

- CALENTAMIENTO intercalado: cada día arranca con 1-2 slots role="calentamiento" (del muscle_group "Calentamiento"). Si el día cruza de un bloque de tren inferior a uno de tren superior (o viceversa), poné un SEGUNDO calentamiento JUSTO ANTES del segundo bloque (no ambos al inicio). Si el día trabaja una sola región o exercise_minutes <= 30, usá 1 solo calentamiento al inicio.

- PRINCIPALES: cada día debe tener entre 1 y 3 slots role="principal" (compuestos pesados, abren cada bloque muscular). Cantidad según cuántas regiones grandes toque el día (full-body suele tener 2-3; un día enfocado en 1 región suele tener 1-2). REGLA CRÍTICA: todos los principales de un mismo día DEBEN trabajar grupos base distintos. El "grupo base" es la palabra antes del guión en muscle_group (ej. "Pecho - Mayor" → "Pecho", "Piernas - Cuadriceps" → "Piernas"). NO puede haber dos principales con el mismo grupo base en un día. OK: Sentadilla (Piernas) + Press Militar (Hombros); Hip Thrust (Piernas) + Jalón (Espalda) + Press Militar (Hombros). KO: Press Plano (Pecho) + Press Inclinado (Pecho).

- ACCESORIOS: después de cada principal agregá accesorios role="accesorio" que completen ese bloque muscular, bajando la intensidad (compuesto pesado → accesorio → aislado → finisher metabólico). Cerrá la mayoría de los días con 1-2 slots de core/abs cuando exercise_minutes >= 60.

- PRESCRIPCIÓN POR ACCESORIO (campos "series", "reps", "descanso"): en CADA slot role="accesorio" completá estos 3 campos según el tipo de serie. En slots role="principal" y role="calentamiento" dejalos en null (esos usan su propia periodización). Esquemas típicos del entrenador:
  · Accesorio compuesto/efectivo: series 2-3, reps "8" o "8 a 10" o "10 a 12", descanso "1:45 a 2 min".
  · Finisher metabólico (drop-set, último accesorio del bloque): series 2, reps "10x10x10", descanso "2 min".
  · Pirámide: series 2-3, reps "10 - 8 - 6", descanso "1:45 a 2 min".
  · Core/abs: series 3, reps "10" o "30 seg" o "30 seg + 10 cad", descanso "1 min".
  Bajá la intensidad a lo largo del bloque: el primer accesorio más pesado/efectivo, el último un finisher "10x10x10".

- Cantidad TOTAL de slots por día (calentamiento + principal + accesorio) según exercise_minutes:
  · 30 min → 5-6 slots · 45 min → 6-8 · 60 min → 8-10 · 75 min → 9-11 · 90 min → 10-12.
  Este conteo es OBLIGATORIO: si exercise_minutes=60, devolvé entre 8 y 10 slots.

- slot_index empieza en 1 y es consecutivo.
- El campo "role" SIEMPRE en español: exactamente "calentamiento", "principal" o "accesorio". Nunca "warmup", "accessory" ni "main".
- Sólo podés usar exercise_id que aparezcan en el catálogo provisto.
- No usar ejercicios contraindicados para las lesiones del atleta.
- Evitá repetir el mismo grupo base como protagonista en días consecutivos (salvo que el sesgo del sexo lo requiera, ej. mujer con varios días de pierna).
- Si training_mode='casa', priorizá ejercicios con equipment compatible (bw, mancuerna, elastico).
- Campo "notes": indicación del coach por ejercicio, derivada del tipo de serie cuando aplique: drop-set ("DISMINUIR PESO CADA 10 REPES"), pirámide ("AUMENTAR PESO AL FINALIZAR CADA SERIE"), principal pesado ("HACER SERIES DE APROXIMACIÓN"), o cue técnico ("CONTROLAR VELOCIDAD EN LA BAJADA"). Usar null si no hay indicación.
- Devolver SIEMPRE el JSON con TODOS los campos del schema, incluido "rationale" (string no vacío) y "notes" en cada slot (string o null).`;

export async function generateSkeleton(
  input: GenerateSkeletonInput,
): Promise<AiSkeletonOutput> {
  const { profile, exercises, rejectionFeedback } = input;

  const N = profile.days_per_week;
  const minutes = profile.exercise_minutes ?? 60;
  const validIds = exercises.map((e) => e.id);
  const split = buildSplitGuidance(profile);
  const userMessage = JSON.stringify({
    REQUIRED_DAYS_COUNT: N,
    note: `El array "days" debe tener exactamente ${N} elementos. Cualquier otra cantidad será rechazada.`,
    valid_exercise_ids: validIds,
    valid_exercise_ids_note: `SOLO podés usar exercise_id que estén en valid_exercise_ids (${validIds.length} disponibles). Cualquier id fuera de esta lista será rechazado. NO inventes ids.`,
    athlete: {
      gender: profile.gender, age: profile.age, height_cm: profile.height_cm,
      weight_kg: profile.weight_kg, level: profile.level, goal: profile.goal,
      days_per_week: N, leg_days: profile.leg_days, equipment: profile.equipment,
      injuries: profile.injuries,
      training_mode: profile.training_mode,
      commitment: profile.commitment,
      exercise_minutes: minutes,
    },
    split_guidance: {
      strategy: split.strategy,
      bias: split.bias,
      leg_days: split.leg_days,
      instruction: split.text,
    },
    constraints: {
      days: N,
      slots_per_day: slotRangeFor(minutes),
      principal_per_day:
        minutes <= 30 || profile.level === 'nunca'
          ? { min: 1, max: 1 }
          : { min: PRINCIPAL_MIN, max: PRINCIPAL_MAX },
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
      if (principals.length > PRINCIPAL_MAX) {
        lastError = `day ${day.day_index} tiene ${principals.length} principales; el máximo es ${PRINCIPAL_MAX}`;
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
          lastError = `day ${day.day_index} tiene principales del mismo grupo base (${[...uniq].join('/')}): ${names}. Los principales deben trabajar grupos base distintos.`;
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
