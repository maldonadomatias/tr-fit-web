import request from 'supertest';
import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import pool from '../../src/db/connect.js';
import { signToken } from '../../src/middleware/auth.js';
import { createAdmin, createAthlete } from './helpers/fixtures.js';
import {
  createPendingSkeleton,
  approveSkeleton,
} from '../../src/services/skeleton.service.js';
import app from '../../src/app.js';

beforeAll(async () => {
  await ensureMigrated();
});
beforeEach(async () => {
  await resetDatabase();
});
afterAll(async () => {
  await closePool();
});

const slot = (exercise_id: number, role: 'principal' | 'accesorio') => ({
  slot_index: exercise_id,
  exercise_id,
  role,
  notes: null,
  series: role === 'principal' ? null : 3,
  reps: role === 'principal' ? null : '8',
  descanso: null,
});

// Ticket #127: the Progresión tab also lists what the athlete lifted on the
// principals that week (they progress by periodization, not by the cron).
it('GET /admin/users/:id/progression includes principal sets of from_week', async () => {
  const adminId = await createAdmin();
  const athleteId = await createAthlete(adminId);
  const { skeletonId } = await createPendingSkeleton(
    { athleteId, generationPrompt: {}, generationRationale: 'r' },
    {
      rationale: 'r',
      days: [
        {
          day_index: 1,
          focus: 'x',
          slots: [slot(1, 'principal'), slot(2, 'accesorio')],
        },
      ],
    }
  );
  await approveSkeleton(skeletonId, adminId);

  const sess = await pool.query<{ id: string }>(
    `INSERT INTO session_logs (athlete_id, skeleton_id, program_week, day_of_week)
     VALUES ($1, $2, 7, 1) RETURNING id`,
    [athleteId, skeletonId]
  );
  const log = (ex: number, idx: number, kg: number, reps: number) =>
    pool.query(
      `INSERT INTO set_logs (athlete_id, exercise_id, week, day_of_week,
         set_index, weight_kg, value, unit, reps, completed, session_log_id)
       VALUES ($1, $2, 7, 1, $3, $4, $4, 'kg', $5, TRUE, $6)`,
      [athleteId, ex, idx, kg, reps, sess.rows[0].id]
    );
  await log(1, 1, 80, 8);
  await log(1, 2, 82.5, 6);
  await log(2, 1, 20, 8); // accessory: must not appear in principals
  await pool.query(
    `INSERT INTO progression_runs (athlete_id, from_week, to_week, compliance, status)
     VALUES ($1, 7, 8, 1, 'success')`,
    [athleteId]
  );

  const res = await request(app)
    .get(`/api/admin/users/${athleteId}/progression`)
    .set(
      'Authorization',
      `Bearer ${signToken({ id: adminId, role: 'admin' })}`
    );

  expect(res.status).toBe(200);
  expect(res.body[0].principals).toEqual([
    {
      exercise_id: 1,
      exercise_name: expect.any(String),
      sets: [
        { value: 80, unit: 'kg', reps: 8 },
        { value: 82.5, unit: 'kg', reps: 6 },
      ],
    },
  ]);
});
