process.env.OWNER_COACH_EMAIL = 'owner-test@example.local';

import { jest } from '@jest/globals';
import bcrypt from 'bcrypt';

// Mock openai BEFORE importing the app. The service uses structured outputs:
// chat.completions.parse + zodResponseFormat, reading choice.message.parsed.
jest.unstable_mockModule('openai', () => {
  const parse = jest.fn();
  return {
    default: jest.fn().mockImplementation(() => ({
      chat: { completions: { parse } },
    })),
    __mockParse: parse,
  };
});

jest.unstable_mockModule('openai/helpers/zod', () => ({
  zodResponseFormat: jest.fn(() => ({ type: 'json_schema' })),
}));

type MockParse = jest.Mock<
  () => Promise<{
    choices: Array<{ message: { parsed: unknown; refusal?: string | null } }>;
  }>
>;

const openaiMod = (await import('openai')) as unknown as { __mockParse: MockParse };
const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { createAdmin } = await import('./helpers/fixtures.js');
const { signToken } = await import('../../src/middleware/auth.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const requestMod = await import('supertest');
const request = requestMod.default;
const appMod = await import('../../src/app.js');
const app = appMod.default;

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

const ok = (parsed: unknown) => ({
  choices: [{ message: { parsed, refusal: null as string | null } }],
});

// Equipment allowed for equipment='gym_completo' (mirrors the matrix in
// exercise.service.ts) and level_min ranks reachable by level='medio'.
const GYM_EQUIPMENT = ['barra', 'mancuerna', 'maquina', 'polea', 'smith',
                       'bw', 'pesa_rusa', 'elastico', 'disco'];

// Pick catalog exercises the athlete of validPayload can actually receive
// (listExercisesForAthlete filter), with accessories on distinct base muscle
// groups so the per-muscle volume cap (≤10 working series/day) holds.
async function pickCatalogExercises() {
  const p = await pool.query<{ id: number }>(
    `SELECT id FROM exercises
      WHERE is_principal = TRUE AND archived_at IS NULL
        AND equipment = ANY($1)
        AND level_min IN ('principiante', 'intermedio')
      ORDER BY id LIMIT 1`,
    [GYM_EQUIPMENT],
  );
  const a = await pool.query<{ id: number }>(
    `SELECT DISTINCT ON (btrim(split_part(muscle_group, '-', 1))) id
       FROM exercises
      WHERE is_principal = FALSE AND archived_at IS NULL
        AND btrim(split_part(muscle_group, '-', 1)) <> 'Calentamiento'
        AND equipment = ANY($1)
        AND level_min IN ('principiante', 'intermedio')
      ORDER BY btrim(split_part(muscle_group, '-', 1)), id
      LIMIT 4`,
    [GYM_EQUIPMENT],
  );
  return { pid: p.rows[0].id, accIds: a.rows.map((r) => r.id) };
}

// 4 days × 8 slots — valid for exercise_minutes=60 (range 8-10 slots/day):
// 1 principal (3 working series) + 7 accessories at 2 series cycling distinct
// base muscles → 17 series/day (≤20) and ≤10 per base muscle.
const SLOTS_PER_DAY = 8;

function validSkeleton(pid: number, accIds: number[]) {
  return {
    rationale: 'r',
    days: [1, 2, 3, 4].map((d) => ({
      day_index: d, focus: 'd',
      slots: Array.from({ length: SLOTS_PER_DAY }, (_, i) => (i === 0
        ? { slot_index: 1, exercise_id: pid, role: 'principal',
            notes: null, series: null, reps: null, descanso: null }
        : { slot_index: i + 1,
            exercise_id: accIds[(i - 1) % accIds.length],
            role: 'accesorio', notes: null,
            series: 2, reps: '6 a 8', descanso: '1:45 a 2 min' })),
    })),
  };
}

async function mockValidSkeleton() {
  const { pid, accIds } = await pickCatalogExercises();
  // Need ≥2 distinct base muscles or a single accessory muscle exceeds 10 series.
  expect(accIds.length).toBeGreaterThanOrEqual(2);
  openaiMod.__mockParse.mockResolvedValue(ok(validSkeleton(pid, accIds)));
  return { pid, accIds };
}

async function makeAthleteUser() {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, 'x', 'athlete') RETURNING id`,
    [`a-${Date.now()}-${Math.random()}@t.local`],
  );
  return rows[0].id;
}

const validPayload = {
  name: 'Mati', gender: 'male', age: 30, height_cm: 175, weight_kg: 75,
  level: 'medio', goal: 'hipertrofia', days_per_week: 4,
  equipment: 'gym_completo', injuries: [],
  phone: '+5491111111111', plan_interest: 'full',
  training_mode: 'gym', commitment: 'normal', exercise_minutes: 60,
  days_specific: ['lun', 'mar', 'jue', 'sab'],
  referral_source: 'google',
};

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

it('creates profile + skeleton + slots on success', async () => {
  const u = await makeAthleteUser();
  const tok = signToken({ id: u, role: 'athlete' });
  await mockValidSkeleton();

  const r = await request(app)
    .post('/api/onboarding/complete')
    .set('Authorization', `Bearer ${tok}`)
    .send(validPayload);
  expect(r.status).toBe(201);
  expect(r.body.status).toBe('pending_review');

  const slots = await pool.query(`SELECT count(*)::int AS n FROM skeleton_slots`);
  expect(slots.rows[0].n).toBe(4 * SLOTS_PER_DAY);

  const prof = await pool.query<{ coach_id: string | null }>(
    `SELECT coach_id FROM athlete_profiles WHERE user_id = $1`, [u],
  );
  expect(prof.rows[0].coach_id).toBe(ownerCoachId);
});

it('onboarded athlete is visible in coach pending inbox', async () => {
  await createAdmin(); // another admin exists, but athletes route to the owner
  const u = await makeAthleteUser();
  const tok = signToken({ id: u, role: 'athlete' });
  await mockValidSkeleton();
  const onboardR = await request(app).post('/api/onboarding/complete')
    .set('Authorization', `Bearer ${tok}`).send(validPayload);
  expect(onboardR.status).toBe(201);

  // Onboarding assigns the OWNER_COACH_EMAIL admin as coach; the pending
  // inbox is scoped per coach, so query as the owner.
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
  await mockValidSkeleton();
  await request(app).post('/api/onboarding/complete')
    .set('Authorization', `Bearer ${tok}`).send(validPayload);
  const r2 = await request(app).post('/api/onboarding/complete')
    .set('Authorization', `Bearer ${tok}`).send(validPayload);
  expect(r2.status).toBe(409);
});

it('returns 502 when skeleton generation fails', async () => {
  const u = await makeAthleteUser();
  const tok = signToken({ id: u, role: 'athlete' });
  // parsed=null on every attempt → service exhausts retries and throws → 502.
  openaiMod.__mockParse.mockResolvedValue(ok(null));
  const r = await request(app).post('/api/onboarding/complete')
    .set('Authorization', `Bearer ${tok}`)
    .send({ ...validPayload, measurements: { chest_cm: 100 } });
  expect(r.status).toBe(502);
  // Verify rollback: profile + measurements rows were removed
  const prof = await pool.query(
    `SELECT 1 FROM athlete_profiles WHERE user_id = $1`, [u],
  );
  expect(prof.rowCount).toBe(0);
  const m = await pool.query(
    `SELECT 1 FROM athlete_measurements WHERE athlete_id = $1`, [u],
  );
  expect(m.rowCount).toBe(0);
});

it('persists new fields and measurements', async () => {
  const u = await makeAthleteUser();
  const tok = signToken({ id: u, role: 'athlete' });
  await createAdmin();
  await mockValidSkeleton();
  const r = await request(app)
    .post('/api/onboarding/complete')
    .set('Authorization', `Bearer ${tok}`)
    .send({ ...validPayload, sport_focus: 'futbol',
            measurements: { chest_cm: 100, waist_cm: 80 } });
  expect(r.status).toBe(201);
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
  await mockValidSkeleton();
  const r = await request(app)
    .post('/api/onboarding/complete')
    .set('Authorization', `Bearer ${tok}`)
    .send(validPayload);
  expect(r.status).toBe(201);
  const m = await pool.query(
    `SELECT 1 FROM athlete_measurements WHERE athlete_id=$1`, [u],
  );
  expect(m.rowCount).toBe(0);
});
