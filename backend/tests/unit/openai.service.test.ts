import { jest } from '@jest/globals';

// Mock the OpenAI SDK before importing the service
jest.unstable_mockModule('openai', () => {
  const create = jest.fn();
  return {
    default: jest.fn().mockImplementation(() => ({
      chat: { completions: { create } },
    })),
    __mockCreate: create,
  };
});

type MockCreate = jest.Mock<
  () => Promise<{ choices: Array<{ message: { content: string } }> }>
>;

const openaiMod = (await import('openai')) as unknown as { __mockCreate: MockCreate };
const { generateSkeleton } = await import('../../src/services/openai.service.js');

const profile = {
  user_id: 'u1', name: 'Test', gender: 'male' as const, age: 30,
  height_cm: 175, weight_kg: 75, level: 'medio' as const,
  goal: 'hipertrofia' as const, days_per_week: 4,
  equipment: 'gym_completo' as const, injuries: [],
  coach_id: null, onboarded_at: '2026-05-08',
  phone: null, plan_interest: null, training_mode: null,
  commitment: null, exercise_minutes: null, days_specific: null,
  referral_source: null, sport_focus: null,
};

const exercises = [
  { id: 1, name: 'Press Plano con Barra', muscle_group: 'Pecho - Mayor',
    equipment: 'barra' as const, movement_pattern: 'push_h' as const,
    is_principal: true, is_unilateral: false, level_min: 'principiante' as const,
    contraindicated_for: [], default_increment_kg: 2.5, alternatives_ids: [],
    video_url: null, illustration_url: null },
  { id: 2, name: 'Curl Biceps con Mancuerna', muscle_group: 'Biceps',
    equipment: 'mancuerna' as const, movement_pattern: 'isolation' as const,
    is_principal: false, is_unilateral: false, level_min: 'principiante' as const,
    contraindicated_for: [], default_increment_kg: 1, alternatives_ids: [],
    video_url: null, illustration_url: null },
];

const validOutput = {
  rationale: 'split adecuado',
  days: [
    { day_index: 1, focus: 'Pecho', slots: [
      { slot_index: 1, exercise_id: 1, role: 'principal' },
      { slot_index: 2, exercise_id: 2, role: 'accesorio' },
    ] },
    { day_index: 2, focus: 'Brazos', slots: [
      { slot_index: 1, exercise_id: 1, role: 'principal' },
      { slot_index: 2, exercise_id: 2, role: 'accesorio' },
    ] },
    { day_index: 3, focus: 'Pecho', slots: [
      { slot_index: 1, exercise_id: 1, role: 'principal' },
    ] },
    { day_index: 4, focus: 'Brazos', slots: [
      { slot_index: 1, exercise_id: 1, role: 'principal' },
    ] },
  ],
};

beforeEach(() => openaiMod.__mockCreate.mockReset());

it('returns parsed skeleton on first valid response', async () => {
  openaiMod.__mockCreate.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify(validOutput) } }],
  });
  const out = await generateSkeleton({ profile, exercises });
  expect(out.days).toHaveLength(4);
  expect(out.rationale).toBe('split adecuado');
  expect(openaiMod.__mockCreate).toHaveBeenCalledTimes(1);
});

it('retries up to 2 times on schema violation', async () => {
  openaiMod.__mockCreate
    .mockResolvedValueOnce({ choices: [{ message: { content: '{"oops": true}' } }] })
    .mockResolvedValueOnce({ choices: [{ message: { content: '{"days": []}' } }] })
    .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(validOutput) } }] });
  const out = await generateSkeleton({ profile, exercises });
  expect(out.days).toHaveLength(4);
  expect(openaiMod.__mockCreate).toHaveBeenCalledTimes(3);
});

it('throws after 3 failed attempts', async () => {
  openaiMod.__mockCreate.mockResolvedValue({
    choices: [{ message: { content: '{"bad": "output"}' } }],
  });
  await expect(generateSkeleton({ profile, exercises })).rejects.toThrow(/skeleton.*invalid/i);
  expect(openaiMod.__mockCreate).toHaveBeenCalledTimes(3);
});

it('rejects when output uses unknown exercise_id', async () => {
  openaiMod.__mockCreate.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({
      rationale: 'r',
      days: Array.from({ length: 4 }, (_, i) => ({
        day_index: i + 1, focus: 'x',
        slots: [{ slot_index: 1, exercise_id: 999, role: 'principal' }],
      })),
    }) } }],
  });
  await expect(generateSkeleton({ profile, exercises })).rejects.toThrow();
});

it('rejects when day count !== days_per_week', async () => {
  openaiMod.__mockCreate.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({
      rationale: 'r',
      days: [
        { day_index: 1, focus: 'x',
          slots: [{ slot_index: 1, exercise_id: 1, role: 'principal' }] },
      ],
    }) } }],
  });
  await expect(generateSkeleton({ profile, exercises })).rejects.toThrow();
});

it('includes commitment + training_mode + exercise_minutes in user prompt', async () => {
  openaiMod.__mockCreate.mockResolvedValueOnce({
    choices: [{ message: { content: JSON.stringify({
      rationale: 'r',
      days: [{ day_index: 1, focus: 'f',
        slots: [{ slot_index: 1, exercise_id: 1, role: 'principal' }] }],
    }) } }],
  });

  const enrichedProfile = {
    user_id: 'u', name: 'A', gender: 'male', age: 30, height_cm: 175,
    weight_kg: 75, level: 'medio', goal: 'hipertrofia', days_per_week: 1,
    equipment: 'gym_completo', injuries: [], coach_id: null,
    onboarded_at: '2026-05-11T00:00:00Z',
    phone: '+5491111111111', plan_interest: 'full',
    training_mode: 'casa', commitment: 'exigente',
    exercise_minutes: 45, days_specific: ['lun'],
    referral_source: 'google', sport_focus: null,
  } as never;

  const minimalExercises = [{ id: 1, name: 'X', muscle_group: 'g', equipment: 'barra',
                       movement_pattern: 'squat', is_principal: true,
                       is_unilateral: false, level_min: 'principiante',
                       contraindicated_for: [], default_increment_kg: 2.5,
                       alternatives_ids: [], video_url: null,
                       illustration_url: null }] as never;

  await generateSkeleton({ profile: enrichedProfile, exercises: minimalExercises });

  const calls = openaiMod.__mockCreate.mock.calls as unknown as Array<
    Array<{ messages: Array<{ role: string; content: string }> }>
  >;
  const userMsg = calls[0]![0]!.messages.find((m) => m.role === 'user')!.content;
  expect(userMsg).toContain('"training_mode":"casa"');
  expect(userMsg).toContain('"commitment":"exigente"');
  expect(userMsg).toContain('"exercise_minutes":45');
});
