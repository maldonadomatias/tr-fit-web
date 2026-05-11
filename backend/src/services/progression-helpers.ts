import type { Exercise } from '../domain/types.js';

// ─── Tablas porteadas del Apps Script ──────────────────
export const PESOS_MANCUERNAS = [
  4, 6, 7.5, 8, 10, 12.5, 14, 15, 16, 17.5, 18, 20, 22.5, 25, 30, 32.5, 35,
] as const;

export const PESOS_SVEND = [5, 10, 20] as const;

export const REPS_SIMPLES = ['6', '8', '10', '12'] as const;

export const ADVANCE_REPS: Record<string, string> = {
  '4 a 6': '6 a 8',
  '6 a 8': '8 a 10',
  '8 a 10': '10 a 12',
  '10 a 12': '4 a 6',          // bumps weight
  '10x10x10': '12x12x12',
  '12x12x12': '10x10x10',      // bumps weight
  '12 - 10 - 8': '8 - 6 - 4',
  '8 - 6 - 4': '10 - 8 - 6',
  '10 - 8 - 6': '12 - 10 - 8', // bumps weight
  '8x6x4x6x8': '10x8x6x8x10',
  '10x8x6x8x10': '8x6x4x6x8',  // bumps weight
};

const REP_BUMP_TRIGGERS = new Set([
  '10 a 12',
  '12x12x12',
  '10 - 8 - 6',
  '10x8x6x8x10',
]);

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
  'abdomen', 'calentamiento', 'cardio', 'superserie', 'rest-pause',
];

// ─── Helpers ──────────────────────────────────────────
export function roundToNearest25(value: number): number {
  // Mirror of Apps Script `redondearAlPesoMasCercano`:
  // round to nearest 2.5 in [2.5, 200]. Ties go to lower (closest by abs diff,
  // first match wins via reduce).
  const candidates: number[] = [];
  for (let v = 2.5; v <= 200; v += 2.5) candidates.push(v);
  return candidates.reduce((best, cur) =>
    Math.abs(cur - value) < Math.abs(best - value) ? cur : best
  , candidates[0]);
}

function nextInList(
  value: number,
  list: readonly number[],
): number {
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
  if (nl.includes('jalon') || nl.includes('face pull') ||
      nl.includes('flexion') || nl.includes('fondos')) {
    return currentKg + 1;
  }
  if (exercise.equipment === 'mancuerna' || exercise.equipment === 'pesa_rusa') {
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

export function advanceReps(currentReps: string, isHasta15: boolean): AdvanceResult {
  if (isHasta15) {
    if (currentReps !== '15') return { newReps: '15', bumpWeight: false };
    return { newReps: '4 a 6', bumpWeight: true };
  }

  // Simple reps rotation
  if ((REPS_SIMPLES as readonly string[]).includes(currentReps)) {
    const idx = REPS_SIMPLES.indexOf(currentReps as typeof REPS_SIMPLES[number]);
    if (idx === REPS_SIMPLES.length - 1) {
      return { newReps: '6', bumpWeight: true };
    }
    return { newReps: REPS_SIMPLES[idx + 1], bumpWeight: false };
  }

  // Range / pyramid rotations
  const next = ADVANCE_REPS[currentReps];
  if (next) {
    return { newReps: next, bumpWeight: REP_BUMP_TRIGGERS.has(currentReps) };
  }

  // Unknown pattern: hold
  return { newReps: currentReps, bumpWeight: false };
}

export function isExcludedFromAutoProgression(
  exerciseName: string,
  muscleGroup: string,
): boolean {
  if (EJERCICIOS_PRINCIPAL.has(exerciseName)) return true;
  const g = muscleGroup.toLowerCase();
  return GRUPOS_EXCLUIDOS.some((p) => g.includes(p));
}
