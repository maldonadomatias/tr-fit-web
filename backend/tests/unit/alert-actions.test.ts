import { ALERT_ACTION_MATRIX } from '../../src/domain/alert-actions.js';

describe('ALERT_ACTION_MATRIX', () => {
  it('membership alerts allow acknowledge + note_only', () => {
    expect(ALERT_ACTION_MATRIX.membership_expiring).toEqual(['acknowledge', 'note_only']);
    expect(ALERT_ACTION_MATRIX.membership_overdue).toEqual(['acknowledge', 'note_only']);
  });
  it('every alert type has at least one action', () => {
    for (const actions of Object.values(ALERT_ACTION_MATRIX)) {
      expect(actions.length).toBeGreaterThan(0);
    }
  });
});
