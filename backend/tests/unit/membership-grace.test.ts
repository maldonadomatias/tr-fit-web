import { isActiveWithGrace, GRACE_HOURS } from '../../src/services/membership.service.js';

describe('isActiveWithGrace', () => {
  const NOW = new Date('2026-06-10T12:00:00Z').getTime();
  it('null paid_until = no access', () => {
    expect(isActiveWithGrace(null, NOW)).toBe(false);
  });
  it('infinity = always active', () => {
    expect(isActiveWithGrace('infinity', NOW)).toBe(true);
  });
  it('paid_until in the future = active', () => {
    expect(isActiveWithGrace('2026-06-15T00:00:00Z', NOW)).toBe(true);
  });
  it('expired 24h ago = still active (within 48h grace)', () => {
    expect(isActiveWithGrace('2026-06-09T12:00:00Z', NOW)).toBe(true);
  });
  it('expired 49h ago = blocked', () => {
    const past = new Date(NOW - (GRACE_HOURS + 1) * 3_600_000).toISOString();
    expect(isActiveWithGrace(past, NOW)).toBe(false);
  });
});
