import { onboardingPayload, measurementPayload } from '../../src/domain/schemas.js';

const baseValid = {
  name: 'A', gender: 'male', age: 30, height_cm: 175, weight_kg: 75,
  level: 'medio', goal: 'hipertrofia', days_per_week: 4,
  equipment: 'gym_completo', injuries: [],
  phone: '+5491111111111', plan_interest: 'full',
  training_mode: 'gym', commitment: 'normal', exercise_minutes: 60,
  days_specific: ['lun', 'mar', 'jue', 'sab'],
  referral_source: 'google',
};

it('accepts valid full payload', () => {
  expect(onboardingPayload.safeParse(baseValid).success).toBe(true);
});

it('rejects invalid phone format', () => {
  const r = onboardingPayload.safeParse({ ...baseValid, phone: '11-1111-1111' });
  expect(r.success).toBe(false);
});

it('rejects days_specific length != days_per_week', () => {
  const r = onboardingPayload.safeParse({ ...baseValid, days_specific: ['lun', 'mar'] });
  expect(r.success).toBe(false);
});

it('accepts new level values', () => {
  expect(onboardingPayload.safeParse({ ...baseValid, level: 'nunca' }).success).toBe(true);
  expect(onboardingPayload.safeParse({ ...baseValid, level: 'muy_avanzado' }).success).toBe(true);
});

it('rejects legacy level value principiante', () => {
  expect(onboardingPayload.safeParse({ ...baseValid, level: 'principiante' }).success).toBe(false);
});

it('accepts goal=perdida_grasa', () => {
  expect(onboardingPayload.safeParse({ ...baseValid, goal: 'perdida_grasa' }).success).toBe(true);
});

it('accepts days_per_week=2', () => {
  expect(onboardingPayload.safeParse({
    ...baseValid, days_per_week: 2, days_specific: ['lun', 'jue'],
  }).success).toBe(true);
});

it('accepts optional sport_focus + measurements', () => {
  const r = onboardingPayload.safeParse({
    ...baseValid, sport_focus: 'futbol',
    measurements: { chest_cm: 100, waist_cm: 80 },
  });
  expect(r.success).toBe(true);
});

it('measurementPayload accepts partial values', () => {
  expect(measurementPayload.safeParse({ chest_cm: 100 }).success).toBe(true);
});
