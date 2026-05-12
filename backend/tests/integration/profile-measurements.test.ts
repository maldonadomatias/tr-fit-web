import { jest } from '@jest/globals';
const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { signToken } = await import('../../src/middleware/auth.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const requestMod = await import('supertest');
const request = requestMod.default;
const appMod = await import('../../src/app.js');
const app = appMod.default;

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

async function makeAthlete() {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, 'x', 'athlete') RETURNING id`,
    [`a-${Date.now()}-${Math.random()}@t.local`],
  );
  return rows[0].id;
}

it('POST /profile/measurements creates measurement', async () => {
  const u = await makeAthlete();
  const tok = signToken({ id: u, role: 'athlete' });
  const r = await request(app)
    .post('/api/profile/measurements')
    .set('Authorization', `Bearer ${tok}`)
    .send({ chest_cm: 100, waist_cm: 80 });
  expect(r.status).toBe(201);
  expect(r.body.id).toBeDefined();
  expect(r.body.source).toBe('manual');
});

it('GET /profile/measurements returns user measurements DESC', async () => {
  const u = await makeAthlete();
  const tok = signToken({ id: u, role: 'athlete' });
  await pool.query(
    `INSERT INTO athlete_measurements
       (athlete_id, chest_cm, source, measured_at)
     VALUES ($1,90,'onboarding',now() - interval '7 days'),
            ($1,95,'manual',now())`,
    [u],
  );
  const r = await request(app)
    .get('/api/profile/measurements')
    .set('Authorization', `Bearer ${tok}`);
  expect(r.status).toBe(200);
  expect(r.body.length).toBe(2);
  expect(Number(r.body[0].chest_cm)).toBe(95);
});

it('GET /profile/measurements scoped per user', async () => {
  const u1 = await makeAthlete();
  const u2 = await makeAthlete();
  await pool.query(
    `INSERT INTO athlete_measurements (athlete_id, chest_cm) VALUES ($1, 100)`,
    [u2],
  );
  const tok = signToken({ id: u1, role: 'athlete' });
  const r = await request(app)
    .get('/api/profile/measurements')
    .set('Authorization', `Bearer ${tok}`);
  expect(r.body.length).toBe(0);
});

it('GET /profile/status returns has_profile=false for new athlete', async () => {
  const u = await makeAthlete();
  const tok = signToken({ id: u, role: 'athlete' });
  const r = await request(app)
    .get('/api/profile/status')
    .set('Authorization', `Bearer ${tok}`);
  expect(r.status).toBe(200);
  expect(r.body.has_profile).toBe(false);
});

it('GET /profile/status returns has_profile=true after onboarding', async () => {
  const u = await makeAthlete();
  await pool.query(
    `INSERT INTO athlete_profiles
       (user_id, name, gender, age, height_cm, weight_kg, level, goal,
        days_per_week, equipment, injuries,
        phone, plan_interest, training_mode, commitment, exercise_minutes,
        days_specific, referral_source)
     VALUES ($1,'A','male',30,175,75,'medio','hipertrofia',
             4,'gym_completo','{}','+5491111111111','full',
             'gym','normal',60,'{lun,mar,jue,sab}','google')`,
    [u],
  );
  const tok = signToken({ id: u, role: 'athlete' });
  const r = await request(app)
    .get('/api/profile/status')
    .set('Authorization', `Bearer ${tok}`);
  expect(r.status).toBe(200);
  expect(r.body.has_profile).toBe(true);
});
