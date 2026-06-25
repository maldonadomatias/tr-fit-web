// backend/tests/unit/platform-fee.math.test.ts
import {
  computeFee, computeAdjustedBase, addMonthsISO, isAdjustmentDue,
} from '../../src/services/platform-fee.math.js';

describe('computeFee', () => {
  it('computes 4% share and total from gross', () => {
    const r = computeFee({
      baseFeeArs: 105000, activeAthletes: 20,
      grossRevenueArs: 500000, revenueSharePct: 4,
    });
    expect(r.revenueShareArs).toBe(20000);
    expect(r.totalArs).toBe(125000);
  });

  it('handles zero gross (base fee only)', () => {
    const r = computeFee({
      baseFeeArs: 105000, activeAthletes: 0,
      grossRevenueArs: 0, revenueSharePct: 4,
    });
    expect(r.revenueShareArs).toBe(0);
    expect(r.totalArs).toBe(105000);
  });

  it('testflight: halves base and drops the 4% share', () => {
    const r = computeFee({
      baseFeeArs: 105000, activeAthletes: 20,
      grossRevenueArs: 500000, revenueSharePct: 4, testflight: true,
    });
    expect(r.baseFeeArs).toBe(52500);
    expect(r.revenueShareArs).toBe(0);
    expect(r.totalArs).toBe(52500);
    expect(r.grossRevenueArs).toBe(500000);
  });
});

describe('computeAdjustedBase', () => {
  it('scales base by usd ratio, rounded to 2 decimals', () => {
    expect(computeAdjustedBase(105000, 1500, 1420)).toBe(110915.49);
  });
  it('throws when reference usd is not positive', () => {
    expect(() => computeAdjustedBase(105000, 1500, 0)).toThrow();
  });
});

describe('addMonthsISO', () => {
  it('adds months and rolls the year', () => {
    expect(addMonthsISO('2026-10-01', 3)).toBe('2027-01-01');
  });
});

describe('isAdjustmentDue', () => {
  it('true when next date is today or past', () => {
    expect(isAdjustmentDue('2026-10-01', '2026-10-01')).toBe(true);
    expect(isAdjustmentDue('2026-10-01', '2026-12-01')).toBe(true);
  });
  it('false when next date is in the future', () => {
    expect(isAdjustmentDue('2026-10-01', '2026-06-24')).toBe(false);
  });
});
