import { jest } from '@jest/globals';

// sendPush is slow and reports the token as dead, so notifyUser reaches its
// `DELETE FROM push_tokens` step well after the caller stopped awaiting it.
const mockSendPush = jest.fn<() => Promise<string>>();
jest.unstable_mockModule('../../src/services/push.service.js', () => ({
  sendPush: mockSendPush,
}));

const { resetDatabase, ensureMigrated, closePool } = await import(
  './helpers/test-db.js'
);
const { notifyUser } = await import('../../src/services/notification.service.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;

beforeAll(async () => {
  await ensureMigrated();
});
beforeEach(async () => {
  await resetDatabase();
  mockSendPush.mockReset();
});
afterAll(async () => {
  await closePool();
});

async function makeAthleteWithToken(token: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, 'x', 'athlete') RETURNING id`,
    [`inflight-${Date.now()}-${Math.random()}@t.local`]
  );
  await pool.query(
    `INSERT INTO push_tokens (user_id, token, platform) VALUES ($1, $2, 'android')`,
    [rows[0].id, token]
  );
  return rows[0].id;
}

// Routes fire notifyUser without awaiting it (see routes/rutinas.ts). If that
// promise is still running when the next test resets the database, its late
// writes land on the *next* test's rows. resetDatabase() must drain it first.
it('a fire-and-forget notifyUser cannot delete the next test\'s token', async () => {
  const SHARED_TOKEN = 'd'.repeat(30);
  mockSendPush.mockImplementation(
    () =>
      new Promise((res) => setTimeout(() => res('token_invalid'), 150))
  );

  // Test A: kicks off the notification and ends without awaiting it.
  const userA = await makeAthleteWithToken(SHARED_TOKEN);
  void notifyUser(userA, 'skeleton_approved').catch(() => {});

  // Test B starts: reset, then set up its own row reusing the same token value.
  await resetDatabase();
  await makeAthleteWithToken(SHARED_TOKEN);

  // Give test A's straggler time to land.
  await new Promise((res) => setTimeout(res, 300));

  const c = await pool.query(`SELECT 1 FROM push_tokens WHERE token = $1`, [
    SHARED_TOKEN,
  ]);
  expect(c.rowCount).toBe(1);
});
