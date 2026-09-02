export {};
// Admin user profile: GET /api/admin/users/:id exposes training days and
// injuries. GET/PUT /api/admin/users/:id/weights lets the coach set the
// working weight the engine prescribes for each exercise.
const { resetDatabase, ensureMigrated, closePool } =
  await import('./helpers/test-db.js');
const { signToken } = await import('../../src/middleware/auth.js');
const { createAdmin, createAthlete, signupUserInDb } =
  await import('./helpers/fixtures.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const requestMod = await import('supertest');
const request = requestMod.default;
const appMod = await import('../../src/app.js');
const app = appMod.default;

beforeAll(async () => {
  await ensureMigrated();
});
beforeEach(async () => {
  await resetDatabase();
});
afterAll(async () => {
  await closePool();
});

describe('GET /api/admin/users/:id training fields', () => {
  it('returns days and injuries for an onboarded athlete', async () => {
    const adminId = await createAdmin();
    const adminTok = signToken({ id: adminId, role: 'admin' });
    const athleteId = await createAthlete(adminId, {
      days_per_week: 3,
      days_specific: ['lun', 'mie', 'vie'],
      injuries: ['lumbar', 'rodilla'],
    });

    const r = await request(app)
      .get(`/api/admin/users/${athleteId}`)
      .set('Authorization', `Bearer ${adminTok}`);

    expect(r.status).toBe(200);
    expect(r.body.days_per_week).toBe(3);
    expect(r.body.days_specific).toEqual(['lun', 'mie', 'vie']);
    expect(r.body.injuries).toEqual(['lumbar', 'rodilla']);
    expect(r.body.profile).toMatchObject({
      gender: 'male',
      age: 30,
      height_cm: 175,
      weight_kg: 75,
      level: 'medio',
      goal: 'hipertrofia',
      days_per_week: 3,
      days_specific: ['lun', 'mie', 'vie'],
      equipment: 'gym_completo',
      injuries: ['lumbar', 'rodilla'],
    });
  });

  it('returns null training fields when the user has no athlete profile', async () => {
    const adminId = await createAdmin();
    const adminTok = signToken({ id: adminId, role: 'admin' });
    const { id } = await signupUserInDb(
      'no-profile@test.local',
      'pwd-test-1234',
      true
    );

    const r = await request(app)
      .get(`/api/admin/users/${id}`)
      .set('Authorization', `Bearer ${adminTok}`);

    expect(r.status).toBe(200);
    expect(r.body.days_per_week).toBeNull();
    expect(r.body.days_specific).toBeNull();
    expect(r.body.injuries).toBeNull();
    expect(r.body.profile).toBeNull();
  });
});

describe('GET/PUT /api/admin/users/:id/weights', () => {
  async function seedWeight(
    athleteId: string,
    kg: number
  ): Promise<{ exerciseId: number; name: string }> {
    const ex = await pool.query<{ id: number; name: string }>(
      `SELECT id, name FROM exercises LIMIT 1`
    );
    await pool.query(
      `INSERT INTO athlete_exercise_weights
         (athlete_id, exercise_id, current_weight_kg, current_value, unit, updated_by)
       VALUES ($1, $2, $3, $3, 'kg', 'athlete_initial')`,
      [athleteId, ex.rows[0].id, kg]
    );
    return { exerciseId: ex.rows[0].id, name: ex.rows[0].name };
  }

  it('lists the athlete working weights', async () => {
    const adminId = await createAdmin();
    const adminTok = signToken({ id: adminId, role: 'admin' });
    const athleteId = await createAthlete(adminId);
    const seeded = await seedWeight(athleteId, 40);

    const r = await request(app)
      .get(`/api/admin/users/${athleteId}/weights`)
      .set('Authorization', `Bearer ${adminTok}`);

    expect(r.status).toBe(200);
    expect(r.body.weights).toEqual([
      {
        exercise_id: seeded.exerciseId,
        exercise_name: seeded.name,
        current_value: 40,
        unit: 'kg',
        scheme: 'normal',
      },
    ]);
  });

  it('updates a working weight and echoes it back', async () => {
    const adminId = await createAdmin();
    const adminTok = signToken({ id: adminId, role: 'admin' });
    const athleteId = await createAthlete(adminId);
    const seeded = await seedWeight(athleteId, 40);

    const r = await request(app)
      .put(`/api/admin/users/${athleteId}/weights`)
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ exercise_id: seeded.exerciseId, current_value: 42.5 });

    expect(r.status).toBe(200);
    expect(r.body.weight.exercise_id).toBe(seeded.exerciseId);
    expect(r.body.weight.current_value).toBe(42.5);

    const db = await pool.query<{
      current_value: string;
      current_weight_kg: string;
      updated_by: string;
    }>(
      `SELECT current_value::text, current_weight_kg::text, updated_by
         FROM athlete_exercise_weights
        WHERE athlete_id = $1 AND exercise_id = $2`,
      [athleteId, seeded.exerciseId]
    );
    expect(Number(db.rows[0].current_value)).toBe(42.5);
    expect(Number(db.rows[0].current_weight_kg)).toBe(42.5);
    expect(db.rows[0].updated_by).toBe('coach');
  });

  it('rejects a non-positive weight', async () => {
    const adminId = await createAdmin();
    const adminTok = signToken({ id: adminId, role: 'admin' });
    const athleteId = await createAthlete(adminId);
    const seeded = await seedWeight(athleteId, 40);

    const r = await request(app)
      .put(`/api/admin/users/${athleteId}/weights`)
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ exercise_id: seeded.exerciseId, current_value: 0 });

    expect(r.status).toBe(400);
    expect(r.body.error).toBe('invalid_payload');
  });

  it('returns 404 for an unknown exercise', async () => {
    const adminId = await createAdmin();
    const adminTok = signToken({ id: adminId, role: 'admin' });
    const athleteId = await createAthlete(adminId);

    const r = await request(app)
      .put(`/api/admin/users/${athleteId}/weights`)
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ exercise_id: 999999, current_value: 50 });

    expect(r.status).toBe(404);
    expect(r.body.error).toBe('exercise_not_found');
  });
});
