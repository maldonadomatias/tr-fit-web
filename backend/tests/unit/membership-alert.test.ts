import { jest } from '@jest/globals';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockQuery = jest.fn<() => Promise<any>>();

jest.unstable_mockModule('../../src/db/connect.js', () => ({
  default: { query: mockQuery },
}));

const { membershipAlertSeverity, createMembershipAlert } = await import(
  '../../src/services/membership-alert.service.js'
);

describe('membershipAlertSeverity', () => {
  it('overdue is red', () => {
    expect(membershipAlertSeverity('membership_overdue')).toBe('red');
  });
  it('expiring is yellow', () => {
    expect(membershipAlertSeverity('membership_expiring')).toBe('yellow');
  });
});

describe('createMembershipAlert', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('issues the INSERT when athlete has a coach', async () => {
    // First call: SELECT coach_id → returns a coach
    mockQuery.mockResolvedValueOnce({ rows: [{ coach_id: 'c1' }] });
    // Second call: INSERT ... SELECT ... WHERE NOT EXISTS
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await createMembershipAlert('a1', 'membership_expiring', '2026-12-31');

    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('does NOT issue the INSERT when athlete has no coach', async () => {
    // First call: SELECT coach_id → no coach assigned
    mockQuery.mockResolvedValueOnce({ rows: [{ coach_id: null }] });

    await createMembershipAlert('a2', 'membership_overdue', '2026-12-31');

    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('does NOT issue the INSERT when athlete row is missing', async () => {
    // First call: SELECT coach_id → empty result set
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await createMembershipAlert('a3', 'membership_overdue', new Date('2026-12-31'));

    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});
