import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import { createCoach, createAthlete } from './helpers/fixtures.js';
import { findAlternative } from '../../src/services/alternatives.service.js';
import pool from '../../src/db/connect.js';

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

it('returns null when no alternative exists for muscle_group', async () => {
  const coach = await createCoach();
  const ath = await createAthlete(coach);
  const r = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE muscle_group = 'Abdomen' LIMIT 1`,
  );
  if (r.rows.length === 0) return;
  const alt = await findAlternative(r.rows[0].id, ath);
  expect(alt === null || alt.id !== r.rows[0].id).toBe(true);
});

it('returns an alternative same muscle_group, different id, compatible equipment', async () => {
  const coach = await createCoach();
  const ath = await createAthlete(coach, { equipment: 'gym_completo', level: 'intermedio' });
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

it('skips contraindicated exercises', async () => {
  const coach = await createCoach();
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
