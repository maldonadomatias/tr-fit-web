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

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
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
