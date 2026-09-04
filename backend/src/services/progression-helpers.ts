import type { Exercise } from '../domain/types.js';

// ─── Tablas porteadas del Apps Script ──────────────────
export const PESOS_MANCUERNAS = [
  4, 6, 7.5, 8, 10, 12.5, 14, 15, 16, 17.5, 18, 20, 22.5, 25, 30, 32.5, 35,
] as const;

export const PESOS_SVEND = [5, 10, 20] as const;

export const REPS_SIMPLES = ['6', '8', '10', '12'] as const;

/**
 * Dash pyramids ("10 - 8 - 6") are deliberately absent: the coach writes them
 * meaning the WEIGHT climbs set to set, which this model can't hold — there is
 * one kg per exercise, not one per set. Rotating them here also bumped that
 * single weight, which read as a random jump. They now fall through to the
 * `hold` at the end of advanceReps and the coach edits them by hand at
 * approval time.
 */
export const ADVANCE_REPS: Record<string, string> = {
  '4 a 6': '6 a 8',
  '6 a 8': '8 a 10',
  '8 a 10': '10 a 12',
  '10 a 12': '4 a 6', // bumps weight
  '10x10x10': '12x12x12',
  '12x12x12': '10x10x10', // bumps weight
  '8x6x4x6x8': '10x8x6x8x10',
  '10x8x6x8x10': '8x6x4x6x8', // bumps weight
};

const REP_BUMP_TRIGGERS = new Set(['10 a 12', '12x12x12', '10x8x6x8x10']);

export const EJERCICIOS_HASTA_15 = new Set([
  'Face Pull parado con Soga',
  'Vuelos Posteriores Sentado con Mancuernas',
  'Vuelos Laterales con Mancuerna',
  'Vuelo Lateral Unilateral en polea altura Rodilla',
]);

export const EJERCICIOS_PRINCIPAL = new Set([
  'Press Plano con Barra',
  'Remo con Barra Plana',
  'Sentadilla con Barra Plana',
  'Press Militar con Barra parado',
  'Peso Muerto con Barra',
  'Press Militar con Mancuernas Sentado',
  'Hip Thrust',
]);

export const GRUPOS_EXCLUIDOS = [
  'abdomen',
  'calentamiento',
  'cardio',
  'superserie',
  'rest-pause',
];

// ─── Helpers ──────────────────────────────────────────
export function roundToNearest25(value: number): number {
  // Mirror of Apps Script `redondearAlPesoMasCercano`:
  // round to nearest 2.5 in [2.5, 300]. Ties go to lower (closest by abs diff,
  // first match wins via reduce).
  const candidates: number[] = [];
  for (let v = 2.5; v <= 300; v += 2.5) candidates.push(v);
  return candidates.reduce(
    (best, cur) =>
      Math.abs(cur - value) < Math.abs(best - value) ? cur : best,
    candidates[0]
  );
}

/** Round a computed weight per equipment: 2.5-step for barbell/smith, 1-step otherwise. */
export function roundWeightForEquipment(
  value: number,
  equipment: string
): number {
  return equipment === 'barra' || equipment === 'smith'
    ? roundToNearest25(value)
    : Math.round(value);
}

function nextInList(value: number, list: readonly number[]): number {
  return list.find((v) => v > value) ?? value;
}

export function applyIncrement(currentKg: number, exercise: Exercise): number {
  const n = exercise.name;
  const nl = n.toLowerCase();

  // Special cases (mirror getAumentoPersonalizado)
  if (n === 'Svend Press con Disco acostado') {
    return nextInList(currentKg, PESOS_SVEND);
  }
  if (exercise.equipment === 'smith') return currentKg + 2.5;
  if (nl.includes('prensa')) return currentKg + 2.5;
  if (nl.includes('nordico femoral')) return currentKg + 1;
  if (nl.includes('desplante') && nl.includes('barra')) return currentKg + 1;
  if (nl.includes('pantorrillas en maquina sentado')) return currentKg + 2.5;
  if (nl.includes('pecho sentado en mariposa')) return currentKg + 1;
  if (
    nl.includes('jalon') ||
    nl.includes('face pull') ||
    nl.includes('flexion') ||
    nl.includes('fondos')
  ) {
    return currentKg + 1;
  }
  if (
    exercise.equipment === 'mancuerna' ||
    exercise.equipment === 'pesa_rusa'
  ) {
    return nextInList(currentKg, PESOS_MANCUERNAS);
  }
  if (exercise.equipment === 'maquina' || exercise.equipment === 'polea') {
    return currentKg + 1;
  }
  if (exercise.equipment === 'barra') {
    return roundToNearest25(currentKg + 2.5);
  }
  return currentKg;
}

export interface AdvanceResult {
  newReps: string;
  bumpWeight: boolean;
}

export interface AdvanceOptions {
  /** Rep "tope": reps climb +2 up to this, then reset and bump weight. */
  threshold: number;
  /** Reset rep target after a bump — sex-based: female 4, male/other 6. */
  resetReps: number;
}

type RepSchemeFamily =
  | 'plain'
  | 'range'
  | `dropset:${number}`
  | `pyramid:${number}`
  | 'fixed';

function repSchemeFamily(reps: string): RepSchemeFamily {
  const value = reps.trim();
  const nums = value.match(/\d+/g) ?? [];

  if (/^\d+$/.test(value)) return 'plain';
  if (nums.length >= 3 && /\d\s*[x×]\s*\d/i.test(value)) {
    return `dropset:${nums.length}`;
  }
  if (nums.length >= 3 && /\d\s*[-–]\s*\d/.test(value)) {
    return `pyramid:${nums.length}`;
  }
  if (/^\d+\s*(?:a|[-–])\s*\d+$/i.test(value)) return 'range';
  return 'fixed';
}

export type WeightScheme = 'normal' | 'dropset';

/**
 * Bucket de carga al que pertenece una prescripción.
 *
 * El coach maneja dos escaleras distintas para el MISMO ejercicio: el dropset /
 * superserie sube `10x10x10 → 12x12x12 → 10x10x10` (+carga recién ahí) y las
 * series rectas suben `6→8→10→12→6` (+carga recién ahí). Cada una lleva su
 * propio kg, así que el bucket es parte de la clave de
 * `athlete_exercise_weights`. Las pirámides con `x` (`8x6x4x6x8`) entran acá
 * también: son multi-drop.
 */
export function weightScheme(reps: string | null | undefined): WeightScheme {
  const value = reps?.trim();
  if (!value) return 'normal';
  return repSchemeFamily(value).startsWith('dropset:') ? 'dropset' : 'normal';
}

/**
 * Resolves the reps prescription for an accessory without letting stale
 * per-exercise progression erase a coach-authored per-slot scheme.
 *
 * Progressed reps win only inside the same scheme family: 10x10x10 may advance
 * to 12x12x12, but a stale plain "10" cannot turn that dropset into a normal
 * set. Fixed targets (time, fallo, per-side, etc.) must match exactly.
 */
export function resolveAccessoryReps(
  slotReps: string | null | undefined,
  currentReps: string | null | undefined,
  fallbackReps: string
): string {
  const base = slotReps?.trim() || fallbackReps;
  const current = currentReps?.trim();
  if (!current) return base;
  if (!slotReps) return current;

  const baseFamily = repSchemeFamily(base);
  const currentFamily = repSchemeFamily(current);
  if (baseFamily === 'fixed' || currentFamily === 'fixed') {
    return base.toLowerCase() === current.toLowerCase() ? current : base;
  }
  return baseFamily === currentFamily ? current : base;
}

export function advanceReps(
  currentReps: string,
  opts: AdvanceOptions
): AdvanceResult {
  const { threshold, resetReps } = opts;

  // Plain-integer rep schemes (e.g. "6", "12", "15").
  if (/^\d+$/.test(currentReps.trim())) {
    const cur = parseInt(currentReps.trim(), 10);
    if (cur >= threshold) {
      return { newReps: String(resetReps), bumpWeight: true };
    }
    const next = cur + 2;
    return {
      newReps: String(next >= threshold ? threshold : next),
      bumpWeight: false,
    };
  }

  // Legacy range / pyramid rotations — unchanged.
  const next = ADVANCE_REPS[currentReps];
  if (next) {
    return { newReps: next, bumpWeight: REP_BUMP_TRIGGERS.has(currentReps) };
  }

  // Unknown pattern: hold.
  return { newReps: currentReps, bumpWeight: false };
}

export function isExcludedFromAutoProgression(
  exerciseName: string,
  muscleGroup: string
): boolean {
  if (EJERCICIOS_PRINCIPAL.has(exerciseName)) return true;
  const g = muscleGroup.toLowerCase();
  return GRUPOS_EXCLUIDOS.some((p) => g.includes(p));
}

// ─── Gate de progresión (reps realizadas + RPE) ────────
/** Ventana de RPE en la que el coach acepta progresar (9-10 bloquea). */
export const RPE_MIN = 6;
export const RPE_MAX = 8;

export interface SetLogForGate {
  completed: boolean;
  reps: number | null;
  rpe: number | null;
  drop_index: number | null;
}

/**
 * Reps objetivo de UNA serie según la prescripción y el drop (1-based).
 * `null` = prescripción no numérica (tiempo, fallo, por lado…): no evaluable.
 */
export function targetRepsForSet(
  prescription: string,
  dropIndex: number | null
): number | null {
  const value = prescription.trim();
  const nums = (value.match(/\d+/g) ?? []).map(Number);
  if (nums.length === 0) return null;
  const family = repSchemeFamily(value);
  if (family === 'fixed') return null;
  if (family === 'plain') return nums[0];
  // Rango ("8 a 10"): doble progresión, se sube recién al tocar el techo.
  if (family === 'range') return Math.max(...nums);
  // Dropset / pirámide: cada drop tiene su propio objetivo.
  return nums[(dropIndex ?? 1) - 1] ?? Math.max(...nums);
}

/**
 * ¿La semana habilita progresión de reps/carga?
 *
 * No alcanza con que el alumno marque las series como hechas: el contador de
 * reps de cada serie tiene que llegar al objetivo de esa serie, y todo RPE
 * cargado tiene que caer en [6, 8]: 9 o 10 es demasiado duro para sumar. Series sin reps o con
 * prescripción no numérica no se evalúan (no bloquean).
 */
export function qualifiesForProgression(
  logs: SetLogForGate[],
  prescription: string
): boolean {
  if (logs.length === 0 || !logs.every((l) => l.completed)) return false;

  for (const l of logs) {
    if (l.reps === null) continue;
    const target = targetRepsForSet(prescription, l.drop_index);
    if (target !== null && l.reps < target) return false;
  }

  // Una sola serie en RPE 9-10 ya dice que la carga quedó grande: alcanza para
  // frenar la semana, no se promedia con las livianas.
  for (const l of logs) {
    if (l.rpe !== null && (l.rpe < RPE_MIN || l.rpe > RPE_MAX)) return false;
  }
  return true;
}
