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

// zodResponseFormat is a thin schema helper — stub it to a no-op so the
// service can call it without a real conversion taking place during tests.
jest.unstable_mockModule('openai/helpers/zod', () => ({
  zodResponseFormat: jest.fn(() => ({ type: 'json_schema' })),
}));

type ParsedShape = {
  rationale?: string;
  days?: unknown[];
};
type MockParse = jest.Mock<
  () => Promise<{
    choices: Array<{
      message: { parsed: ParsedShape | null; refusal?: string | null };
    }>;
  }>
>;

const openaiMod = (await import('openai')) as unknown as { __mockParse: MockParse };
const { generateSkeleton, buildSplitGuidance } = await import(
  '../../src/services/openai.service.js'
);

const profile = {
  user_id: 'u1', name: 'Test', gender: 'male' as const, age: 30,
  height_cm: 175, weight_kg: 75, level: 'medio' as const,
  goal: 'hipertrofia' as const, days_per_week: 4, leg_days: 1,
  equipment: 'gym_completo' as const, injuries: [],
  coach_id: null, onboarded_at: '2026-05-08',
  phone: null, plan_interest: null, training_mode: null,
  commitment: null, exercise_minutes: null, days_specific: null,
  referral_source: null, sport_focus: null,
};

const ex = (
  id: number,
  name: string,
  muscle_group: string,
  is_principal: boolean,
) => ({
  id, name, muscle_group,
  equipment: 'barra' as const, movement_pattern: 'push_h' as const,
  is_principal, is_unilateral: false, level_min: 'principiante' as const,
  contraindicated_for: [], default_increment_kg: 2.5, alternatives_ids: [],
  video_url: null, illustration_url: null,
  modality: 'reps' as const, default_target: null,
  rep_cycle_threshold: 12,
});

const exercises = [
  ex(1, 'Press Plano con Barra', 'Pecho - Mayor', true),
  ex(2, 'Curl Biceps con Mancuerna', 'Biceps', false),
  ex(3, 'Remo con Barra', 'Espalda', true),
  ex(4, 'Sentadilla con Barra', 'Piernas - Cuadriceps', true),
  ex(5, 'Movimiento Articular', 'Calentamiento', false),
  ex(6, 'Press Militar', 'Hombros', true),
  // Accessory pool spread across distinct base muscles so padded days stay
  // under the per-muscle volume cap (≤10 working series / base muscle / day).
  ex(7, 'Extensión Triceps en Polea', 'Triceps', false),
  ex(8, 'Elevaciones Laterales', 'Hombros - Lateral', false),
  ex(9, 'Curl Femoral Acostado', 'Piernas - Femoral', false),
];

// Accessory exercise_ids cycled when padding a day. Distinct base muscles keep
// any single muscle's series under the cap.
const ACCESSORY_IDS = [2, 7, 8, 9];

// Build a day with `principalIds` principals + accessories padded to `total`
// slots (default 8, valid for the 60-min range 8-10).
type Slot = {
  slot_index: number;
  exercise_id: number;
  role: 'calentamiento' | 'principal' | 'accesorio';
  notes: string | null;
};

const mkDay = (
  dayIndex: number,
  principalIds: number[],
  total = 8,
) => {
  const slots: Slot[] = principalIds.map((id, i) => ({
    slot_index: i + 1, exercise_id: id, role: 'principal', notes: null,
  }));
  while (slots.length < total) {
    const accIdx = slots.length - principalIds.length;
    slots.push({
      slot_index: slots.length + 1,
      exercise_id: ACCESSORY_IDS[accIdx % ACCESSORY_IDS.length],
      role: 'accesorio', notes: null,
    });
  }
  return { day_index: dayIndex, focus: 'f', slots };
};

const validOutput = {
  rationale: 'split adecuado',
  days: [mkDay(1, [1]), mkDay(2, [3]), mkDay(3, [4]), mkDay(4, [6])],
};

beforeEach(() => openaiMod.__mockParse.mockReset());

const ok = (parsed: ParsedShape | null) => ({
  choices: [{ message: { parsed, refusal: null as string | null } }],
});

it('returns parsed skeleton on first valid response', async () => {
  openaiMod.__mockParse.mockResolvedValue(ok(validOutput));
  const out = await generateSkeleton({ profile, exercises });
  expect(out.days).toHaveLength(4);
  expect(out.rationale).toBe('split adecuado');
  expect(openaiMod.__mockParse).toHaveBeenCalledTimes(1);
});

it('retries when business constraints fail, then succeeds', async () => {
  openaiMod.__mockParse
    .mockResolvedValueOnce(ok({ ...validOutput, days: [validOutput.days[0]!] }))
    .mockResolvedValueOnce(ok({ ...validOutput, days: validOutput.days.slice(0, 2) }))
    .mockResolvedValueOnce(ok(validOutput));
  const out = await generateSkeleton({ profile, exercises });
  expect(out.days).toHaveLength(4);
  expect(openaiMod.__mockParse).toHaveBeenCalledTimes(3);
});

it('throws after MAX_ATTEMPTS failed attempts', async () => {
  openaiMod.__mockParse.mockResolvedValue(ok(null));
  await expect(generateSkeleton({ profile, exercises })).rejects.toThrow(/skeleton.*invalid/i);
  expect(openaiMod.__mockParse).toHaveBeenCalledTimes(5);
});

it('rejects when output uses unknown exercise_id', async () => {
  openaiMod.__mockParse.mockResolvedValue(ok({
    rationale: 'r',
    days: Array.from({ length: 4 }, (_, i) => mkDay(i + 1, [999])),
  }));
  await expect(generateSkeleton({ profile, exercises })).rejects.toThrow();
});

it('rejects when day count !== days_per_week', async () => {
  openaiMod.__mockParse.mockResolvedValue(ok({
    rationale: 'r', days: [mkDay(1, [1])],
  }));
  await expect(generateSkeleton({ profile, exercises })).rejects.toThrow();
});

it('accepts up to 3 principals of distinct base groups in a day', async () => {
  // day 1 has 3 principals (Pecho/Espalda/Piernas) — allowed by the 1-3 range.
  openaiMod.__mockParse.mockResolvedValue(ok({
    rationale: 'r',
    days: [mkDay(1, [1, 3, 4]), mkDay(2, [3]), mkDay(3, [4]), mkDay(4, [6])],
  }));
  const out = await generateSkeleton({ profile, exercises });
  expect(out.days[0]!.slots.filter((s) => s.role === 'principal')).toHaveLength(3);
});

it('rejects more than 3 principals in a day', async () => {
  openaiMod.__mockParse.mockResolvedValue(ok({
    rationale: 'r',
    days: [mkDay(1, [1, 3, 4, 6]), mkDay(2, [3]), mkDay(3, [4]), mkDay(4, [6])],
  }));
  await expect(generateSkeleton({ profile, exercises })).rejects.toThrow();
});

it('rejects two principals sharing a base group', async () => {
  // ids 1 (Pecho-Mayor) duplicated → same base group "pecho".
  openaiMod.__mockParse.mockResolvedValue(ok({
    rationale: 'r',
    days: [mkDay(1, [1, 1]), mkDay(2, [3]), mkDay(3, [4]), mkDay(4, [6])],
  }));
  await expect(generateSkeleton({ profile, exercises })).rejects.toThrow();
});

it('rejects a day exceeding 10 working series for one muscle', async () => {
  // 1 principal + 7 biceps accessories → biceps = 7×2 = 14 series (> 10).
  const accSlots = Array.from({ length: 7 }, (_, i) => ({
    slot_index: i + 2, exercise_id: 2, role: 'accesorio' as const, notes: null,
  }));
  const heavyBiceps = {
    day_index: 1, focus: 'f',
    slots: [{ slot_index: 1, exercise_id: 1, role: 'principal' as const, notes: null }, ...accSlots],
  };
  openaiMod.__mockParse.mockResolvedValue(ok({
    rationale: 'r',
    days: [heavyBiceps, mkDay(2, [3]), mkDay(3, [4]), mkDay(4, [6])],
  }));
  await expect(generateSkeleton({ profile, exercises })).rejects.toThrow(/series/);
});

it('rejects a day exceeding 20 total working series', async () => {
  // 3 principals (9 series) + 6 accessories spread across muscles (12 series)
  // = 21 total (> 20), while no single muscle breaks the per-muscle cap.
  const accSlots = Array.from({ length: 6 }, (_, i) => ({
    slot_index: i + 4, exercise_id: ACCESSORY_IDS[i % ACCESSORY_IDS.length],
    role: 'accesorio' as const, notes: null,
  }));
  const heavyDay = {
    day_index: 1, focus: 'f',
    slots: [
      { slot_index: 1, exercise_id: 1, role: 'principal' as const, notes: null },
      { slot_index: 2, exercise_id: 3, role: 'principal' as const, notes: null },
      { slot_index: 3, exercise_id: 4, role: 'principal' as const, notes: null },
      ...accSlots,
    ],
  };
  openaiMod.__mockParse.mockResolvedValue(ok({
    rationale: 'r',
    days: [heavyDay, mkDay(2, [3]), mkDay(3, [4]), mkDay(4, [6])],
  }));
  await expect(generateSkeleton({ profile, exercises })).rejects.toThrow(/series/);
});

it('includes commitment + training_mode + exercise_minutes in user prompt', async () => {
  openaiMod.__mockParse.mockResolvedValueOnce(ok({
    rationale: 'r',
    days: [mkDay(1, [1], 6)],
  }));
  const enriched = {
    ...profile, days_per_week: 1, exercise_minutes: 45 as number,
    training_mode: 'casa' as const, commitment: 'exigente' as const,
    phone: '+5491111111111', plan_interest: 'full' as const,
    days_specific: ['lun'] as const, referral_source: 'google' as const,
  } as never;

  await generateSkeleton({ profile: enriched, exercises });

  const calls = openaiMod.__mockParse.mock.calls as unknown as Array<
    Array<{ messages: Array<{ role: string; content: string }> }>
  >;
  const userMsg = calls[0]![0]!.messages.find((m) => m.role === 'user')!.content;
  expect(userMsg).toContain('"training_mode":"casa"');
  expect(userMsg).toContain('"commitment":"exigente"');
  expect(userMsg).toContain('"exercise_minutes":45');
});

it('includes gender-aware split_guidance in the user prompt', async () => {
  openaiMod.__mockParse.mockResolvedValue(ok(validOutput));
  await generateSkeleton({ profile, exercises });
  const calls = openaiMod.__mockParse.mock.calls as unknown as Array<
    Array<{ messages: Array<{ role: string; content: string }> }>
  >;
  const userMsg = calls[0]![0]!.messages.find((m) => m.role === 'user')!.content;
  expect(userMsg).toContain('"split_guidance"');
  expect(userMsg).toContain('"bias":"upper"'); // male
  expect(userMsg).toContain('"leg_days":1');
});

it('includes a coach corpus example matched to the profile in the user prompt', async () => {
  openaiMod.__mockParse.mockResolvedValue(ok(validOutput));
  await generateSkeleton({ profile, exercises }); // male, 4 days, leg_days 1
  const calls = openaiMod.__mockParse.mock.calls as unknown as Array<
    Array<{ messages: Array<{ role: string; content: string }> }>
  >;
  const userMsg = calls[0]![0]!.messages.find((m) => m.role === 'user')!.content;
  expect(userMsg).toContain('"coach_example"');
  const parsed = JSON.parse(userMsg) as {
    coach_example: {
      source: string;
      days: Array<{ focus: string; slots: unknown[] }>;
    };
  };
  expect(parsed.coach_example.days).toHaveLength(4);
  expect(parsed.coach_example.source).toMatch(/hombre/);
});

it('omits coach_example when no corpus example matches (gender other)', async () => {
  openaiMod.__mockParse.mockResolvedValue(ok(validOutput));
  await generateSkeleton({
    profile: { ...profile, gender: 'other' as const },
    exercises,
  });
  const calls = openaiMod.__mockParse.mock.calls as unknown as Array<
    Array<{ messages: Array<{ role: string; content: string }> }>
  >;
  const userMsg = calls[0]![0]!.messages.find((m) => m.role === 'user')!.content;
  expect(userMsg).not.toContain('"coach_example"');
});

describe('buildSplitGuidance', () => {
  const base = { ...profile };
  it('women ≤3 days → full-body, lower bias', () => {
    const g = buildSplitGuidance({ ...base, gender: 'female', days_per_week: 3, leg_days: null });
    expect(g.strategy).toBe('full_body');
    expect(g.bias).toBe('lower');
  });
  it('women 5 days → split with 3 leg days', () => {
    const g = buildSplitGuidance({ ...base, gender: 'female', days_per_week: 5, leg_days: null });
    expect(g.strategy).toBe('split');
    expect(g.leg_days).toBe(3);
  });
  it('men 3 days 1 leg → full_body strategy, upper bias, PPL text', () => {
    const g = buildSplitGuidance({ ...base, gender: 'male', days_per_week: 3, leg_days: 1 });
    expect(g.bias).toBe('upper');
    expect(g.leg_days).toBe(1);
    expect(g.text).toMatch(/PPL/);
  });
  it('men default leg_days to 1 when null', () => {
    const g = buildSplitGuidance({ ...base, gender: 'male', days_per_week: 4, leg_days: null });
    expect(g.leg_days).toBe(1);
    expect(g.strategy).toBe('split');
  });
});
