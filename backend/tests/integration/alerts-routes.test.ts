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
const { createAdmin, createAthlete } = await import('./helpers/fixtures.js');
const { signToken } = await import('../../src/middleware/auth.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const requestMod = await import('supertest');
const request = requestMod.default;
const { default: app } = await import('../../src/app.js');

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => {
  await resetDatabase();
  resendMod.__mockSend.mockReset();
  resendMod.__mockSend.mockResolvedValue({ data: { id: 'msg' }, error: null });
});
afterAll(async () => { await closePool(); });

it('POST /api/alerts SOS pain creates row + emails coach', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const ex = await pool.query<{ id: number }>(`SELECT id FROM exercises LIMIT 1`);
  const tok = signToken({ id: ath, role: 'athlete' });

  const r = await request(app).post('/api/alerts')
    .set('Authorization', `Bearer ${tok}`)
    .send({
      type: 'sos_pain', exercise_id: ex.rows[0].id,
      payload: { zone: 'lumbar', intensity: 7 },
    });
  expect(r.status).toBe(201);
  expect(resendMod.__mockSend).toHaveBeenCalledTimes(1);
});

it('GET /api/admin/alerts lists alerts for coach', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const ex = await pool.query<{ id: number }>(`SELECT id FROM exercises LIMIT 1`);
  const athTok = signToken({ id: ath, role: 'athlete' });
  await request(app).post('/api/alerts')
    .set('Authorization', `Bearer ${athTok}`)
    .send({
      type: 'sos_pain', exercise_id: ex.rows[0].id,
      payload: { zone: 'rodilla', intensity: 5 },
    });

  const coachTok = signToken({ id: coach, role: 'admin' });
  const list = await request(app).get('/api/admin/alerts?status=open')
    .set('Authorization', `Bearer ${coachTok}`);
  expect(list.status).toBe(200);
  expect(list.body.items).toHaveLength(1);
  expect(typeof list.body.total).toBe('number');
});

it('POST /api/admin/alerts/:id/resolve applies swap + audits', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const ex = await pool.query<{ id: number }>(`SELECT id FROM exercises LIMIT 1`);
  const exerciseId = ex.rows[0].id;
  const altR = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE id != $1 LIMIT 1`, [exerciseId],
  );
  const replId = altR.rows[0].id;

  // Athlete creates SOS pain.
  const athTok = signToken({ id: ath, role: 'athlete' });
  const create = await request(app).post('/api/alerts')
    .set('Authorization', `Bearer ${athTok}`)
    .send({
      type: 'sos_pain', exercise_id: exerciseId,
      payload: { zone: 'lumbar', intensity: 7 },
    });
  expect(create.status).toBe(201);
  const alertId = create.body.alertId;

  // Seed program state.
  await pool.query(
    `INSERT INTO athlete_program_state (athlete_id, current_week, rm_test_blocking, start_date)
     VALUES ($1, 4, false, CURRENT_DATE)
     ON CONFLICT (athlete_id) DO UPDATE SET current_week = 4, start_date = CURRENT_DATE`,
    [ath],
  );

  const coachTok = signToken({ id: coach, role: 'admin' });
  const r = await request(app)
    .post(`/api/admin/alerts/${alertId}/resolve`)
    .set('Authorization', `Bearer ${coachTok}`)
    .send({ action: 'swap_exercise', payload: { replacement_exercise_id: replId } });
  expect(r.status).toBe(200);

  const ov = await pool.query(
    `SELECT * FROM weekly_overrides WHERE source_alert_id = $1`, [alertId],
  );
  expect(ov.rowCount).toBe(1);
  expect(ov.rows[0].override_type).toBe('swap');
});

it('POST /api/admin/alerts/:id/resolve returns 422 when action not in matrix', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const ex = await pool.query<{ id: number }>(`SELECT id FROM exercises LIMIT 1`);
  const athTok = signToken({ id: ath, role: 'athlete' });
  const create = await request(app).post('/api/alerts')
    .set('Authorization', `Bearer ${athTok}`)
    .send({
      type: 'sos_pain', exercise_id: ex.rows[0].id,
      payload: { zone: 'cervical', intensity: 5 },
    });
  const alertId = create.body.alertId;

  const coachTok = signToken({ id: coach, role: 'admin' });
  const r = await request(app)
    .post(`/api/admin/alerts/${alertId}/resolve`)
    .set('Authorization', `Bearer ${coachTok}`)
    .send({ action: 'reschedule_rm', payload: { target_week: 5 } });
  expect(r.status).toBe(422);
});

it('GET /api/admin/alerts/:id/context returns athlete + pain history', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const ex = await pool.query<{ id: number }>(`SELECT id FROM exercises LIMIT 1`);
  const athTok = signToken({ id: ath, role: 'athlete' });
  const create = await request(app).post('/api/alerts')
    .set('Authorization', `Bearer ${athTok}`)
    .send({
      type: 'sos_pain', exercise_id: ex.rows[0].id,
      payload: { zone: 'lumbar', intensity: 6 },
    });
  const alertId = create.body.alertId;

  const coachTok = signToken({ id: coach, role: 'admin' });
  const r = await request(app)
    .get(`/api/admin/alerts/${alertId}/context`)
    .set('Authorization', `Bearer ${coachTok}`);
  expect(r.status).toBe(200);
  expect(r.body.alert.id).toBe(alertId);
  expect(Array.isArray(r.body.painHistory)).toBe(true);
});

it('GET /api/admin/alerts supports status=resolved filter', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const ex = await pool.query<{ id: number }>(`SELECT id FROM exercises LIMIT 1`);
  const athTok = signToken({ id: ath, role: 'athlete' });
  const create = await request(app).post('/api/alerts')
    .set('Authorization', `Bearer ${athTok}`)
    .send({
      type: 'sos_pain', exercise_id: ex.rows[0].id,
      payload: { zone: 'lumbar', intensity: 4 },
    });
  const alertId = create.body.alertId;

  // Resolve via service (avoids the route's full happy-path noise).
  const { resolveAlert } = await import('../../src/services/alert.service.js');
  await resolveAlert(alertId, coach, { action: 'note_only', payload: {} });

  const coachTok = signToken({ id: coach, role: 'admin' });
  const r = await request(app)
    .get('/api/admin/alerts?status=resolved')
    .set('Authorization', `Bearer ${coachTok}`);
  expect(r.status).toBe(200);
  expect(r.body.items.find((a: { id: string }) => a.id === alertId)).toBeDefined();
});

it('POST /api/alerts sos_machine on an RM-test principal returns 409', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const ex = await pool.query<{ id: number; principal: boolean }>(
    `(SELECT id, true AS principal FROM exercises WHERE is_principal = TRUE LIMIT 1)
     UNION ALL
     (SELECT id, false AS principal FROM exercises WHERE is_principal = FALSE LIMIT 1)`,
  );
  const pid = ex.rows.find((r) => r.principal)!.id;
  const aid = ex.rows.find((r) => !r.principal)!.id;
  const { createPendingSkeleton, approveSkeleton } = await import(
    '../../src/services/skeleton.service.js'
  );
  const { skeletonId } = await createPendingSkeleton(
    { athleteId: ath, generationPrompt: {}, generationRationale: 'r' },
    {
      rationale: 'r',
      days: [1, 2, 3, 4].map((d) => ({
        day_index: d,
        focus: 'd',
        slots: [
          { slot_index: 1, exercise_id: pid, role: 'principal' as const, notes: null, series: null, reps: null, descanso: null },
          { slot_index: 2, exercise_id: aid, role: 'accesorio' as const, notes: null, series: null, reps: null, descanso: null },
        ],
      })),
    },
  );
  await approveSkeleton(skeletonId, coach);
  await pool.query(
    `UPDATE athlete_program_state SET current_week = 10 WHERE athlete_id = $1`,
    [ath],
  );

  const tok = signToken({ id: ath, role: 'athlete' });
  const r = await request(app).post('/api/alerts')
    .set('Authorization', `Bearer ${tok}`)
    .send({
      type: 'sos_machine',
      exercise_id: pid,
      payload: { switched_to_exercise_id: aid },
    });
  expect(r.status).toBe(409);
  expect(r.body.error).toBe('rm_test_locked');
});

it('GET /api/exercises/:id/alternatives returns alternative or null', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const ex = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE muscle_group = 'Pecho - Mayor' AND is_principal = FALSE LIMIT 1`,
  );
  if (!ex.rows[0]) return;
  const tok = signToken({ id: ath, role: 'athlete' });
  const r = await request(app).get(`/api/exercises/${ex.rows[0].id}/alternatives`)
    .set('Authorization', `Bearer ${tok}`);
  expect(r.status).toBe(200);
  expect(r.body).toHaveProperty('alternative');
});
