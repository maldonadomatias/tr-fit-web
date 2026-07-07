import { addCalendarMonth } from '../../src/services/membership.service.js';

// Renewals advance by one CALENDAR MONTH (same day next month, clamped),
// not +30 days. +30 days would drift a day earlier every cycle.
describe('addCalendarMonth', () => {
  it("coach's case: 2026-06-06 → 2026-07-06 (one calendar month, no drift)", () => {
    // "6/07 → 6/08" in the coach's dd/mm shorthand: same day-of-month next month.
    const base = new Date(2026, 6, 6); // 2026-07-06 (July 6)
    const next = addCalendarMonth(base);
    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(7); // August (0-indexed)
    expect(next.getDate()).toBe(6);
  });

  it('does NOT lose a day the way +30d would (6 Jul → 6 Aug, not 5 Aug)', () => {
    const base = new Date(2026, 6, 6); // 2026-07-06
    const plus30 = new Date(base.getTime() + 30 * 86_400_000); // 2026-08-05
    expect(plus30.getDate()).toBe(5); // +30d drifts to the 5th
    expect(addCalendarMonth(base).getDate()).toBe(6); // calendar month keeps the 6th
  });

  it('clamps Jan 31 → Feb 28 in a non-leap year', () => {
    const next = addCalendarMonth(new Date(2026, 0, 31)); // Jan 31 2026
    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(1); // February
    expect(next.getDate()).toBe(28);
  });

  it('clamps Jan 31 → Feb 29 in a leap year', () => {
    const next = addCalendarMonth(new Date(2028, 0, 31)); // Jan 31 2028 (leap)
    expect(next.getMonth()).toBe(1); // February
    expect(next.getDate()).toBe(29);
  });

  it('clamps Aug 31 → Sep 30 (30-day month)', () => {
    const next = addCalendarMonth(new Date(2026, 7, 31)); // Aug 31
    expect(next.getMonth()).toBe(8); // September
    expect(next.getDate()).toBe(30);
  });

  it('preserves the day-of-month for a normal 31→31 month', () => {
    const next = addCalendarMonth(new Date(2026, 6, 31)); // Jul 31
    expect(next.getMonth()).toBe(7); // August (also 31 days)
    expect(next.getDate()).toBe(31);
  });

  it('rolls the year over Dec → Jan', () => {
    const next = addCalendarMonth(new Date(2026, 11, 15)); // Dec 15 2026
    expect(next.getFullYear()).toBe(2027);
    expect(next.getMonth()).toBe(0); // January
    expect(next.getDate()).toBe(15);
  });

  it('preserves the time-of-day component', () => {
    const base = new Date(2026, 6, 6, 9, 30, 15, 500);
    const next = addCalendarMonth(base);
    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(30);
    expect(next.getSeconds()).toBe(15);
    expect(next.getMilliseconds()).toBe(500);
  });

  it('supports advancing multiple months with clamping', () => {
    // Dec 31 + 2 months → Feb 28 (2027 non-leap).
    const next = addCalendarMonth(new Date(2026, 11, 31), 2);
    expect(next.getFullYear()).toBe(2027);
    expect(next.getMonth()).toBe(1); // February
    expect(next.getDate()).toBe(28);
  });
});
