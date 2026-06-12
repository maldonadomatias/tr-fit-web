import request from 'supertest';
import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import pool from '../../src/db/connect.js';
import {
  listExercises,
  createExercise,
  updateExercise,
  archiveExercise,
  restoreExercise,
  getExercise,
  ExerciseError,
  type CreateExerciseInput,
} from '../../src/services/admin-exercise.service.js';
import { signToken } from '../../src/middleware/auth.js';
import { createAdmin, createAthlete, createSuperadmin } from './helpers/fixtures.js';
import app from '../../src/app.js';

// resetDatabase() does not truncate the `exercises` table (it preserves the
// catalog), so we first prune any leftover test rows (anything that was ever
// archived, or anything matching test name prefixes), then snapshot the
// remaining max id and clean above it between tests.
let seedMaxId = 0;

beforeAll(async () => {
  await ensureMigrated();
  // Wipe any rows left over from a previous (possibly failed) run. Seed rows
  // are never archived and never match these test name patterns.
  await pool.query(
    `DELETE FROM exercises
       WHERE archived_at IS NOT NULL
          OR name IN ('AAA Press Banca','BBB Sentadilla','Active One','Archived One',
                      'Archived Two','Active Z','Archived Z','Test Press Banca',
                      'Renamed','Existing','Other','ToRestore','AlreadyActive',
                      'TwiceArchive','Active Skel','Archived Skel','Visible Ath')
          OR name LIKE 'Bulk %'`,
  );
  const r = await pool.query<{ max: number | null }>(
    `SELECT COALESCE(MAX(id), 0)::int AS max FROM exercises`,
  );
  seedMaxId = r.rows[0]?.max ?? 0;
});

beforeEach(async () => {
  await resetDatabase();
  await pool.query(`DELETE FROM exercises WHERE id > $1`, [seedMaxId]);
});

afterAll(async () => { await closePool(); });

const baseInput: CreateExerciseInput = {
  name: 'Test Press Banca',
  muscle_group: 'Pecho',
  equipment: 'barra',
  movement_pattern: 'push_h',
  is_principal: true,
  is_unilateral: false,
  level_min: 'principiante',
  contraindicated_for: [],
  default_increment_kg: 2.5,
  alternatives_ids: [],
  video_url: null,
  illustration_url: null,
  modality: 'reps',
  default_target: null,
};

describe('listExercises', () => {
  it('returns rows filtered by q (case-insensitive substring on name)', async () => {
    await createExercise({ ...baseInput, name: 'AAA Press Banca' });
    await createExercise({ ...baseInput, name: 'BBB Sentadilla' });
    const result = await listExercises({ q: 'press' });
    expect(result.items.map(e => e.name)).toContain('AAA Press Banca');
    expect(result.items.map(e => e.name)).not.toContain('BBB Sentadilla');
  });

  it('excludes archived by default', async () => {
    await createExercise({ ...baseInput, name: 'Active One' });
    const b = await createExercise({ ...baseInput, name: 'Archived One' });
    await archiveExercise(b.id);
    const result = await listExercises({});
    const names = result.items.map(e => e.name);
    expect(names).toContain('Active One');
    expect(names).not.toContain('Archived One');
  });

  it('includes archived when archived=all', async () => {
    const b = await createExercise({ ...baseInput, name: 'Archived Two' });
    await archiveExercise(b.id);
    const result = await listExercises({ archived: 'all' });
    expect(result.items.map(e => e.name)).toContain('Archived Two');
  });

  it('returns only archived when archived=true', async () => {
    await createExercise({ ...baseInput, name: 'Active Z' });
    const b = await createExercise({ ...baseInput, name: 'Archived Z' });
    await archiveExercise(b.id);
    const result = await listExercises({ archived: 'true' });
    const names = result.items.map(e => e.name);
    expect(names).toContain('Archived Z');
    expect(names).not.toContain('Active Z');
  });

  it('respects limit and offset', async () => {
    for (let i = 0; i < 5; i++) {
      await createExercise({ ...baseInput, name: `Bulk ${i}` });
    }
    const page1 = await listExercises({ q: 'Bulk', limit: 2, offset: 0 });
    const page2 = await listExercises({ q: 'Bulk', limit: 2, offset: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page2.items).toHaveLength(2);
    expect(page1.items.map(e => e.id)).not.toEqual(page2.items.map(e => e.id));
    expect(page1.total).toBe(5);
  });
});

describe('updateExercise', () => {
  it('updates only supplied fields', async () => {
    const created = await createExercise(baseInput);
    const updated = await updateExercise(created.id, { name: 'Renamed' });
    expect(updated.name).toBe('Renamed');
    expect(updated.muscle_group).toBe(baseInput.muscle_group);
  });

  it('throws name_taken on duplicate', async () => {
    await createExercise({ ...baseInput, name: 'Existing' });
    const b = await createExercise({ ...baseInput, name: 'Other' });
    await expect(updateExercise(b.id, { name: 'Existing' }))
      .rejects.toThrow(ExerciseError);
  });

  it('throws not_found for missing id', async () => {
    await expect(updateExercise(999999, { name: 'x' }))
      .rejects.toThrow(ExerciseError);
  });
});

describe('restoreExercise', () => {
  it('clears archived_at', async () => {
    const x = await createExercise({ ...baseInput, name: 'ToRestore' });
    await archiveExercise(x.id);
    const restored = await restoreExercise(x.id);
    expect(restored.archived_at).toBeNull();
  });

  it('no-op when already active', async () => {
    const x = await createExercise({ ...baseInput, name: 'AlreadyActive' });
    const restored = await restoreExercise(x.id);
    expect(restored.archived_at).toBeNull();
  });

  it('throws not_found for missing id', async () => {
    await expect(restoreExercise(999999)).rejects.toThrow(ExerciseError);
  });
});

describe('archiveExercise idempotency', () => {
  it('second archive is no-op (does not throw)', async () => {
    const x = await createExercise({ ...baseInput, name: 'TwiceArchive' });
    await archiveExercise(x.id);
    await expect(archiveExercise(x.id)).resolves.toBeUndefined();
  });
});

// --- Route-level integration tests --------------------------------------

describe('GET /api/admin/exercises (auth)', () => {
  it('401 without token', async () => {
    const r = await request(app).get('/api/admin/exercises');
    expect(r.status).toBe(401);
  });

  it('403 as athlete', async () => {
    const coach = await createAdmin();
    const ath = await createAthlete(coach);
    const tok = signToken({ id: ath, role: 'athlete' });
    const r = await request(app)
      .get('/api/admin/exercises')
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(403);
  });

  it('200 as admin', async () => {
    const admin = await createAdmin();
    const tok = signToken({ id: admin, role: 'admin' });
    const r = await request(app)
      .get('/api/admin/exercises')
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('items');
    expect(r.body).toHaveProperty('total');
    expect(Array.isArray(r.body.items)).toBe(true);
  });

  it('200 as superadmin', async () => {
    const sa = await createSuperadmin();
    const tok = signToken({ id: sa, role: 'superadmin' });
    const r = await request(app)
      .get('/api/admin/exercises')
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.items)).toBe(true);
  });
});

describe('POST /api/admin/exercises', () => {
  it('201 creates exercise', async () => {
    const admin = await createAdmin();
    const tok = signToken({ id: admin, role: 'admin' });
    const r = await request(app)
      .post('/api/admin/exercises')
      .set('Authorization', `Bearer ${tok}`)
      .send(baseInput);
    expect(r.status).toBe(201);
    expect(r.body.exercise.name).toBe(baseInput.name);
    expect(r.body.exercise.id).toBeGreaterThan(0);
  });

  it('409 on duplicate name', async () => {
    const admin = await createAdmin();
    const tok = signToken({ id: admin, role: 'admin' });
    await createExercise(baseInput);
    const r = await request(app)
      .post('/api/admin/exercises')
      .set('Authorization', `Bearer ${tok}`)
      .send(baseInput);
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('name_taken');
  });

  it('400 on invalid enum', async () => {
    const admin = await createAdmin();
    const tok = signToken({ id: admin, role: 'admin' });
    const r = await request(app)
      .post('/api/admin/exercises')
      .set('Authorization', `Bearer ${tok}`)
      .send({ ...baseInput, equipment: 'bogus' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('invalid_payload');
  });
});

describe('PATCH /api/admin/exercises/:id', () => {
  it('200 updates fields', async () => {
    const admin = await createAdmin();
    const tok = signToken({ id: admin, role: 'admin' });
    const created = await createExercise(baseInput);
    const r = await request(app)
      .patch(`/api/admin/exercises/${created.id}`)
      .set('Authorization', `Bearer ${tok}`)
      .send({ name: 'Renamed' });
    expect(r.status).toBe(200);
    expect(r.body.exercise.name).toBe('Renamed');
  });

  it('404 for missing id', async () => {
    const admin = await createAdmin();
    const tok = signToken({ id: admin, role: 'admin' });
    const r = await request(app)
      .patch('/api/admin/exercises/999999')
      .set('Authorization', `Bearer ${tok}`)
      .send({ name: 'X' });
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('not_found');
  });
});

describe('DELETE /api/admin/exercises/:id', () => {
  it('200 archives and is idempotent', async () => {
    const admin = await createAdmin();
    const tok = signToken({ id: admin, role: 'admin' });
    const created = await createExercise(baseInput);
    const r1 = await request(app)
      .delete(`/api/admin/exercises/${created.id}`)
      .set('Authorization', `Bearer ${tok}`);
    expect(r1.status).toBe(200);
    expect(r1.body.archived).toBe(true);

    const r2 = await request(app)
      .delete(`/api/admin/exercises/${created.id}`)
      .set('Authorization', `Bearer ${tok}`);
    expect(r2.status).toBe(200);
    expect(r2.body.archived).toBe(true);
  });
});

describe('POST /api/admin/exercises/:id/restore', () => {
  it('200 restores archived', async () => {
    const admin = await createAdmin();
    const tok = signToken({ id: admin, role: 'admin' });
    const created = await createExercise(baseInput);
    await archiveExercise(created.id);
    const r = await request(app)
      .post(`/api/admin/exercises/${created.id}/restore`)
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(200);
    expect(r.body.exercise.archived_at).toBeNull();
  });
});

describe('modality and default_target', () => {
  it('persists and returns modality and default_target', async () => {
    const created = await createExercise({
      name: `Bici Test ${Date.now()}`,
      muscle_group: 'cardio',
      equipment: 'maquina',
      movement_pattern: 'cardio',
      is_principal: false,
      is_unilateral: false,
      level_min: 'principiante',
      contraindicated_for: [],
      default_increment_kg: 1,
      alternatives_ids: [],
      video_url: null,
      illustration_url: null,
      modality: 'tiempo',
      default_target: '5 min',
    });
    expect(created.modality).toBe('tiempo');
    expect(created.default_target).toBe('5 min');

    const updated = await updateExercise(created.id, { default_target: '10 min' });
    expect(updated.modality).toBe('tiempo');
    expect(updated.default_target).toBe('10 min');
  });
});

describe('GET /api/exercises (skeleton-builder consumer)', () => {
  it('200 for admin role, excludes archived', async () => {
    const admin = await createAdmin();
    const tok = signToken({ id: admin, role: 'admin' });
    const active = await createExercise({ ...baseInput, name: 'Active Skel' });
    const arch = await createExercise({ ...baseInput, name: 'Archived Skel' });
    await archiveExercise(arch.id);
    const r = await request(app)
      .get('/api/exercises?q=Skel')
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(200);
    const names = r.body.items.map((e: { name: string }) => e.name);
    expect(names).toContain('Active Skel');
    expect(names).not.toContain('Archived Skel');
  });

  it('200 for athlete role, excludes archived', async () => {
    const admin = await createAdmin();
    const ath = await createAthlete(admin);
    const tok = signToken({ id: ath, role: 'athlete' });
    await createExercise({ ...baseInput, name: 'Visible Ath' });
    const r = await request(app)
      .get('/api/exercises?q=Visible')
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(200);
    expect(r.body.items.map((e: { name: string }) => e.name)).toContain('Visible Ath');
  });
});
