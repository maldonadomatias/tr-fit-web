import { buildListUsersSql } from '../../src/services/admin.service.js';

it('selects the onboarding phone so a coach can contact a pending athlete', () => {
  expect(buildListUsersSql(`WHERE u.status = $1`)).toContain('ap.phone');
});
