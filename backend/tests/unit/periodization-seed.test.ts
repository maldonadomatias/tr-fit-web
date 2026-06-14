import { principal } from '../../src/seeds/port-periodization.js';

describe('periodization config — updated script', () => {
  it('week 9: 2×"2 a 3" @ 80% of RM30, deload preserved', () => {
    expect(principal[9]).toMatchObject({ series: 2, reps: '2 a 3', pct: 0.80, rmSource: 30, isDeload: true });
  });
  it('week 18: 2×"2 a 3" @ 80% of RM10, deload preserved', () => {
    expect(principal[18]).toMatchObject({ series: 2, reps: '2 a 3', pct: 0.80, rmSource: 10, isDeload: true });
  });
  it('week 20: AMRAP @ 85% of RM10, not an rm test', () => {
    expect(principal[20]).toMatchObject({ series: 1, reps: 'AMRAP', pct: 0.85, rmSource: 10, isAmrap: true });
    expect(principal[20].isRmTest ?? false).toBe(false);
  });
  it('week 27: 2×"2 a 3" @ 80% of RM20, deload preserved', () => {
    expect(principal[27]).toMatchObject({ series: 2, reps: '2 a 3', pct: 0.80, rmSource: 20, isDeload: true });
  });
  it('weeks 10 and 30 remain real RM tests', () => {
    expect(principal[10].isRmTest).toBe(true);
    expect(principal[30].isRmTest).toBe(true);
  });
});
