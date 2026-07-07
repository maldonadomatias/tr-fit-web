import { describe, it, expect } from 'vitest';
import { expiryInfo, isPaidThisMonth, monthLabel } from './subscription';

// Fixed reference "now": 2026-07-06 12:00 local.
const NOW = new Date(2026, 6, 6, 12, 0, 0).getTime();

describe('expiryInfo', () => {
  it('treats null paid_until (infinity / none) as sin vencimiento, sorts last', () => {
    const r = expiryInfo(null, NOW);
    expect(r.urgency).toBe('infinity');
    expect(r.daysLeft).toBeNull();
    expect(r.sortKey).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('flags VENCE HOY when due later today', () => {
    const due = new Date(2026, 6, 6, 23, 0, 0).toISOString();
    const r = expiryInfo(due, NOW);
    expect(r.urgency).toBe('today');
    expect(r.daysLeft).toBe(0);
  });

  it('flags VENCE MAÑANA', () => {
    const due = new Date(2026, 6, 7, 9, 0, 0).toISOString();
    expect(expiryInfo(due, NOW).urgency).toBe('tomorrow');
    expect(expiryInfo(due, NOW).daysLeft).toBe(1);
  });

  it('flags expired for past due dates and floats them to the top', () => {
    const due = new Date(2026, 6, 4).toISOString();
    const r = expiryInfo(due, NOW);
    expect(r.urgency).toBe('expired');
    expect(r.daysLeft).toBe(-2);
    expect(r.sortKey).toBeLessThan(0);
  });

  it('sorts most-urgent first (expired < today < tomorrow < later)', () => {
    const keys = [
      expiryInfo(new Date(2026, 6, 20).toISOString(), NOW).sortKey, // later
      expiryInfo(new Date(2026, 6, 6).toISOString(), NOW).sortKey, // today
      expiryInfo(new Date(2026, 6, 1).toISOString(), NOW).sortKey, // expired
      expiryInfo(new Date(2026, 6, 7).toISOString(), NOW).sortKey, // tomorrow
    ];
    const sorted = [...keys].sort((a, b) => a - b);
    // expired(-5) < today(0) < tomorrow(1) < later(14)
    expect(sorted).toEqual([-5, 0, 1, 14]);
  });

  it('classifies within-a-week as soon, beyond as later', () => {
    expect(expiryInfo(new Date(2026, 6, 12).toISOString(), NOW).urgency).toBe(
      'soon',
    );
    expect(expiryInfo(new Date(2026, 6, 30).toISOString(), NOW).urgency).toBe(
      'later',
    );
  });
});

describe('isPaidThisMonth', () => {
  it('null (infinity) counts as paid', () => {
    expect(isPaidThisMonth(null, NOW)).toBe(true);
  });

  it('is NOT paid when coverage ends mid-current-month', () => {
    // due 2026-07-20: expires this month → still owes July renewal.
    expect(isPaidThisMonth(new Date(2026, 6, 20).toISOString(), NOW)).toBe(
      false,
    );
  });

  it('is paid when coverage reaches into next month', () => {
    // due 2026-08-06: renewed through July → paid this month.
    expect(isPaidThisMonth(new Date(2026, 7, 6).toISOString(), NOW)).toBe(true);
  });

  it('renewing +30 days from a today-expiry flips paid status to true', () => {
    // Coach's flow: VENCE HOY (2026-07-06) → renew +30 → 2026-08-05.
    const before = new Date(2026, 6, 6).toISOString();
    const after = new Date(2026, 6, 6 + 30).toISOString(); // 2026-08-05
    expect(isPaidThisMonth(before, NOW)).toBe(false);
    expect(isPaidThisMonth(after, NOW)).toBe(true);
  });
});

describe('monthLabel', () => {
  it('returns the current month in caps (es-AR)', () => {
    expect(monthLabel(NOW)).toBe('JULIO');
  });
});
