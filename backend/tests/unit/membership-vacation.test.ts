import { MembershipError, paidUntilOnCalendarDate } from '../../src/services/membership.service.js';

describe('paidUntilOnCalendarDate', () => {
  it('stores noon Argentina so the calendar day matches what the coach picked', () => {
    const d = paidUntilOnCalendarDate('2026-11-15');
    expect(d.toISOString()).toBe('2026-11-15T15:00:00.000Z');
    expect(
      d.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }),
    ).toBe('2026-11-15');
  });

  it('rejects a date that does not exist', () => {
    expect(() => paidUntilOnCalendarDate('2026-02-31')).toThrow(MembershipError);
  });
});
