export {};
// Admin working weights are per (exercise, scheme): GET lists one row per
// bucket, PUT with scheme=dropset only touches dropset, and omitting scheme
// defaults to the normal bucket.
const { resetDatabase, ensureMigrated, closePool } =
  await import('./helpers/test-db.js');
const { signToken } = await import('../../src/middleware/auth.js');
const { createAdmin, createAthlete } = await import('./helpers/fixtures.js');
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

async function setup(): Promise<{
  adminToken: string;
  athleteId: string;
  exerciseId: number;
}> {
  const adminId = await createAdmin();
  const adminToken = signToken({ id: adminId, role: 'admin' });
  const athleteId = await createAthlete(adminId);
  const ex = await pool.query<{ id: number }>(
    `SELECT id FROM exercises LIMIT 1`
  );
  return { adminToken, athleteId, exerciseId: ex.rows[0].id };
}

async function seedWeights(athleteId: string, exerciseId: number) {
  await pool.query(
    `INSERT INTO athlete_exercise_weights
       (athlete_id, exercise_id, current_weight_kg, current_value, unit,
        updated_by, scheme)
     VALUES ($1, $2, 20, 20, 'kg', 'coach', 'normal'),
            ($1, $2, 12, 12, 'kg', 'coach', 'dropset')
     ON CONFLICT (athlete_id, exercise_id, scheme) DO UPDATE
       SET current_value = EXCLUDED.current_value,
           current_weight_kg = EXCLUDED.current_weight_kg`,
    [athleteId, exerciseId]
  );
}

async function readWeights(athleteId: string, exerciseId: number) {
  const r = await pool.query<{ scheme: string; current_value: string }>(
    `SELECT scheme, current_value::text FROM athlete_exercise_weights
      WHERE athlete_id = $1 AND exercise_id = $2`,
    [athleteId, exerciseId]
  );
  return new Map(r.rows.map((row) => [row.scheme, Number(row.current_value)]));
}

describe('GET/PUT /api/admin/users/:id/weights per scheme', () => {
  it('GET /admin/users/:id/weights returns one row per scheme', async () => {
    const { adminToken, athleteId, exerciseId } = await setup();
    await seedWeights(athleteId, exerciseId);

    const r = await request(app)
      .get(`/api/admin/users/${athleteId}/weights`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(r.status).toBe(200);
    const rows = r.body.weights.filter(
      (w: { exercise_id: number }) => w.exercise_id === exerciseId
    );
    expect(rows).toHaveLength(2);
    const byScheme = new Map(
      rows.map((w: { scheme: string; current_value: number }) => [
        w.scheme,
        w.current_value,
      ])
    );
    expect(byScheme.get('normal')).toBe(20);
    expect(byScheme.get('dropset')).toBe(12);
  });

  it('PUT with scheme=dropset only touches the dropset bucket', async () => {
    const { adminToken, athleteId, exerciseId } = await setup();
    await seedWeights(athleteId, exerciseId);

    const r = await request(app)
      .put(`/api/admin/users/${athleteId}/weights`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        exercise_id: exerciseId,
        current_value: 14,
        scheme: 'dropset',
      });

    expect(r.status).toBe(200);
    const after = await readWeights(athleteId, exerciseId);
    expect(after.get('dropset')).toBe(14);
    expect(after.get('normal')).toBe(20);
  });

  it('PUT without scheme defaults to the normal bucket', async () => {
    const { adminToken, athleteId, exerciseId } = await setup();
    await seedWeights(athleteId, exerciseId);

    const r = await request(app)
      .put(`/api/admin/users/${athleteId}/weights`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ exercise_id: exerciseId, current_value: 25 });

    expect(r.status).toBe(200);
    const after = await readWeights(athleteId, exerciseId);
    expect(after.get('normal')).toBe(25);
    expect(after.get('dropset')).toBe(12);
  });

  it('PUT rejects an unknown scheme', async () => {
    const { adminToken, athleteId, exerciseId } = await setup();
    const r = await request(app)
      .put(`/api/admin/users/${athleteId}/weights`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        exercise_id: exerciseId,
        current_value: 25,
        scheme: 'superserie',
      });
    expect(r.status).toBe(400);
  });
});
