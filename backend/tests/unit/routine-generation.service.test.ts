import { jest } from '@jest/globals';
import type { AiSkeletonOutput } from '../../src/domain/schemas.js';

// Mock the OpenAI adjuster before importing the orchestrator.
const adjustSkeleton = jest.fn<
  (input: { reasons: string[] }) => Promise<AiSkeletonOutput>
>();
jest.unstable_mockModule('../../src/services/openai.service.js', () => ({
  adjustSkeleton,
}));

const { generateRoutine } = await import(
  '../../src/services/routine-generation.service.js'
);
const { ROUTINE_TEMPLATES, buildSkeletonFromTemplate, selectTemplate } =
  await import('../../src/services/template.service.js');

const FEMALE_3D = selectTemplate({
  gender: 'female', days_per_week: 3, leg_days: null, days_specific: null,
}).template;

// Athlete-filtered catalog containing exactly the template's exercises.
const exercisesFor = (templateIds: number[]) =>
  templateIds.map((id) => ({
    id, name: `ex-${id}`, muscle_group: 'Espalda',
    equipment: 'maquina' as const, movement_pattern: 'pull_v' as const,
    is_principal: false, is_unilateral: false,
    level_min: 'principiante' as const, contraindicated_for: [],
    default_increment_kg: 1, alternatives_ids: [],
    video_url: null, illustration_url: null,
    modality: 'reps' as const, default_target: null, rep_cycle_threshold: 12,
  }));

const templateIds = (t: typeof FEMALE_3D) => [
  ...new Set(t.days_detail.flatMap((d) => d.slots.map((s) => s.exercise_id))),
];

const profile = {
  user_id: 'u1', name: 'Test', gender: 'female' as const, age: 30,
  height_cm: 165, weight_kg: 62, level: 'medio' as const,
  goal: 'hipertrofia' as const, days_per_week: 3, leg_days: null,
  equipment: 'gym_completo' as const, injuries: [],
  coach_id: null, onboarded_at: '2026-07-02',
  phone: null, plan_interest: null, training_mode: 'gym' as const,
  commitment: 'normal' as const, exercise_minutes: 60,
  days_specific: null, referral_source: null, sport_focus: null,
};

beforeEach(() => adjustSkeleton.mockReset());

it('clean profile → template skeleton verbatim, ZERO OpenAI calls', async () => {
  const r = await generateRoutine({
    profile,
    exercises: exercisesFor(templateIds(FEMALE_3D)),
  });
  expect(adjustSkeleton).not.toHaveBeenCalled();
  expect(r.source).toBe('template');
  expect(r.templateSource).toBe(FEMALE_3D.source);
  expect(r.reasons).toEqual([]);
  expect(r.skeleton).toEqual(buildSkeletonFromTemplate(FEMALE_3D));
});

it('75-min profile is still clean (templates are 1HS; extra is cardio)', async () => {
  const r = await generateRoutine({
    profile: { ...profile, exercise_minutes: 75 },
    exercises: exercisesFor(templateIds(FEMALE_3D)),
  });
  expect(adjustSkeleton).not.toHaveBeenCalled();
  expect(r.source).toBe('template');
});

it('missing template exercise (injury/equipment filter) triggers AI adjustment', async () => {
  const ids = templateIds(FEMALE_3D);
  const missing = ids[0];
  adjustSkeleton.mockResolvedValue(buildSkeletonFromTemplate(FEMALE_3D));
  const r = await generateRoutine({
    profile,
    exercises: exercisesFor(ids.slice(1)),
  });
  expect(adjustSkeleton).toHaveBeenCalledTimes(1);
  expect(r.source).toBe('template+ai');
  expect(r.reasons.join(' ')).toMatch(/no disponibles/i);
  const call = adjustSkeleton.mock.calls[0]![0]!;
  expect(call.reasons.join(' ')).toContain(
    FEMALE_3D.days_detail
      .flatMap((d) => d.slots)
      .find((s) => s.exercise_id === missing)!.exercise_name,
  );
});

it('exercise_minutes < 60 triggers AI adjustment with series budget reason', async () => {
  adjustSkeleton.mockResolvedValue(buildSkeletonFromTemplate(FEMALE_3D));
  const r = await generateRoutine({
    profile: { ...profile, exercise_minutes: 45 },
    exercises: exercisesFor(templateIds(FEMALE_3D)),
  });
  expect(adjustSkeleton).toHaveBeenCalledTimes(1);
  expect(r.reasons.join(' ')).toMatch(/45 min|series/);
});

it('days outside the template matrix triggers AI adjustment', async () => {
  adjustSkeleton.mockResolvedValue(buildSkeletonFromTemplate(FEMALE_3D));
  const r = await generateRoutine({
    profile: { ...profile, days_per_week: 2 },
    exercises: exercisesFor(templateIds(FEMALE_3D)),
  });
  expect(adjustSkeleton).toHaveBeenCalledTimes(1);
  expect(r.reasons.join(' ')).toMatch(/2 días/);
});

it('coach rejection feedback triggers AI adjustment carrying the feedback', async () => {
  adjustSkeleton.mockResolvedValue(buildSkeletonFromTemplate(FEMALE_3D));
  const r = await generateRoutine({
    profile,
    exercises: exercisesFor(templateIds(FEMALE_3D)),
    rejectionFeedback: 'muy pesada para la alumna',
  });
  expect(adjustSkeleton).toHaveBeenCalledTimes(1);
  expect(r.reasons.join(' ')).toContain('muy pesada para la alumna');
});

it('exposes every coach template', () => {
  expect(ROUTINE_TEMPLATES.length).toBe(12);
});
