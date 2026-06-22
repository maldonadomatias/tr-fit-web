import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import { createAdmin, createAthlete } from './helpers/fixtures.js';
import {
  createPendingSkeleton, approveSkeleton, rejectSkeleton,
  listPendingForCoach, findActiveByAthlete,
} from '../../src/services/skeleton.service.js';
import pool from '../../src/db/connect.js';

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

const P = { series: null, reps: null, descanso: null };
const aiOut = {
  rationale: 'split test',
  days: [
    { day_index: 1, focus: 'p',
      slots: [
        { slot_index: 1, exercise_id: 1, role: 'principal' as const, notes: null, ...P },
        { slot_index: 2, exercise_id: 2, role: 'accesorio' as const, notes: null,
          series: 2, reps: '10x10x10', descanso: '2 min' },
      ] },
    { day_index: 2, focus: 'q',
      slots: [{ slot_index: 1, exercise_id: 1, role: 'principal' as const, notes: null, ...P }] },
    { day_index: 3, focus: 'r',
      slots: [{ slot_index: 1, exercise_id: 1, role: 'principal' as const, notes: null, ...P }] },
    { day_index: 4, focus: 's',
      slots: [{ slot_index: 1, exercise_id: 1, role: 'principal' as const, notes: null, ...P }] },
  ],
};

it('creates pending skeleton with slots', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const { skeletonId } = await createPendingSkeleton(
    { athleteId: ath, generationPrompt: { x: 1 }, generationRationale: 'r' },
    aiOut,
  );
  const slots = await pool.query(
    `SELECT count(*)::int AS n FROM skeleton_slots WHERE skeleton_id = $1`,
    [skeletonId],
  );
  expect(slots.rows[0].n).toBe(5);
});

it('approve sets program_state and seeds weights', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const { skeletonId } = await createPendingSkeleton(
    { athleteId: ath, generationPrompt: {}, generationRationale: 'r' },
    aiOut,
  );
  await approveSkeleton(skeletonId, coach);
  const state = await pool.query(
    `SELECT * FROM athlete_program_state WHERE athlete_id = $1`, [ath],
  );
  expect(state.rows[0].active_skeleton_id).toBe(skeletonId);
  expect(state.rows[0].current_week).toBe(1);
  const w = await pool.query(
    `SELECT count(*)::int AS n FROM athlete_exercise_weights WHERE athlete_id = $1`,
    [ath],
  );
  expect(w.rows[0].n).toBe(2); // exercises 1 and 2
});

it('approve persists slot overrides and reorder', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const { skeletonId } = await createPendingSkeleton(
    { athleteId: ath, generationPrompt: {}, generationRationale: 'r' },
    aiOut,
  );
  const before = await pool.query<{
    id: string;
    day_of_week: number;
    slot_index: number;
    exercise_id: number;
  }>(
    `SELECT id, day_of_week, slot_index, exercise_id
       FROM skeleton_slots WHERE skeleton_id = $1
      ORDER BY day_of_week, slot_index`,
    [skeletonId],
  );
  // Day 1 has two slots: [ex1 @ idx1, ex2 @ idx2]. Swap their order and
  // override the first slot's exercise to ex3 with a note.
  const day1 = before.rows.filter((s) => s.day_of_week === 1);
  const others = before.rows.filter((s) => s.day_of_week !== 1);
  const slotOrder = [
    // day 1 reversed
    { slot_id: day1[1].id, day_of_week: 1, slot_index: 1 },
    { slot_id: day1[0].id, day_of_week: 1, slot_index: 2 },
    ...others.map((s) => ({
      slot_id: s.id,
      day_of_week: s.day_of_week,
      slot_index: s.slot_index,
    })),
  ];
  await approveSkeleton(skeletonId, coach, {
    slotOverrides: [
      { slot_id: day1[0].id, exercise_id: 3, notes: 'usar mancuernas' },
    ],
    slotOrder,
  });

  const after = await pool.query<{
    id: string;
    day_of_week: number;
    slot_index: number;
    exercise_id: number;
    notes: string | null;
  }>(
    `SELECT id, day_of_week, slot_index, exercise_id, notes
       FROM skeleton_slots WHERE skeleton_id = $1
        AND day_of_week = 1
      ORDER BY slot_index`,
    [skeletonId],
  );
  // idx1 is now the previously-2nd slot (ex2); idx2 is the overridden slot (ex3).
  expect(after.rows[0].id).toBe(day1[1].id);
  expect(after.rows[0].exercise_id).toBe(2);
  expect(after.rows[1].id).toBe(day1[0].id);
  expect(after.rows[1].exercise_id).toBe(3);
  expect(after.rows[1].notes).toBe('usar mancuernas');

  const s = await pool.query(
    `SELECT status FROM athlete_skeletons WHERE id = $1`, [skeletonId],
  );
  expect(s.rows[0].status).toBe('approved');
});

it('approve supersedes prior approved skeleton', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const a = await createPendingSkeleton(
    { athleteId: ath, generationPrompt: {}, generationRationale: '' }, aiOut,
  );
  await approveSkeleton(a.skeletonId, coach);
  const b = await createPendingSkeleton(
    { athleteId: ath, generationPrompt: {}, generationRationale: '' }, aiOut,
  );
  await approveSkeleton(b.skeletonId, coach);
  const r = await pool.query(
    `SELECT status FROM athlete_skeletons WHERE id = $1`, [a.skeletonId],
  );
  expect(r.rows[0].status).toBe('superseded');
});

it('reject sets status and feedback', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const { skeletonId } = await createPendingSkeleton(
    { athleteId: ath, generationPrompt: {}, generationRationale: '' }, aiOut,
  );
  await rejectSkeleton(skeletonId, coach, 'no me gusta');
  const r = await pool.query(
    `SELECT status, rejection_feedback FROM athlete_skeletons WHERE id = $1`,
    [skeletonId],
  );
  expect(r.rows[0].status).toBe('rejected');
  expect(r.rows[0].rejection_feedback).toBe('no me gusta');
});

it('listPendingForCoach returns only pending for this coach', async () => {
  const coachA = await createAdmin();
  const coachB = await createAdmin();
  const ath1 = await createAthlete(coachA);
  const ath2 = await createAthlete(coachB);
  await createPendingSkeleton({ athleteId: ath1, generationPrompt: {}, generationRationale: '' }, aiOut);
  await createPendingSkeleton({ athleteId: ath2, generationPrompt: {}, generationRationale: '' }, aiOut);
  const list = await listPendingForCoach(coachA);
  expect(list).toHaveLength(1);
  expect(list[0].athlete_id).toBe(ath1);
});

it('findActiveByAthlete returns null when no state', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const r = await findActiveByAthlete(ath);
  expect(r.state).toBeNull();
  expect(r.skeleton).toBeNull();
});

import request from 'supertest';
import app from '../../src/app.js';
import { signToken } from '../../src/middleware/auth.js';

describe('admin operations HTTP endpoints', () => {
  it('GET /api/admin/operations/skeletons/pending lists own athletes only', async () => {
    const coachA = await createAdmin();
    const ath = await createAthlete(coachA);
    await createPendingSkeleton(
      { athleteId: ath, generationPrompt: {}, generationRationale: 'r' }, aiOut,
    );
    const tok = signToken({ id: coachA, role: 'admin' });
    const r = await request(app)
      .get('/api/admin/operations/skeletons/pending')
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
  });

  it('athlete cannot access /api/admin/operations/*', async () => {
    const coach = await createAdmin();
    const ath = await createAthlete(coach);
    const tok = signToken({ id: ath, role: 'athlete' });
    const r = await request(app)
      .get('/api/admin/operations/skeletons/pending')
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(403);
  });

  it('approve via HTTP works end-to-end', async () => {
    const coach = await createAdmin();
    const ath = await createAthlete(coach);
    const { skeletonId } = await createPendingSkeleton(
      { athleteId: ath, generationPrompt: {}, generationRationale: '' }, aiOut,
    );
    const tok = signToken({ id: coach, role: 'admin' });
    const r = await request(app)
      .post(`/api/admin/operations/skeletons/${skeletonId}/approve`)
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(204);
    const s = await pool.query(
      `SELECT status FROM athlete_skeletons WHERE id = $1`, [skeletonId],
    );
    expect(s.rows[0].status).toBe('approved');
  });
});
