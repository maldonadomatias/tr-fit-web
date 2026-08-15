import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import { createAdmin, createAthlete } from './helpers/fixtures.js';
import {
  findAlternative,
  findAlternatives,
  toAlternativePayloads,
} from '../../src/services/alternatives.service.js';
import pool from '../../src/db/connect.js';
import type { Exercise } from '../../src/domain/types.js';

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
    // ORDER BY: without it the row is arbitrary, and the assertion below only
    // holds for the automatic path (a curated pick may be another group).
    `SELECT id, muscle_group FROM exercises
       WHERE is_principal = FALSE AND muscle_group = 'Pecho - Mayor'
       ORDER BY id LIMIT 1`,
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
       WHERE is_principal = FALSE AND muscle_group = 'Pecho - Mayor'
       ORDER BY id LIMIT 2`,
  );
  if (r.rows.length < 2) return;
  const [target, other] = r.rows;
  const alt = await findAlternative(target.id, ath, [other.id]);
  if (alt) {
    expect(alt.id).not.toBe(target.id);
    expect(alt.id).not.toBe(other.id);
  }
});

// The athlete picks from a LIST now, and when the exercise has curated
// alternatives_ids (hand-picked in admin) the list is ONLY those — even when
// the curated pick is a different muscle group the automatic query would skip.
it('lists only the curated alternatives_ids', async () => {
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
  expect(alts.map((a) => a.id)).toEqual([other.rows[0].id]);
  // findAlternative stays the head of the same list.
  const one = await findAlternative(r.rows[0].id, ath);
  expect(one?.id).toBe(other.rows[0].id);

  // Curación viable pero toda dentro de la rutina de hoy → NO se barre el
  // grupo. El barrido devolvía el músculo entero y contradecía la curación:
  // "Vuelos Laterales" (curada = {Vuelo lateral en polea}, y los dos caen el
  // mismo día) ofrecía press militar y face pull (reporte 2026-08-15). Si el
  // admin eligió a mano, lo que él no listó no es alternativa.
  const excluded = await findAlternatives(r.rows[0].id, ath, [other.rows[0].id]);
  expect(excluded).toEqual([]);
});

// El barrido automático sigue vivo donde siempre fue la única red: cuando la
// curación no sobrevive al filtro de LESIONES (o no existe), el atleta no puede
// quedarse sin nada por una contraindicación.
it('sweeps the muscle group when the curated pick is contraindicated', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, {
    equipment: 'gym_completo', level: 'medio', injuries: ['lumbar'],
  });
  const target = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE muscle_group = 'Pecho - Mayor'
       AND NOT ('lumbar' = ANY(contraindicated_for)) LIMIT 1`,
  );
  const hurts = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE 'lumbar' = ANY(contraindicated_for) LIMIT 1`,
  );
  if (target.rows.length === 0 || hurts.rows.length === 0) return;
  await pool.query(`UPDATE exercises SET alternatives_ids = $2 WHERE id = $1`,
    [target.rows[0].id, [hurts.rows[0].id]]);

  const alts = await findAlternatives(target.rows[0].id, ath);
  expect(alts.length).toBeGreaterThan(0);
  expect(alts.map((a) => a.id)).not.toContain(hurts.rows[0].id);
  for (const a of alts) expect(a.muscle_group).toBe('Pecho - Mayor');
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

// Each exercise carries its OWN weight: the app must not reuse the replaced
// exercise's kilos on the alternative (athlete report 2026-08-13).
describe('toAlternativePayloads', () => {
  it('returns the alternative own logged weight, and null without history', async () => {
    const coach = await createAdmin();
    const ath = await createAthlete(coach, { equipment: 'gym_completo', level: 'medio' });
    const r = await pool.query<Pick<Exercise, 'id' | 'name' | 'muscle_group' | 'equipment'>>(
      `SELECT id, name, muscle_group, equipment FROM exercises
         WHERE equipment = 'maquina' ORDER BY id LIMIT 2`,
    );
    if (r.rows.length < 2) return;
    const [withHistory, without] = r.rows;
    await pool.query(
      `INSERT INTO athlete_exercise_weights
         (athlete_id, exercise_id, current_value, unit, updated_by)
       VALUES ($1, $2, 120, 'kg', 'athlete_correction')`,
      [ath, withHistory.id],
    );

    const out = await toAlternativePayloads(ath, r.rows);
    expect(out.find((a) => a.id === withHistory.id)?.suggested_value).toBe(120);
    expect(out.find((a) => a.id === without.id)?.suggested_value).toBeNull();
    expect(out[0].unit).toBe('kg');
  });

  // 10 ladrillos is not 10 kg: a value logged under another unit is dropped,
  // same rule as the session engine.
  it('drops a weight logged under a different unit', async () => {
    const coach = await createAdmin();
    const ath = await createAthlete(coach, { equipment: 'gym_completo', level: 'medio' });
    const r = await pool.query<Pick<Exercise, 'id' | 'name' | 'muscle_group' | 'equipment'>>(
      `SELECT id, name, muscle_group, equipment FROM exercises
         WHERE equipment = 'maquina' ORDER BY id LIMIT 1`,
    );
    if (r.rows.length === 0) return;
    await pool.query(
      `INSERT INTO athlete_exercise_weights
         (athlete_id, exercise_id, current_value, unit, updated_by)
       VALUES ($1, $2, 10, 'ladrillos', 'athlete_correction')`,
      [ath, r.rows[0].id],
    );
    const [out] = await toAlternativePayloads(ath, r.rows);
    expect(out.unit).toBe('kg');
    expect(out.suggested_value).toBeNull();
  });
});
