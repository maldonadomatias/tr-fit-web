import {
  PESOS_MANCUERNAS,
  PESOS_SVEND,
  REPS_SIMPLES,
  ADVANCE_REPS,
  EJERCICIOS_HASTA_15,
  EJERCICIOS_PRINCIPAL,
  GRUPOS_EXCLUIDOS,
  roundToNearest25,
  applyIncrement,
  advanceReps,
  isExcludedFromAutoProgression,
} from '../../src/services/progression-helpers';

describe('roundToNearest25', () => {
  it.each([
    [82, 82.5],
    [83.7, 82.5],
    [85, 85],
    [86.2, 85],
    [86.3, 87.5],
    [200, 200],
    [201.4, 200],
  ])('rounds %f to %f', (input, expected) => {
    expect(roundToNearest25(input)).toBe(expected);
  });
});

describe('applyIncrement — barbell exercises (round +2.5)', () => {
  it('Press Plano con Barra: 80 -> 82.5', () => {
    expect(applyIncrement(80, mockExercise({ name: 'Press Plano con Barra', equipment: 'barra' })))
      .toBe(82.5);
  });
  it('Press Plano con Barra: 81 -> 82.5 (rounds up)', () => {
    expect(applyIncrement(81, mockExercise({ name: 'Press Plano con Barra', equipment: 'barra' })))
      .toBe(82.5);
  });
});

describe('applyIncrement — Smith machine (+2.5)', () => {
  it('Sentadilla en maquina Smith: 60 -> 62.5', () => {
    expect(applyIncrement(60, mockExercise({ name: 'Sentadilla en maquina Smith', equipment: 'smith' })))
      .toBe(62.5);
  });
});

describe('applyIncrement — mancuerna (next in pesosMancuernas)', () => {
  it.each([
    [4, 6],
    [6, 7.5],
    [7.5, 8],
    [8, 10],
    [10, 12.5],
    [25, 30],
    [30, 32.5],
    [35, 35], // top of list — stays
  ])('mancuerna %f -> %f', (from, to) => {
    expect(applyIncrement(from, mockExercise({ name: 'Curl con Mancuerna', equipment: 'mancuerna' })))
      .toBe(to);
  });
});

describe('applyIncrement — Svend Press disco', () => {
  it('5 -> 10', () => {
    expect(applyIncrement(5, mockExercise({ name: 'Svend Press con Disco acostado', equipment: 'disco', default_increment_kg: 5 })))
      .toBe(10);
  });
  it('20 -> 20 (top)', () => {
    expect(applyIncrement(20, mockExercise({ name: 'Svend Press con Disco acostado', equipment: 'disco', default_increment_kg: 5 })))
      .toBe(20);
  });
});

describe('applyIncrement — maquina/polea (+1)', () => {
  it('Prensa: 100 -> 102.5 (special case +2.5)', () => {
    expect(applyIncrement(100, mockExercise({ name: 'Prensa', equipment: 'maquina', default_increment_kg: 2.5 })))
      .toBe(102.5);
  });
  it('Curl Femoral: 30 -> 31', () => {
    expect(applyIncrement(30, mockExercise({ name: 'Curl Femoral Sentado en maquina', equipment: 'maquina', default_increment_kg: 1 })))
      .toBe(31);
  });
  it('Face Pull (polea, +1): 15 -> 16', () => {
    expect(applyIncrement(15, mockExercise({ name: 'Face Pull parado con Soga', equipment: 'polea', default_increment_kg: 1 })))
      .toBe(16);
  });
});

describe('advanceReps — simple reps rotation', () => {
  it.each([
    ['6', { newReps: '8', bumpWeight: false }],
    ['8', { newReps: '10', bumpWeight: false }],
    ['10', { newReps: '12', bumpWeight: false }],
    ['12', { newReps: '6', bumpWeight: true }],
  ])('%s -> %o', (input, expected) => {
    expect(advanceReps(input, false)).toEqual(expected);
  });
});

describe('advanceReps — range rotation', () => {
  it.each([
    ['4 a 6', { newReps: '6 a 8', bumpWeight: false }],
    ['6 a 8', { newReps: '8 a 10', bumpWeight: false }],
    ['8 a 10', { newReps: '10 a 12', bumpWeight: false }],
    ['10 a 12', { newReps: '4 a 6', bumpWeight: true }],
  ])('%s -> %o', (input, expected) => {
    expect(advanceReps(input, false)).toEqual(expected);
  });
});

describe('advanceReps — pyramid rotations', () => {
  it.each([
    ['10x10x10', { newReps: '12x12x12', bumpWeight: false }],
    ['12x12x12', { newReps: '10x10x10', bumpWeight: true }],
    ['12 - 10 - 8', { newReps: '8 - 6 - 4', bumpWeight: false }],
    ['8 - 6 - 4', { newReps: '10 - 8 - 6', bumpWeight: false }],
    ['10 - 8 - 6', { newReps: '12 - 10 - 8', bumpWeight: true }],
    ['8x6x4x6x8', { newReps: '10x8x6x8x10', bumpWeight: false }],
    ['10x8x6x8x10', { newReps: '8x6x4x6x8', bumpWeight: true }],
  ])('%s -> %o', (input, expected) => {
    expect(advanceReps(input, false)).toEqual(expected);
  });
});

describe('advanceReps — ejerciciosHasta15', () => {
  it('non-15 goes to 15 first', () => {
    expect(advanceReps('12', true))
      .toEqual({ newReps: '15', bumpWeight: false });
  });
  it('15 rotates to 4 a 6 with weight bump', () => {
    expect(advanceReps('15', true))
      .toEqual({ newReps: '4 a 6', bumpWeight: true });
  });
});

describe('isExcludedFromAutoProgression', () => {
  it('excludes principal exercises', () => {
    expect(isExcludedFromAutoProgression('Press Plano con Barra', 'pecho')).toBe(true);
    expect(isExcludedFromAutoProgression('Hip Thrust', 'gluteos')).toBe(true);
  });
  it('excludes by group', () => {
    expect(isExcludedFromAutoProgression('Plancha', 'abdomen')).toBe(true);
    expect(isExcludedFromAutoProgression('Saltos', 'cardio')).toBe(true);
    expect(isExcludedFromAutoProgression('Press X', 'superserie')).toBe(true);
  });
  it('does not exclude regular accesorio', () => {
    expect(isExcludedFromAutoProgression('Curl Biceps con Mancuerna', 'biceps')).toBe(false);
  });
});

function mockExercise(over: Partial<{
  name: string; equipment: string; default_increment_kg: number;
}>) {
  return {
    id: 1,
    name: over.name ?? 'Test',
    muscle_group: 'Pecho - Mayor',
    equipment: (over.equipment ?? 'mancuerna') as
      'barra' | 'mancuerna' | 'maquina' | 'polea' | 'smith' | 'bw' | 'pesa_rusa' | 'elastico' | 'disco',
    movement_pattern: 'isolation' as const,
    is_principal: false,
    is_unilateral: false,
    level_min: 'principiante' as const,
    contraindicated_for: [],
    default_increment_kg: over.default_increment_kg ?? 1,
    alternatives_ids: [],
    video_url: null,
    illustration_url: null,
  };
}
