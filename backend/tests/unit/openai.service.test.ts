import { jest } from '@jest/globals';

// Mock the OpenAI SDK before importing the service
jest.unstable_mockModule('openai', () => {
  const parse = jest.fn();
  return {
    default: jest.fn().mockImplementation(() => ({
      chat: { completions: { parse } },
    })),
    __mockParse: parse,
  };
});
jest.unstable_mockModule('openai/helpers/zod', () => ({
  zodResponseFormat: jest.fn(() => ({ type: 'json_schema' })),
}));

type ParsedShape = { rationale?: string; days?: unknown[] };
type MockParse = jest.Mock<
  () => Promise<{
    choices: Array<{
      message: { parsed: ParsedShape | null; refusal?: string | null };
    }>;
  }>
>;

const openaiMod = (await import('openai')) as unknown as { __mockParse: MockParse };
const { adjustSkeleton } = await import('../../src/services/openai.service.js');
const { selectTemplate, buildSkeletonFromTemplate } = await import(
  '../../src/services/template.service.js'
);

const TEMPLATE = selectTemplate({
  gender: 'male', days_per_week: 4, leg_days: 1, days_specific: null,
}).template;

// Catalog fixture: every template exercise + one spare replacement, with the
// principal flag mirroring the template's derived roles so the validator has
// real data to check against.
const principalIds = new Set(
  TEMPLATE.days_detail.flatMap((d) =>
    d.slots.filter((s) => s.role === 'principal').map((s) => s.exercise_id),
  ),
);
const exercises = [
  ...new Map(
    TEMPLATE.days_detail
      .flatMap((d) => d.slots)
      .map((s) => [s.exercise_id, s]),
  ).values(),
].map((s) => ({
  id: s.exercise_id, name: s.exercise_name, muscle_group: s.muscle_group,
  equipment: 'maquina' as const, movement_pattern: 'push_h' as const,
  is_principal: principalIds.has(s.exercise_id), is_unilateral: false,
  level_min: 'principiante' as const, contraindicated_for: [],
  default_increment_kg: 1, alternatives_ids: [],
  video_url: null, illustration_url: null,
  modality: 'reps' as const, default_target: null, rep_cycle_threshold: 12,
}));

const profile = {
  user_id: 'u1', name: 'Test', gender: 'male' as const, age: 30,
  height_cm: 175, weight_kg: 75, level: 'medio' as const,
  goal: 'hipertrofia' as const, days_per_week: 4, leg_days: 1,
  equipment: 'gym_completo' as const, injuries: [],
  coach_id: null, onboarded_at: '2026-07-02',
  phone: null, plan_interest: null, training_mode: 'gym' as const,
  commitment: 'normal' as const, exercise_minutes: 60,
  days_specific: null, referral_source: null, sport_focus: null,
};

const REASONS = ['motivo de prueba'];
const baseOutput = buildSkeletonFromTemplate(TEMPLATE);

const ok = (parsed: ParsedShape | null) => ({
  choices: [{ message: { parsed, refusal: null as string | null } }],
});

beforeEach(() => openaiMod.__mockParse.mockReset());

it('accepts a template-faithful adjustment on first attempt', async () => {
  openaiMod.__mockParse.mockResolvedValue(ok(baseOutput));
  const out = await adjustSkeleton({
    template: TEMPLATE, profile, exercises, reasons: REASONS,
  });
  expect(out.days).toHaveLength(4);
  expect(openaiMod.__mockParse).toHaveBeenCalledTimes(1);
});

it('sends the base routine, reasons and filtered catalog to the model', async () => {
  openaiMod.__mockParse.mockResolvedValue(ok(baseOutput));
  await adjustSkeleton({
    template: TEMPLATE, profile, exercises, reasons: ['lesión de rodilla'],
  });
  const calls = openaiMod.__mockParse.mock.calls as unknown as Array<
    Array<{ messages: Array<{ role: string; content: string }> }>
  >;
  const userMsg = calls[0]![0]!.messages.find((m) => m.role === 'user')!.content;
  const parsed = JSON.parse(userMsg) as Record<string, unknown>;
  expect(parsed.motivos_de_ajuste).toEqual(['lesión de rodilla']);
  expect((parsed.rutina_base as { source: string }).source).toBe(TEMPLATE.source);
  expect(parsed.REQUIRED_DAYS_COUNT).toBe(4);
  expect(userMsg).not.toContain('series_budget_per_day'); // 60 min → no budget
});

it('includes the series budget only when the session is shorter than 60', async () => {
  // Hand-built 4 days inside the 45-min budget: 1 warmup + 3 accessories ×2
  // series = 7 total each.
  const warmupSlot = baseOutput.days[0]!.slots.find(
    (s) => s.role === 'calentamiento',
  )!;
  const accs = exercises.filter((e) => !e.is_principal).slice(0, 3);
  const trimmedDays = baseOutput.days.map((d, i) => ({
    day_index: i + 1,
    focus: 'f',
    slots: [
      { ...warmupSlot, slot_index: 1 },
      ...accs.map((e, j) => ({
        slot_index: j + 2, exercise_id: e.id, role: 'accesorio' as const,
        notes: null, series: 2, reps: '8', descanso: '2 min',
      })),
    ],
  }));
  openaiMod.__mockParse.mockResolvedValue(ok({ ...baseOutput, days: trimmedDays }));
  await adjustSkeleton({
    template: TEMPLATE,
    profile: { ...profile, exercise_minutes: 45 },
    exercises,
    reasons: REASONS,
  });
  const calls = openaiMod.__mockParse.mock.calls as unknown as Array<
    Array<{ messages: Array<{ role: string; content: string }> }>
  >;
  expect(calls[0]![0]!.messages[1]!.content).toContain('series_budget_per_day');
});

it('rejects wrong day count and retries with the error appended', async () => {
  openaiMod.__mockParse
    .mockResolvedValueOnce(ok({ ...baseOutput, days: baseOutput.days.slice(0, 2) }))
    .mockResolvedValueOnce(ok(baseOutput));
  const out = await adjustSkeleton({
    template: TEMPLATE, profile, exercises, reasons: REASONS,
  });
  expect(out.days).toHaveLength(4);
  expect(openaiMod.__mockParse).toHaveBeenCalledTimes(2);
  const calls = openaiMod.__mockParse.mock.calls as unknown as Array<
    Array<{ messages: Array<{ role: string; content: string }> }>
  >;
  expect(calls[1]![0]!.messages[2]!.content).toMatch(/days\.length/);
});

it('rejects exercises outside the athlete-allowed catalog', async () => {
  const tampered = {
    ...baseOutput,
    days: baseOutput.days.map((d, i) =>
      i === 0
        ? {
            ...d,
            slots: d.slots.map((s, si) =>
              si === 1 ? { ...s, exercise_id: 99999 } : s,
            ),
          }
        : d,
    ),
  };
  openaiMod.__mockParse.mockResolvedValue(ok(tampered));
  await expect(
    adjustSkeleton({ template: TEMPLATE, profile, exercises, reasons: REASONS }),
  ).rejects.toThrow(/no está en el catálogo/);
});

it('rejects a principal on a non-principal exercise', async () => {
  const accessory = exercises.find((e) => !e.is_principal)!;
  const tampered = {
    ...baseOutput,
    days: baseOutput.days.map((d, i) =>
      i === 0
        ? {
            ...d,
            slots: d.slots.map((s, si) =>
              si === 1
                ? { ...s, exercise_id: accessory.id, role: 'principal' as const }
                : s,
            ),
          }
        : d,
    ),
  };
  openaiMod.__mockParse.mockResolvedValue(ok(tampered));
  await expect(
    adjustSkeleton({ template: TEMPLATE, profile, exercises, reasons: REASONS }),
  ).rejects.toThrow(/principal/);
});

it('throws after MAX_ATTEMPTS invalid responses', async () => {
  openaiMod.__mockParse.mockResolvedValue(ok(null));
  await expect(
    adjustSkeleton({ template: TEMPLATE, profile, exercises, reasons: REASONS }),
  ).rejects.toThrow(/invalid after 5 attempts/);
  expect(openaiMod.__mockParse).toHaveBeenCalledTimes(5);
});
