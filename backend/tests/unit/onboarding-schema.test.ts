import {
  onboardingPayload,
  measurementPayload,
  ageFromBirthDate,
} from '../../src/domain/schemas.js';

const baseValid = {
  name: 'A', gender: 'male', age: 30, height_cm: 175, weight_kg: 75,
  level: 'medio', goal: 'hipertrofia', days_per_week: 4,
  equipment: 'gym_completo', injuries: [],
  phone: '+5491111111111', plan_interest: 'full',
  training_mode: 'gym', commitment: 'normal', exercise_minutes: 60,
  days_specific: ['lun', 'mar', 'jue', 'sab'],
  referral_source: 'google',
};

describe('onboardingPayload', () => {
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

  it('rejects days_specific with duplicates', () => {
    expect(onboardingPayload.safeParse({
      ...baseValid, days_per_week: 4, days_specific: ['lun', 'lun', 'mar', 'mar'],
    }).success).toBe(false);
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

  it('accepts the new exercise_minutes options (60/75/105/120)', () => {
    for (const m of [60, 75, 105, 120]) {
      expect(onboardingPayload.safeParse({ ...baseValid, exercise_minutes: m }).success).toBe(true);
    }
  });

  it('rejects retired exercise_minutes values (30/45/90)', () => {
    for (const m of [30, 45, 90]) {
      expect(onboardingPayload.safeParse({ ...baseValid, exercise_minutes: m }).success).toBe(false);
    }
  });

  it('accepts days_per_week=2', () => {
    expect(onboardingPayload.safeParse({
      ...baseValid, days_per_week: 2, days_specific: ['lun', 'jue'],
    }).success).toBe(true);
  });

  it('accepts leg_days 1 or 2, and omitted', () => {
    expect(onboardingPayload.safeParse({ ...baseValid, leg_days: 1 }).success).toBe(true);
    expect(onboardingPayload.safeParse({ ...baseValid, leg_days: 2 }).success).toBe(true);
    expect(onboardingPayload.safeParse(baseValid).success).toBe(true); // omitted ok
  });

  it('rejects leg_days other than 1 or 2', () => {
    expect(onboardingPayload.safeParse({ ...baseValid, leg_days: 3 }).success).toBe(false);
    expect(onboardingPayload.safeParse({ ...baseValid, leg_days: 0 }).success).toBe(false);
  });

  it('accepts optional sport_focus + measurements', () => {
    const r = onboardingPayload.safeParse({
      ...baseValid, sport_focus: 'futbol',
      measurements: { chest_cm: 100, waist_cm: 80 },
    });
    expect(r.success).toBe(true);
  });
});

describe('ageFromBirthDate', () => {
  // "today" fijo e inyectable para que el test no dependa del día que corre.
  const today = new Date(2026, 6, 4); // 4 de julio de 2026

  it('derives age when the birthday already passed this year', () => {
    expect(ageFromBirthDate('1992-05-14', today)).toBe(34);
  });

  it('derives age-1 when the birthday is still ahead', () => {
    expect(ageFromBirthDate('1992-12-25', today)).toBe(33);
  });

  it('counts the birthday itself as turned', () => {
    expect(ageFromBirthDate('1992-07-04', today)).toBe(34);
    expect(ageFromBirthDate('1992-07-05', today)).toBe(33);
  });

  it('returns null for malformed or impossible dates', () => {
    expect(ageFromBirthDate('14/05/1992', today)).toBeNull();
    expect(ageFromBirthDate('1992-13-01', today)).toBeNull();
    expect(ageFromBirthDate('1992-02-31', today)).toBeNull();
    expect(ageFromBirthDate('2001-02-29', today)).toBeNull(); // no bisiesto
  });
});

describe('onboardingPayload birth_date', () => {
  function birthDateYearsAgo(years: number): string {
    const t = new Date();
    const d = new Date(t.getFullYear() - years, t.getMonth(), t.getDate() - 40);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  it('is optional (old app builds omit it)', () => {
    expect(onboardingPayload.safeParse(baseValid).success).toBe(true);
  });

  it('accepts a birth_date consistent with age', () => {
    expect(onboardingPayload.safeParse({
      ...baseValid, age: 30, birth_date: birthDateYearsAgo(30),
    }).success).toBe(true);
  });

  it('tolerates ±1 year of drift between age and birth_date', () => {
    expect(onboardingPayload.safeParse({
      ...baseValid, age: 31, birth_date: birthDateYearsAgo(30),
    }).success).toBe(true);
    expect(onboardingPayload.safeParse({
      ...baseValid, age: 29, birth_date: birthDateYearsAgo(30),
    }).success).toBe(true);
  });

  it('rejects age inconsistent beyond ±1 year', () => {
    expect(onboardingPayload.safeParse({
      ...baseValid, age: 33, birth_date: birthDateYearsAgo(30),
    }).success).toBe(false);
  });

  it('rejects derived age outside 12-100', () => {
    expect(onboardingPayload.safeParse({
      ...baseValid, age: 12, birth_date: birthDateYearsAgo(10),
    }).success).toBe(false);
    expect(onboardingPayload.safeParse({
      ...baseValid, age: 100, birth_date: birthDateYearsAgo(105),
    }).success).toBe(false);
  });

  it('rejects malformed and impossible birth_date', () => {
    expect(onboardingPayload.safeParse({
      ...baseValid, birth_date: '14/05/1990',
    }).success).toBe(false);
    expect(onboardingPayload.safeParse({
      ...baseValid, birth_date: '1990-02-31',
    }).success).toBe(false);
  });
});

describe('measurementPayload', () => {
  it('accepts partial values', () => {
    expect(measurementPayload.safeParse({ chest_cm: 100 }).success).toBe(true);
  });
});
