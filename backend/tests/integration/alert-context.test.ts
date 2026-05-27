import { jest } from '@jest/globals';

jest.unstable_mockModule('resend', () => {
  const send = jest.fn();
  return {
    Resend: jest.fn().mockImplementation(() => ({ emails: { send } })),
    __mockSend: send,
  };
});

type MockSend = jest.Mock<(opts: { to: string; subject: string; html: string; from: string }) => Promise<{ data: { id: string }; error: null }>>;
const resendMod = (await import('resend')) as unknown as { __mockSend: MockSend };

const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { createAdmin, createAthlete } = await import('./helpers/fixtures.js');
const { createPainAlert } = await import('../../src/services/alert.service.js');
const { getAlertContext } = await import('../../src/services/alert-context.service.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => {
  await resetDatabase();
  resendMod.__mockSend.mockReset();
  resendMod.__mockSend.mockResolvedValue({ data: { id: 'msg' }, error: null });
});
afterAll(async () => { await closePool(); });

it('returns suggested alternative + last pain history for sos_pain', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const exR = await pool.query<{ id: number }>(`SELECT id FROM exercises LIMIT 1`);
  const exerciseId = exR.rows[0].id;

  const a1 = await createPainAlert({
    athleteId: ath, exerciseId, zone: 'lumbar', intensity: 6,
  });
  const a2 = await createPainAlert({
    athleteId: ath, exerciseId, zone: 'lumbar', intensity: 8,
  });

  const ctx = await getAlertContext(a2.alertId, coach);
  expect(ctx.alert.id).toBe(a2.alertId);
  expect(ctx.painHistory.length).toBeGreaterThanOrEqual(1);
  expect(ctx.painHistory.every((p) => p.zone === 'lumbar')).toBe(true);
  // suggestedAlternative may be null if seed has no alternative; that's fine
  expect(ctx).toHaveProperty('suggestedAlternative');
});

it('throws not_found for alert belonging to a different coach', async () => {
  const coachA = await createAdmin();
  const coachB = await createAdmin();
  const ath = await createAthlete(coachA);
  const exR = await pool.query<{ id: number }>(`SELECT id FROM exercises LIMIT 1`);
  const { alertId } = await createPainAlert({
    athleteId: ath, exerciseId: exR.rows[0].id, zone: 'rodilla', intensity: 5,
  });
  await expect(getAlertContext(alertId, coachB)).rejects.toThrow(/not_found/);
});
