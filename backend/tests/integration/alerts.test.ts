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
const { createCoach, createAthlete } = await import('./helpers/fixtures.js');
const {
  createPainAlert, createMachineAlert,
  listAlertsForCoach, markRead, markResolved,
} = await import('../../src/services/alert.service.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => {
  await resetDatabase();
  resendMod.__mockSend.mockReset();
  resendMod.__mockSend.mockResolvedValue({ data: { id: 'msg' }, error: null });
});
afterAll(async () => { await closePool(); });

async function setup() {
  const coach = await createCoach();
  const ath = await createAthlete(coach);
  const ex = await pool.query<{ id: number }>(
    `SELECT id FROM exercises LIMIT 1`,
  );
  return { coach, ath, exerciseId: ex.rows[0].id };
}

it('createPainAlert inserts row + sends email', async () => {
  const { coach, ath, exerciseId } = await setup();
  const out = await createPainAlert({
    athleteId: ath, exerciseId, zone: 'lumbar', intensity: 7,
  });
  expect(out.emailSendFailed).toBe(false);
  expect(resendMod.__mockSend).toHaveBeenCalledTimes(1);
  const alerts = await listAlertsForCoach(coach, true);
  expect(alerts).toHaveLength(1);
});

it('createMachineAlert info-severity, no email', async () => {
  const { coach, ath, exerciseId } = await setup();
  const ex2 = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE id != $1 LIMIT 1`, [exerciseId],
  );
  await createMachineAlert({
    athleteId: ath, exerciseId,
    switchedToExerciseId: ex2.rows[0].id,
  });
  expect(resendMod.__mockSend).not.toHaveBeenCalled();
  const alerts = await listAlertsForCoach(coach, true);
  expect(alerts).toHaveLength(1);
});

it('markRead + markResolved flip flags', async () => {
  const { coach, ath, exerciseId } = await setup();
  const { alertId } = await createPainAlert({
    athleteId: ath, exerciseId, zone: 'rodilla', intensity: 5,
  });
  await markRead(alertId, coach);
  await markResolved(alertId, coach);
  const r = await pool.query(
    `SELECT read_at, resolved_at FROM coach_alerts WHERE id = $1`, [alertId],
  );
  expect(r.rows[0].read_at).toBeTruthy();
  expect(r.rows[0].resolved_at).toBeTruthy();
});
