process.env.OWNER_COACH_EMAIL = 'owner-test@example.local';

import { jest } from '@jest/globals';
import bcrypt from 'bcrypt';

// Mock the OpenAI SDK BEFORE importing the app. Template-first generation
// only reaches the model (chat.completions.parse in adjustSkeleton) when the
// profile can't use a coach template verbatim; clean profiles must never
// touch it.
jest.unstable_mockModule('openai', () => {
  const parse = jest.fn();
  const ctor = jest.fn().mockImplementation(() => ({
    chat: { completions: { parse } },
  }));
  return {
    default: ctor,
    __mockParse: parse,
    __mockCtor: ctor,
  };
});

const openaiMod = (await import('openai')) as unknown as {
  __mockParse: jest.Mock<() => Promise<unknown>>;
  __mockCtor: jest.Mock;
};
const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { createAdmin } = await import('./helpers/fixtures.js');
const { signToken } = await import('../../src/middleware/auth.js');
const { selectTemplate, buildSkeletonFromTemplate } =
  await import('../../src/services/template.service.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const requestMod = await import('supertest');
const request = requestMod.default;
const appMod = await import('../../src/app.js');
const app = appMod.default;
const { regenTick } = await import('../../src/workers/regen-worker.js');

let ownerCoachId: string;

async function seedOwnerAdmin() {
  const hash = await bcrypt.hash('owner-test-pass', 4);
  const userRes = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role, email_verified)
     VALUES ($1, $2, 'admin', TRUE)
     ON CONFLICT (email) DO UPDATE SET role = 'admin'
     RETURNING id`,
    ['owner-test@example.local', hash],
  );
  const ownerId = userRes.rows[0].id;
  await pool.query(
    `INSERT INTO coach_profiles (user_id, name) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
    [ownerId, 'Owner Admin'],
  );
  ownerCoachId = ownerId;
}

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => {
  await resetDatabase();
  await seedOwnerAdmin();
  openaiMod.__mockParse.mockReset();
});
afterAll(async () => { await closePool(); });

async function makeAthleteUser() {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, 'x', 'athlete') RETURNING id`,
    [`a-${Date.now()}-${Math.random()}@t.local`],
  );
  return rows[0].id;
}

// Clean profile: gym_completo + 60 min + 4 days inside the coach matrix →
// the coach template is used verbatim and OpenAI is never called.
const validPayload = {
  name: 'Mati', gender: 'male', age: 30, height_cm: 175, weight_kg: 75,
  level: 'medio', goal: 'hipertrofia', days_per_week: 4,
  equipment: 'gym_completo', injuries: [],
  phone: '+5491111111111', plan_interest: 'full',
  training_mode: 'gym', commitment: 'normal', exercise_minutes: 60,
  days_specific: ['lun', 'mar', 'jue', 'sab'],
  referral_source: 'google',
};

function expectedTemplateSkeleton() {
  const { template, exactMatch } = selectTemplate({
    gender: 'male', days_per_week: 4, leg_days: null,
    days_specific: ['lun', 'mar', 'jue', 'sab'],
  });
  expect(exactMatch).toBe(true);
  return buildSkeletonFromTemplate(template);
}

it('rejects unauthenticated', async () => {
  const r = await request(app).post('/api/onboarding/complete').send(validPayload);
  expect(r.status).toBe(401);
});

it('rejects payload validation errors', async () => {
  const u = await makeAthleteUser();
  const tok = signToken({ id: u, role: 'athlete' });
  const r = await request(app)
    .post('/api/onboarding/complete')
    .set('Authorization', `Bearer ${tok}`)
    .send({ ...validPayload, age: 5 });
  expect(r.status).toBe(400);
});

it('configures the OpenAI client with an explicit timeout', async () => {
  expect(openaiMod.__mockCtor).toHaveBeenCalledWith(
    expect.objectContaining({ timeout: expect.any(Number) }),
  );
});

it('clean profile: 202 + queued job, worker then builds template skeleton verbatim', async () => {
  const u = await makeAthleteUser();
  const tok = signToken({ id: u, role: 'athlete' });

  const r = await request(app)
    .post('/api/onboarding/complete')
    .set('Authorization', `Bearer ${tok}`)
    .send(validPayload);
  expect(r.status).toBe(202);
  expect(r.body.status).toBe('queued');

  // Generation is async: no skeleton yet, one queued job.
  const preSk = await pool.query(
    `SELECT 1 FROM athlete_skeletons WHERE athlete_id = $1`, [u],
  );
  expect(preSk.rowCount).toBe(0);
  const job = await pool.query<{ status: string }>(
    `SELECT status FROM skeleton_regen_jobs WHERE athlete_id = $1`, [u],
  );
  expect(job.rows.map((x) => x.status)).toEqual(['queued']);

  await regenTick();
  expect(openaiMod.__mockParse).not.toHaveBeenCalled();

  // Skeleton rows must be the selected coach template, slot by slot.
  const expected = expectedTemplateSkeleton();
  const slots = await pool.query<{
    day_of_week: number; slot_index: number; exercise_id: number;
    role: string; series: number | null; reps: string | null;
    descanso: string | null;
  }>(
    `SELECT day_of_week, slot_index, exercise_id, role, series, reps, descanso
       FROM skeleton_slots
      ORDER BY day_of_week, slot_index`,
  );
  const expectedRows = expected.days.flatMap((d) =>
    d.slots.map((s) => ({
      day_of_week: d.day_index, slot_index: s.slot_index,
      exercise_id: s.exercise_id, role: s.role,
      series: s.series, reps: s.reps, descanso: s.descanso,
    })),
  );
  expect(slots.rows).toEqual(expectedRows);

  const sk = await pool.query<{ generation_rationale: string }>(
    `SELECT generation_rationale FROM athlete_skeletons WHERE athlete_id = $1`, [u],
  );
  expect(sk.rows[0].generation_rationale).toBe(expected.rationale);

  const prof = await pool.query<{ coach_id: string | null }>(
    `SELECT coach_id FROM athlete_profiles WHERE user_id = $1`, [u],
  );
  expect(prof.rows[0].coach_id).toBe(ownerCoachId);
});

it('onboarded athlete is visible in the owner coach pending inbox after worker runs', async () => {
  const u = await makeAthleteUser();
  const tok = signToken({ id: u, role: 'athlete' });
  const onboardR = await request(app).post('/api/onboarding/complete')
    .set('Authorization', `Bearer ${tok}`).send(validPayload);
  expect(onboardR.status).toBe(202);
  await regenTick();

  // Onboarding routes every athlete to OWNER_COACH_EMAIL, so the owner
  // admin (not an arbitrary admin) sees the pending skeleton.
  const coachTok = signToken({ id: ownerCoachId, role: 'admin' });
  const inbox = await request(app)
    .get('/api/admin/operations/skeletons/pending')
    .set('Authorization', `Bearer ${coachTok}`);
  expect(inbox.status).toBe(200);
  expect(inbox.body).toHaveLength(1);
  expect(inbox.body[0].athlete_id).toBe(u);
});

it('returns 409 on duplicate onboarding', async () => {
  const u = await makeAthleteUser();
  const tok = signToken({ id: u, role: 'athlete' });
  await request(app).post('/api/onboarding/complete')
    .set('Authorization', `Bearer ${tok}`).send(validPayload);
  const r2 = await request(app).post('/api/onboarding/complete')
    .set('Authorization', `Bearer ${tok}`).send(validPayload);
  expect(r2.status).toBe(409);
});

it('AI failure: onboarding still succeeds, profile persists, job stays queued for retry', async () => {
  const u = await makeAthleteUser();
  const tok = signToken({ id: u, role: 'athlete' });
  // 2 days/week is outside the coach matrix (3-5) → template can't be used
  // verbatim → adjustSkeleton calls OpenAI, which we make blow up.
  openaiMod.__mockParse.mockRejectedValue(new Error('openai down'));
  const r = await request(app).post('/api/onboarding/complete')
    .set('Authorization', `Bearer ${tok}`)
    .send({
      ...validPayload, days_per_week: 2, days_specific: ['lun', 'jue'],
      measurements: { chest_cm: 100 },
    });
  // Enqueue-only: the request never touches OpenAI and cannot 502 on it.
  expect(r.status).toBe(202);
  expect(openaiMod.__mockParse).not.toHaveBeenCalled();

  await regenTick();
  expect(openaiMod.__mockParse).toHaveBeenCalled();

  // Profile and measurements survive the failure; the job is requeued
  // with backoff instead of orphaning the athlete.
  const prof = await pool.query(
    `SELECT 1 FROM athlete_profiles WHERE user_id = $1`, [u],
  );
  expect(prof.rowCount).toBe(1);
  const m = await pool.query(
    `SELECT 1 FROM athlete_measurements WHERE athlete_id = $1`, [u],
  );
  expect(m.rowCount).toBe(1);
  const job = await pool.query<{ status: string; attempts: number; last_error: string }>(
    `SELECT status, attempts, last_error FROM skeleton_regen_jobs WHERE athlete_id = $1`,
    [u],
  );
  expect(job.rows[0].status).toBe('queued');
  expect(job.rows[0].attempts).toBe(1);
  expect(job.rows[0].last_error).toContain('openai down');
  const sk = await pool.query(
    `SELECT 1 FROM athlete_skeletons WHERE athlete_id = $1`, [u],
  );
  expect(sk.rowCount).toBe(0);
});

it('persists new fields and measurements', async () => {
  const u = await makeAthleteUser();
  const tok = signToken({ id: u, role: 'athlete' });
  await createAdmin();
  const r = await request(app)
    .post('/api/onboarding/complete')
    .set('Authorization', `Bearer ${tok}`)
    .send({ ...validPayload, sport_focus: 'futbol',
            measurements: { chest_cm: 100, waist_cm: 80 } });
  expect(r.status).toBe(202);
  const prof = await pool.query(
    `SELECT phone, plan_interest, days_specific, sport_focus
       FROM athlete_profiles WHERE user_id=$1`, [u],
  );
  expect(prof.rows[0].phone).toBe('+5491111111111');
  expect(prof.rows[0].days_specific).toEqual(['lun','mar','jue','sab']);
  expect(prof.rows[0].sport_focus).toBe('futbol');
  const m = await pool.query(
    `SELECT chest_cm, waist_cm, source
       FROM athlete_measurements WHERE athlete_id=$1`, [u],
  );
  expect(m.rowCount).toBe(1);
  expect(Number(m.rows[0].chest_cm)).toBe(100);
  expect(m.rows[0].source).toBe('onboarding');
});

it('skips measurements INSERT when all values null', async () => {
  const u = await makeAthleteUser();
  const tok = signToken({ id: u, role: 'athlete' });
  await createAdmin();
  const r = await request(app)
    .post('/api/onboarding/complete')
    .set('Authorization', `Bearer ${tok}`)
    .send(validPayload);
  expect(r.status).toBe(202);
  const m = await pool.query(
    `SELECT 1 FROM athlete_measurements WHERE athlete_id=$1`, [u],
  );
  expect(m.rowCount).toBe(0);
});
