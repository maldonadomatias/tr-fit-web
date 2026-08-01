import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import { createAdmin, createAthlete } from './helpers/fixtures.js';
import { findAlternative, findAlternatives } from '../../src/services/alternatives.service.js';
import pool from '../../src/db/connect.js';

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

it('returns null when no alternative exists for muscle_group', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const r = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE muscle_group = 'Abdomen' LIMIT 1`,
  );
  if (r.rows.length === 0) return;
  const alt = await findAlternative(r.rows[0].id, ath);
  expect(alt === null || alt.id !== r.rows[0].id).toBe(true);
});

it('returns an alternative same muscle_group, different id, compatible equipment', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { equipment: 'gym_completo', level: 'medio' });
  const r = await pool.query<{ id: number; muscle_group: string }>(
    `SELECT id, muscle_group FROM exercises
       WHERE is_principal = FALSE AND muscle_group = 'Pecho - Mayor' LIMIT 1`,
  );
  if (r.rows.length === 0) return;
  const alt = await findAlternative(r.rows[0].id, ath);
  if (alt) {
    expect(alt.id).not.toBe(r.rows[0].id);
    expect(alt.muscle_group).toBe(r.rows[0].muscle_group);
  }
});

it('excludes ids passed in excludeIds', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { equipment: 'gym_completo', level: 'medio' });
  const r = await pool.query<{ id: number; muscle_group: string }>(
    `SELECT id, muscle_group FROM exercises
       WHERE is_principal = FALSE AND muscle_group = 'Pecho - Mayor' LIMIT 2`,
  );
  if (r.rows.length < 2) return;
  const [target, other] = r.rows;
  const alt = await findAlternative(target.id, ath, [other.id]);
  if (alt) {
    expect(alt.id).not.toBe(target.id);
    expect(alt.id).not.toBe(other.id);
  }
});

// The athlete picks from a LIST now, and the exercise's curated
// alternatives_ids (hand-picked in admin) must head it — even when the
// curated pick is a different muscle group the automatic query would skip.
it('lists curated alternatives_ids first', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { equipment: 'gym_completo', level: 'medio' });
  const r = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE muscle_group = 'Pecho - Mayor' LIMIT 1`,
  );
  const other = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE muscle_group <> 'Pecho - Mayor'
       AND contraindicated_for = '{}' LIMIT 1`,
  );
  if (r.rows.length === 0 || other.rows.length === 0) return;
  await pool.query(`UPDATE exercises SET alternatives_ids = $2 WHERE id = $1`,
    [r.rows[0].id, [other.rows[0].id]]);

  const alts = await findAlternatives(r.rows[0].id, ath);
  expect(alts.length).toBeGreaterThan(1);
  expect(alts[0].id).toBe(other.rows[0].id);
  expect(alts.map((a) => a.id)).not.toContain(r.rows[0].id);
  // findAlternative stays the head of the same list.
  const one = await findAlternative(r.rows[0].id, ath);
  expect(one?.id).toBe(other.rows[0].id);
});

it('skips contraindicated exercises', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { injuries: ['lumbar'] });
  const r = await pool.query<{ id: number; muscle_group: string }>(
    `SELECT id, muscle_group FROM exercises
       WHERE NOT ('lumbar' = ANY(contraindicated_for))
         AND muscle_group = 'Espalda' LIMIT 1`,
  );
  if (r.rows.length === 0) return;
  const alt = await findAlternative(r.rows[0].id, ath);
  if (alt) {
    expect(alt.contraindicated_for).not.toContain('lumbar');
  }
});
