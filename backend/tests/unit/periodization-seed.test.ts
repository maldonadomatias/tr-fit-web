import { principal } from '../../src/seeds/port-periodization.js';

describe('periodization config — updated script', () => {
  it('weeks 1–8: coach table, fixed reps at a % of RM30 (ticket #57)', () => {
    const table = [1, 2, 3, 4, 5, 6, 7, 8].map((w) => [principal[w].reps, principal[w].pct]);
    expect(table).toEqual([
      ['10', 0.65], ['10', 0.70], ['8', 0.75], ['8', 0.775],
      ['6', 0.80], ['6', 0.825], ['5', 0.85], ['3', 0.875],
    ]);
    for (let w = 1; w <= 8; w++) {
      expect(principal[w]).toMatchObject({ series: 3, rmSource: 30 });
      expect(principal[w].useCasilleros ?? false).toBe(false);
    }
  });
  it('week 9: 2×5 @ 60% of RM30, deload preserved', () => {
    expect(principal[9]).toMatchObject({ series: 2, reps: '5', pct: 0.60, rmSource: 30, isDeload: true });
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
