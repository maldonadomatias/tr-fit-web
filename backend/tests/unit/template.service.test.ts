import {
  ROUTINE_TEMPLATES,
  selectTemplate,
  buildSkeletonFromTemplate,
} from '../../src/services/template.service.js';
import type { Weekday } from '../../src/domain/types.js';

const pick = (
  gender: 'male' | 'female' | 'other',
  days: number,
  leg_days: number | null = null,
  days_specific: Weekday[] | null = null,
) => selectTemplate({ gender, days_per_week: days, leg_days, days_specific });

describe('selectTemplate', () => {
  it('male: every days × leg_days combo resolves to its own Excel', () => {
    for (const days of [3, 4, 5]) {
      for (const legs of [1, 2]) {
        const { template, exactMatch } = pick('male', days, legs);
        expect(exactMatch).toBe(true);
        expect(template.gender).toBe('male');
        expect(template.days).toBe(days);
        expect(template.leg_days).toBe(legs);
      }
    }
  });

  it('male leg_days null defaults to the 1-leg template', () => {
    expect(pick('male', 4, null).template.leg_days).toBe(1);
  });

  it('female 3 days with lun-mie-vie schedule picks the matching file variant', () => {
    const { template } = pick('female', 3, null, ['lun', 'mie', 'vie']);
    expect(template.source).toContain('LUN-MIER-VIER');
  });

  it('female 3 days with lun-mar-mie schedule picks the other variant', () => {
    const { template } = pick('female', 3, null, ['lun', 'mar', 'mie']);
    expect(template.source).toContain('LUN-MAR-MIE');
  });

  it('female without days_specific still resolves deterministically', () => {
    const a = pick('female', 4).template.source;
    const b = pick('female', 4).template.source;
    expect(a).toBe(b);
  });

  it('clamps days outside 3-5 and reports non-exact match', () => {
    const low = pick('female', 2);
    expect(low.template.days).toBe(3);
    expect(low.exactMatch).toBe(false);
    const high = pick('male', 6, 1);
    expect(high.template.days).toBe(5);
    expect(high.exactMatch).toBe(false);
  });

  it('gender other falls back to the female template of the same days', () => {
    const { template, exactMatch } = pick('other', 4);
    expect(template.gender).toBe('female');
    expect(exactMatch).toBe(false);
  });
});

describe('buildSkeletonFromTemplate', () => {
  it('maps every template day to consecutive slots with the output contract', () => {
    for (const t of ROUTINE_TEMPLATES) {
      const sk = buildSkeletonFromTemplate(t);
      expect(sk.days).toHaveLength(t.days);
      expect(sk.rationale).toContain(t.source);
      sk.days.forEach((day, di) => {
        expect(day.day_index).toBe(di + 1);
        expect(day.focus).toBe(t.days_detail[di].focus);
        day.slots.forEach((s, si) => {
          expect(s.slot_index).toBe(si + 1);
          const orig = t.days_detail[di].slots[si];
          expect(s.exercise_id).toBe(orig.exercise_id);
          expect(s.role).toBe(orig.role);
          if (s.role === 'accesorio') {
            // faithful Excel prescription
            expect(s.series).toBe(orig.series);
            expect(s.reps).toBe(orig.reps);
            expect(s.descanso).toBe(orig.descanso);
          } else {
            // warmups/principals: periodization & engine defaults own these
            expect(s.series).toBeNull();
            expect(s.reps).toBeNull();
            expect(s.descanso).toBeNull();
          }
        });
      });
    }
  });
});

describe('ROUTINE_TEMPLATES integrity', () => {
  it('covers the full coach matrix (12 files)', () => {
    expect(ROUTINE_TEMPLATES).toHaveLength(12);
    const key = (t: { gender: string; days: number; leg_days: number | null }) =>
      `${t.gender}-${t.days}-${t.leg_days}`;
    const keys = ROUTINE_TEMPLATES.map(key);
    for (const k of [
      'male-3-1', 'male-3-2', 'male-4-1', 'male-4-2', 'male-5-1', 'male-5-2',
      'female-3-null', 'female-4-null', 'female-5-null',
    ]) {
      expect(keys).toContain(k);
    }
  });

  it('every day starts with a warmup and has sane slots', () => {
    for (const t of ROUTINE_TEMPLATES) {
      expect(t.days_detail).toHaveLength(t.days);
      for (const d of t.days_detail) {
        expect(d.slots.length).toBeGreaterThanOrEqual(5);
        expect(d.slots[0].role).toBe('calentamiento');
        for (const s of d.slots) {
          expect(['calentamiento', 'principal', 'accesorio']).toContain(s.role);
          expect(s.exercise_id).toBeGreaterThan(0);
          expect(typeof s.exercise_name).toBe('string');
        }
      }
    }
  });
});
