import { jest } from '@jest/globals';

const mockAdjust = jest.fn<(input: unknown) => Promise<unknown>>();
jest.unstable_mockModule('../../src/services/openai.service.js', () => ({
  adjustSkeleton: mockAdjust,
}));

const { generateRoutine } = await import('../../src/services/routine-generation.service.js');
const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { listExercises, listExercisesForAthlete } = await import('../../src/services/exercise.service.js');

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); mockAdjust.mockReset(); });
afterAll(async () => { await closePool(); });

// Mirrors the real prod case: casa_basica + level 'nunca' + 3 days male.
const homeProfile = {
  user_id: '00000000-0000-0000-0000-000000000001',
  name: 'Casa', gender: 'male', age: 30, height_cm: 175, weight_kg: 75,
  level: 'nunca', goal: 'hipertrofia', days_per_week: 3, leg_days: 1,
  equipment: 'casa_basica', injuries: [], coach_id: null,
  onboarded_at: new Date().toISOString(), phone: null, plan_interest: 'full',
  training_mode: 'casa', commitment: 'normal', exercise_minutes: 60,
  days_specific: ['lun', 'mie', 'vie'], referral_source: 'google', sport_focus: null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

it('home beginner: substitutes deterministically; AI only for remaining unresolved', async () => {
  const catalog = await listExercises();
  const exercises = await listExercisesForAthlete(homeProfile);
  expect(exercises.length).toBeGreaterThan(0);

  // If AI is needed for a catalog gap, return a skeleton of allowed exercises.
  mockAdjust.mockResolvedValue({
    rationale: 'ajustado residual',
    days: [{ day_index: 1, focus: 'f', slots: [{
      slot_index: 1, exercise_id: exercises[0].id, role: 'principal',
      notes: null, series: null, reps: null, descanso: null,
    }] }],
  });

  const r = await generateRoutine({ profile: homeProfile, exercises, catalog });

  // Real catalog: ~14 swaps; one calf slot has no casa_basica same-group candidate.
  expect(r.substituted.length).toBeGreaterThanOrEqual(10);

  if (r.source === 'template+swap') {
    expect(mockAdjust).not.toHaveBeenCalled();
    expect(r.reasons).toEqual([]);
  } else {
    // Only residual unresolved slots go to the model — not the whole 16-exercise rewrite.
    expect(r.source).toBe('template+ai');
    expect(mockAdjust).toHaveBeenCalledTimes(1);
    const arg = mockAdjust.mock.calls[0][0] as unknown as { reasons: string[] };
    expect(arg.reasons).toHaveLength(1);
    expect(arg.reasons[0]).toMatch(/sin reemplazo automático posible/);
    // Reason lists only the unresolved names, not every originally unavailable exercise.
    expect(arg.reasons[0]).not.toMatch(/Press Plano con Barra/);
  }

  // Every SUBSTITUTED slot in the result is from the allowed catalog. Unresolved
  // slots may remain only when the AI path also failed to replace them — for
  // template+swap all slots must be allowed; for template+ai the mock returns
  // only allowed ids.
  if (r.source === 'template+swap') {
    const allowedIds = new Set(exercises.map((e) => e.id));
    for (const day of r.skeleton.days) {
      for (const s of day.slots) expect(allowedIds.has(s.exercise_id)).toBe(true);
    }
  }
});

it('no substitution needed: pure template, source stays "template"', async () => {
  const catalog = await listExercises();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gymProfile = { ...homeProfile, equipment: 'gym_completo', level: 'avanzado' } as any;
  const exercises = await listExercisesForAthlete(gymProfile);

  const r = await generateRoutine({ profile: gymProfile, exercises, catalog });

  expect(mockAdjust).not.toHaveBeenCalled();
  expect(r.source).toBe('template');
  expect(r.substituted).toEqual([]);
});

it('structural reason still reaches the AI, with the substituted template', async () => {
  const catalog = await listExercises();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shortProfile = { ...homeProfile, exercise_minutes: 30 } as any;
  const exercises = await listExercisesForAthlete(shortProfile);
  const allowedIds = new Set(exercises.map((e) => e.id));

  mockAdjust.mockResolvedValue({
    rationale: 'ajustado',
    days: [{ day_index: 1, focus: 'f', slots: [{
      slot_index: 1, exercise_id: exercises[0].id, role: 'principal',
      notes: null, series: null, reps: null, descanso: null,
    }] }],
  });

  const r = await generateRoutine({ profile: shortProfile, exercises, catalog });

  expect(mockAdjust).toHaveBeenCalledTimes(1);
  expect(r.source).toBe('template+ai');
  const arg = mockAdjust.mock.calls[0][0] as unknown as {
    template: { days_detail: { slots: { exercise_id: number }[] }[] };
    reasons: string[];
  };
  // Already-substituted slots must be allowed. Unresolved catalog gaps may remain
  // so the AI can handle them; those ids are not in allowedIds by design.
  let allowedSlotCount = 0;
  let totalSlots = 0;
  for (const d of arg.template.days_detail) {
    for (const s of d.slots) {
      totalSlots += 1;
      if (allowedIds.has(s.exercise_id)) allowedSlotCount += 1;
    }
  }
  expect(allowedSlotCount).toBeGreaterThan(totalSlots - 3); // at most a few unresolved
  expect(arg.reasons.some((x) => x.includes('30 min'))).toBe(true);
  // Structural reason present; optional unresolved reason may accompany it.
  expect(arg.reasons.length).toBeGreaterThanOrEqual(1);
  expect(arg.reasons.length).toBeLessThanOrEqual(2);
});
