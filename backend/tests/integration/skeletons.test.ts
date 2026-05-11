import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import { createCoach, createAthlete } from './helpers/fixtures.js';
import {
  createPendingSkeleton, approveSkeleton, rejectSkeleton,
  listPendingForCoach, findActiveByAthlete,
} from '../../src/services/skeleton.service.js';
import pool from '../../src/db/connect.js';

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

const aiOut = {
  rationale: 'split test',
  days: [
    { day_index: 1, focus: 'p',
      slots: [
        { slot_index: 1, exercise_id: 1, role: 'principal' as const },
        { slot_index: 2, exercise_id: 2, role: 'accesorio' as const },
      ] },
    { day_index: 2, focus: 'q',
      slots: [{ slot_index: 1, exercise_id: 1, role: 'principal' as const }] },
    { day_index: 3, focus: 'r',
      slots: [{ slot_index: 1, exercise_id: 1, role: 'principal' as const }] },
    { day_index: 4, focus: 's',
      slots: [{ slot_index: 1, exercise_id: 1, role: 'principal' as const }] },
  ],
};

it('creates pending skeleton with slots', async () => {
  const coach = await createCoach();
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
  const coach = await createCoach();
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

it('approve supersedes prior approved skeleton', async () => {
  const coach = await createCoach();
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
  const coach = await createCoach();
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
  const coachA = await createCoach();
  const coachB = await createCoach();
  const ath1 = await createAthlete(coachA);
  const ath2 = await createAthlete(coachB);
  await createPendingSkeleton({ athleteId: ath1, generationPrompt: {}, generationRationale: '' }, aiOut);
  await createPendingSkeleton({ athleteId: ath2, generationPrompt: {}, generationRationale: '' }, aiOut);
  const list = await listPendingForCoach(coachA);
  expect(list).toHaveLength(1);
  expect(list[0].athlete_id).toBe(ath1);
});

it('findActiveByAthlete returns null when no state', async () => {
  const coach = await createCoach();
  const ath = await createAthlete(coach);
  const r = await findActiveByAthlete(ath);
  expect(r.state).toBeNull();
  expect(r.skeleton).toBeNull();
});

import request from 'supertest';
import app from '../../src/app.js';
import { signToken } from '../../src/middleware/auth.js';

describe('coach HTTP endpoints', () => {
  it('GET /api/coach/skeletons/pending lists own athletes only', async () => {
    const coachA = await createCoach();
    const ath = await createAthlete(coachA);
    await createPendingSkeleton(
      { athleteId: ath, generationPrompt: {}, generationRationale: 'r' }, aiOut,
    );
    const tok = signToken({ id: coachA, role: 'coach' });
    const r = await request(app)
      .get('/api/coach/skeletons/pending')
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
  });

  it('athlete cannot access /api/coach/*', async () => {
    const coach = await createCoach();
    const ath = await createAthlete(coach);
    const tok = signToken({ id: ath, role: 'athlete' });
    const r = await request(app)
      .get('/api/coach/skeletons/pending')
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(403);
  });

  it('approve via HTTP works end-to-end', async () => {
    const coach = await createCoach();
    const ath = await createAthlete(coach);
    const { skeletonId } = await createPendingSkeleton(
      { athleteId: ath, generationPrompt: {}, generationRationale: '' }, aiOut,
    );
    const tok = signToken({ id: coach, role: 'coach' });
    const r = await request(app)
      .post(`/api/coach/skeletons/${skeletonId}/approve`)
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(204);
    const s = await pool.query(
      `SELECT status FROM athlete_skeletons WHERE id = $1`, [skeletonId],
    );
    expect(s.rows[0].status).toBe('approved');
  });
});
