import {
  qualifiesForProgression,
  targetRepsForSet,
} from '../../src/services/progression-helpers.js';

const set = (
  reps: number | null,
  rpe: number | null = null,
  drop: number | null = null
) => ({
  completed: true,
  reps,
  rpe,
  drop_index: drop,
});

it('blocks progression when a set falls short of the target reps', () => {
  // El caso del alumno: objetivo 8, hizo 6 en la última serie.
  expect(qualifiesForProgression([set(8), set(8), set(6)], '8')).toBe(false);
  expect(qualifiesForProgression([set(8), set(8), set(9)], '8')).toBe(true);
});

it('needs every set completed', () => {
  expect(
    qualifiesForProgression(
      [{ ...set(8) }, { ...set(8), completed: false }],
      '8'
    )
  ).toBe(false);
});

it('gates on RPE 6-8 per set, ignoring sets without RPE', () => {
  expect(qualifiesForProgression([set(8, 7.5), set(8, 8)], '8')).toBe(true);
  expect(qualifiesForProgression([set(8, 6), set(8, 6)], '8')).toBe(true);
  expect(qualifiesForProgression([set(8, 9), set(8, 9)], '8')).toBe(false);
  expect(qualifiesForProgression([set(8, 10), set(8, 6)], '8')).toBe(false);
  expect(qualifiesForProgression([set(8), set(8)], '8')).toBe(true);
});

it('skips sets we cannot judge (no rep counter, non-numeric prescription)', () => {
  expect(qualifiesForProgression([set(null), set(null)], '8')).toBe(true);
  expect(qualifiesForProgression([set(2), set(2)], '40 seg')).toBe(true);
});

it('resolves per-set targets', () => {
  expect(targetRepsForSet('12', null)).toBe(12);
  expect(targetRepsForSet('8 a 10', null)).toBe(10); // doble progresión: techo
  expect(targetRepsForSet('8x6x4x6x8', 3)).toBe(4);
  expect(targetRepsForSet('40 seg', null)).toBe(null);
});

it('gates a dropset drop by drop', () => {
  expect(
    qualifiesForProgression(
      [set(8, null, 1), set(6, null, 2), set(4, null, 3)],
      '8x6x4'
    )
  ).toBe(true);
  expect(
    qualifiesForProgression(
      [set(8, null, 1), set(5, null, 2), set(4, null, 3)],
      '8x6x4'
    )
  ).toBe(false);
});
