import {
  CORPUS_EXAMPLES,
  pickCorpusExample,
} from '../../src/services/corpus-examples.js';

const pick = (
  gender: 'male' | 'female' | 'other',
  days: number,
  leg_days: number | null = null,
) => pickCorpusExample({ gender, days_per_week: days, leg_days });

describe('pickCorpusExample — selection', () => {
  it('returns null for gender "other"', () => {
    expect(pick('other', 4)).toBeNull();
  });

  it('female 3 days → mujer 3-day example', () => {
    const e = pick('female', 3)!;
    expect(e.gender).toBe('female');
    expect(e.days).toBe(3);
  });

  it('female 2 days → nearest (3-day) example', () => {
    expect(pick('female', 2)!.days).toBe(3);
  });

  it('female 4 days → 4-day example', () => {
    expect(pick('female', 4)!.days).toBe(4);
  });

  it('female 5 days → 5-day example', () => {
    expect(pick('female', 5)!.days).toBe(5);
  });

  it('female 6 days → nearest (5-day) example', () => {
    expect(pick('female', 6)!.days).toBe(5);
  });

  it('male: every (days × leg_days) combo has its own example', () => {
    for (const days of [3, 4, 5]) {
      for (const legs of [1, 2]) {
        const e = pick('male', days, legs)!;
        expect(e).not.toBeNull();
        expect(e.gender).toBe('male');
        expect(e.days).toBe(days);
        expect(e.leg_days).toBe(legs);
      }
    }
  });

  it('male leg_days null defaults to 1-leg example', () => {
    expect(pick('male', 4, null)!.leg_days).toBe(1);
  });

  it('male leg_days ≥2 clamps to 2-leg example', () => {
    expect(pick('male', 4, 3)!.leg_days).toBe(2);
  });

  it('women examples never carry leg_days', () => {
    expect(pick('female', 4)!.leg_days).toBeNull();
  });
});

// The injected example must never teach the model something the server-side
// validators in openai.service reject — otherwise imitation guarantees retries.
describe('CORPUS_EXAMPLES — data integrity vs generator constraints', () => {
  const VALID_ROLES = new Set(['calentamiento', 'principal', 'accesorio']);
  const VALID_GROUPS = new Set([
    'Calentamiento', 'Cardio', 'Espalda', 'Hombros', 'Biceps', 'Triceps',
    'Abdomen', 'Antebrazos',
    'Pecho - Mayor', 'Pecho - Superior', 'Pecho - Inferior',
    'Piernas - Cuadriceps', 'Piernas - Gluteos', 'Piernas - Femorales',
    'Piernas - Pantorrillas', 'Piernas - Aductores', 'Piernas - Abductores',
  ]);
  const broad = (mg: string) => mg.split('-')[0].trim().toLowerCase();

  it('has 3 women + 6 men examples (one per corpus profile combo)', () => {
    expect(CORPUS_EXAMPLES.filter((e) => e.gender === 'female')).toHaveLength(3);
    expect(CORPUS_EXAMPLES.filter((e) => e.gender === 'male')).toHaveLength(6);
  });

  it.each(CORPUS_EXAMPLES.map((e) => [e.source, e] as const))(
    '%s satisfies every generator validator',
    (_src, e) => {
      expect(e.days_detail).toHaveLength(e.days);

      for (const day of e.days_detail) {
        // slot count within the 60-min range enforced by slotRangeFor(60)
        expect(day.slots.length).toBeGreaterThanOrEqual(8);
        expect(day.slots.length).toBeLessThanOrEqual(10);

        // opens with a warmup
        expect(day.slots[0].role).toBe('calentamiento');

        const principals = day.slots.filter((s) => s.role === 'principal');
        expect(principals.length).toBeGreaterThanOrEqual(1);
        expect(principals.length).toBeLessThanOrEqual(3);

        // principals must span distinct base groups
        const bases = principals.map((s) => broad(s.muscle_group));
        expect(new Set(bases).size).toBe(bases.length);

        let daySeries = 0;
        const byMuscle = new Map<string, number>();
        for (const s of day.slots) {
          expect(VALID_ROLES.has(s.role)).toBe(true);
          expect(VALID_GROUPS.has(s.muscle_group)).toBe(true);

          if (s.role === 'accesorio') {
            // accessories always carry a full prescription
            expect(s.series).toBeGreaterThanOrEqual(1);
            expect(typeof s.reps).toBe('string');
            expect(typeof s.descanso).toBe('string');
          } else {
            // principals/warmups leave prescription to periodization/defaults
            expect(s.series).toBeNull();
            expect(s.reps).toBeNull();
            expect(s.descanso).toBeNull();
          }

          if (s.role === 'calentamiento') continue;
          const series = s.role === 'principal' ? 3 : s.series!;
          daySeries += series;
          const g = broad(s.muscle_group);
          byMuscle.set(g, (byMuscle.get(g) ?? 0) + series);
        }

        // volume caps (ley de entrenamiento)
        expect(daySeries).toBeLessThanOrEqual(20);
        for (const [, n] of byMuscle) {
          expect(n).toBeLessThanOrEqual(10);
        }
      }
    },
  );

  it('women examples use Hip Thrust bias, men never use Gluteos as principal', () => {
    for (const e of CORPUS_EXAMPLES) {
      const principalGroups = e.days_detail.flatMap((d) =>
        d.slots.filter((s) => s.role === 'principal').map((s) => s.muscle_group),
      );
      if (e.gender === 'male') {
        expect(principalGroups).not.toContain('Piernas - Gluteos');
      } else {
        expect(principalGroups).toContain('Piernas - Gluteos');
      }
    }
  });
});
