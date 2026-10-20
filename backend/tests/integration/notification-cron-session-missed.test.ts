import { jest } from '@jest/globals';
import { DateTime } from 'luxon';

const mockNotify = jest.fn<(userId: string, type: string) => Promise<void>>();
jest.unstable_mockModule('../../src/services/notification.service.js', () => ({
  notifyUser: mockNotify,
}));

const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { createAdmin, createAthlete } = await import('./helpers/fixtures.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const { runNotificationTick } = await import('../../src/workers/notification-cron.js');

// Monday 2026-05-11 21:00 in America/Argentina/Buenos_Aires.
const AT_21 = DateTime.fromISO('2026-05-12T00:00:00.000Z');

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => {
  await resetDatabase();
  mockNotify.mockReset();
  mockNotify.mockResolvedValue(undefined);
});
afterAll(async () => { await closePool(); });

async function athleteWhoTrainsMonday(): Promise<string> {
  const coach = await createAdmin();
  return createAthlete(coach, {
    days_per_week: 3,
    days_specific: ['lun', 'mie', 'vie'],
  });
}

async function approvedSkeleton(athleteId: string): Promise<string> {
  const sk = await pool.query<{ id: string }>(
    `INSERT INTO athlete_skeletons
       (athlete_id, status, generation_prompt, generation_rationale)
     VALUES ($1, 'approved', '{}'::jsonb, 'test')
     RETURNING id`,
    [athleteId],
  );
  return sk.rows[0].id;
}

it('does not send session_missed when today already has an open session', async () => {
  const athleteId = await athleteWhoTrainsMonday();
  const skeletonId = await approvedSkeleton(athleteId);
  // Started in the afternoon. Athletes often close the session hours later,
  // so finished_at is still null at 21:00 even though they trained.
  await pool.query(
    `INSERT INTO session_logs
       (athlete_id, skeleton_id, program_week, day_of_week, started_at)
     VALUES ($1, $2, 1, 1, $3)`,
    [athleteId, skeletonId, '2026-05-11T18:30:00-03:00'],
  );

  await runNotificationTick(AT_21);

  expect(mockNotify).not.toHaveBeenCalledWith(athleteId, 'session_missed');
});

it('sends session_missed at 21:00 on a training day with no session', async () => {
  const athleteId = await athleteWhoTrainsMonday();

  await runNotificationTick(AT_21);

  expect(mockNotify).toHaveBeenCalledWith(athleteId, 'session_missed');
});

it('does not treat a session started yesterday evening as today', async () => {
  const athleteId = await athleteWhoTrainsMonday();
  const skeletonId = await approvedSkeleton(athleteId);
  // Sunday 22:00 ART is Monday 01:00 UTC. A UTC-day window would hide Monday's ping.
  await pool.query(
    `INSERT INTO session_logs
       (athlete_id, skeleton_id, program_week, day_of_week, started_at, finished_at)
     VALUES ($1, $2, 1, 1, $3, $4)`,
    [athleteId, skeletonId, '2026-05-10T22:00:00-03:00', '2026-05-10T23:00:00-03:00'],
  );

  await runNotificationTick(AT_21);

  expect(mockNotify).toHaveBeenCalledWith(athleteId, 'session_missed');
});
