import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import pool from '../../src/db/connect.js';

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

it('athlete_exercise_weights is keyed by (athlete, exercise, scheme)', async () => {
  const cols = await pool.query<{ column_name: string; column_default: string | null }>(
    `SELECT column_name, column_default
       FROM information_schema.columns
      WHERE table_name = 'athlete_exercise_weights' AND column_name = 'scheme'`,
  );
  expect(cols.rowCount).toBe(1);
  expect(cols.rows[0].column_default).toContain('normal');

  const pk = await pool.query<{ column_name: string }>(
    `SELECT kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'athlete_exercise_weights'
        AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY kcu.ordinal_position`,
  );
  expect(pk.rows.map((r) => r.column_name)).toEqual(
    expect.arrayContaining(['athlete_id', 'exercise_id', 'scheme']),
  );
  expect(pk.rowCount).toBe(3);
});
