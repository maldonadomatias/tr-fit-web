import request from 'supertest';
import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import pool from '../../src/db/connect.js';
import {
  createExercise,
  type CreateExerciseInput,
} from '../../src/services/admin-exercise.service.js';
import { signToken } from '../../src/middleware/auth.js';
import { createAdmin } from './helpers/fixtures.js';
import app from '../../src/app.js';

// resetDatabase() preserves the exercises catalog, so snapshot the seed max id
// and prune only the rows this suite creates.
let seedMaxId = 0;

beforeAll(async () => {
  await ensureMigrated();
  // Prune leftovers from a previous (possibly failed) run before snapshotting,
  // else their ids fall under seedMaxId and collide on name.
  await pool.query(`DELETE FROM exercises WHERE name LIKE 'ZZ %'`);
  const r = await pool.query<{ max: number | null }>(
    `SELECT COALESCE(MAX(id), 0)::int AS max FROM exercises`
  );
  seedMaxId = r.rows[0]?.max ?? 0;
});

beforeEach(async () => {
  await resetDatabase();
  await pool.query(`DELETE FROM exercises WHERE id > $1`, [seedMaxId]);
});

afterAll(async () => {
  await closePool();
});

const baseInput: CreateExerciseInput = {
  name: 'X',
  muscle_group: 'Pecho',
  equipment: 'barra',
  movement_pattern: 'push_h',
  is_principal: false,
  is_unilateral: false,
  level_min: 'principiante',
  contraindicated_for: [],
  default_increment_kg: 2.5,
  alternatives_ids: [],
  video_url: null,
  illustration_url: null,
  modality: 'reps',
  default_target: null,
  rep_cycle_threshold: 12,
};

describe('GET /api/exercises muscle_group filter', () => {
  it('filters by the exact subgroup, not the whole parent group', async () => {
    await createExercise({
      ...baseInput,
      name: 'ZZ Cuad One',
      muscle_group: 'Piernas - Cuadriceps',
    });
    await createExercise({
      ...baseInput,
      name: 'ZZ Cuad Two',
      muscle_group: 'Piernas - Cuadriceps',
    });
    await createExercise({
      ...baseInput,
      name: 'ZZ Fem One',
      muscle_group: 'Piernas - Femorales',
    });
    const tok = signToken({ id: await createAdmin(), role: 'admin' });

    const r = await request(app)
      .get('/api/exercises')
      .query({ muscle_group: 'Piernas - Cuadriceps', limit: 200 })
      .set('Authorization', `Bearer ${tok}`);

    expect(r.status).toBe(200);
    const groups = (r.body.items as { muscle_group: string }[]).map(
      (e) => e.muscle_group
    );
    expect(groups.length).toBeGreaterThan(0);
    // Every returned row is exactly the requested subgroup — no femorales.
    expect(groups.every((g) => g === 'Piernas - Cuadriceps')).toBe(true);
  });
});
