import { jest } from '@jest/globals';

type ApnsStatus = 'sent' | 'token_invalid' | 'failed';
const sendLiveActivityEnd =
  jest.fn<(token: string, contentState: object, dismissalAtSec: number) => Promise<ApnsStatus>>();
jest.unstable_mockModule('../../src/services/apns.service.js', () => ({
  sendLiveActivityEnd,
}));

const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { createAdmin, createAthlete } = await import('./helpers/fixtures.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const { liveActivityTick, MAX_JOB_ATTEMPTS } = await import('../../src/workers/live-activity-worker.js');

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); sendLiveActivityEnd.mockReset(); });
afterAll(async () => { await closePool(); });

const CONTENT_STATE = { name: 'RestActivity', props: '{}' };

async function enqueueJob(
  userId: string,
  overrides: { apnsToken?: string; status?: string; attempts?: number; nextAttemptAt?: Date } = {},
): Promise<string> {
  const apnsToken = overrides.apnsToken ?? `tok-${Date.now()}-${Math.random()}`;
  const r = await pool.query<{ id: string }>(
    `INSERT INTO live_activity_jobs
       (user_id, apns_token, activity_name, content_state, end_at, next_attempt_at, status, attempts)
     VALUES ($1, $2, 'RestActivity', $3::jsonb, now(), $4, $5, $6)
     RETURNING id`,
    [
      userId,
      apnsToken,
      JSON.stringify(CONTENT_STATE),
      overrides.nextAttemptAt ?? new Date(),
      overrides.status ?? 'queued',
      overrides.attempts ?? 0,
    ],
  );
  return r.rows[0].id;
}

async function jobRow(id: string) {
  const r = await pool.query<{ status: string; attempts: number; last_error: string | null }>(
    `SELECT status, attempts, last_error FROM live_activity_jobs WHERE id = $1`,
    [id],
  );
  return r.rows[0];
}

async function makeClaimable(id: string) {
  await pool.query(`UPDATE live_activity_jobs SET next_attempt_at = now() WHERE id = $1`, [id]);
}

describe('liveActivityTick', () => {
  it('sends an end push for a claimed due job and marks it done', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    sendLiveActivityEnd.mockResolvedValueOnce('sent');
    const jobId = await enqueueJob(a);

    await liveActivityTick();

    expect(sendLiveActivityEnd).toHaveBeenCalledWith(
      expect.any(String),
      CONTENT_STATE,
      expect.any(Number),
    );
    expect((await jobRow(jobId)).status).toBe('done');
  });

  it('requeues with backoff on a failed push, then gives up after MAX_JOB_ATTEMPTS', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    sendLiveActivityEnd.mockResolvedValue('failed');
    const jobId = await enqueueJob(a);

    await liveActivityTick();
    let s = await jobRow(jobId);
    expect(s.status).toBe('queued');
    expect(s.attempts).toBe(1);

    await makeClaimable(jobId);
    await liveActivityTick();
    await makeClaimable(jobId);
    await liveActivityTick();

    s = await jobRow(jobId);
    expect(s.status).toBe('failed');
    expect(s.attempts).toBe(MAX_JOB_ATTEMPTS);
  });

  it('is a no-op when there are no due jobs', async () => {
    await expect(liveActivityTick()).resolves.toBeUndefined();
    expect(sendLiveActivityEnd).not.toHaveBeenCalled();
  });
});
