import { membershipAlertSeverity } from '../../src/services/membership-alert.service.js';

describe('membershipAlertSeverity', () => {
  it('overdue is red', () => {
    expect(membershipAlertSeverity('membership_overdue')).toBe('red');
  });
  it('expiring is yellow', () => {
    expect(membershipAlertSeverity('membership_expiring')).toBe('yellow');
  });
});
