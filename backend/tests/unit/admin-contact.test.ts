import { buildListUsersSql } from '../../src/services/admin.service.js';

it('selects signup contact before the athlete completes onboarding', () => {
  const sql = buildListUsersSql(`WHERE u.status = $1`);
  expect(sql).toContain("CONCAT_WS(' ', u.first_name, u.last_name)");
  expect(sql).toContain('COALESCE(ap.phone, u.phone) AS phone');
});
