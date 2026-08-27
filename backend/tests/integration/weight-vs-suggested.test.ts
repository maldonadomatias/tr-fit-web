import pool from '../../src/db/connect.js';
import { listWeightVsSuggested } from '../../src/services/progress.service.js';
import { ensureMigrated, resetDatabase, closePool } from './helpers/test-db.js';
import { createAdmin, createAthlete } from './helpers/fixtures.js';

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

async function pickExercise(): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    'SELECT id FROM exercises ORDER BY id LIMIT 1',
  );
  return rows[0].id;
}

async function seedSkeleton(athleteId: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO athlete_skeletons (athlete_id, status, generated_by, generation_prompt)
     VALUES ($1, 'approved', 'ai', '{}'::jsonb) RETURNING id`,
    [athleteId],
  );
  return rows[0].id;
}

async function seedSuggestion(
  athleteId: string, exerciseId: number, kg: number, updatedDaysAgo: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO athlete_exercise_weights
       (athlete_id, exercise_id, current_weight_kg, current_value, unit,
        current_reps_text, updated_by, updated_at)
     VALUES ($1,$2,$3,$3,'kg','8 a 10','progression_cron',$4)`,
    [athleteId, exerciseId, kg, iso(updatedDaysAgo * DAY_MS)],
  );
}

/** Una sesión con sus series. `drops` = drop_index por serie (null = normal). */
async function seedSession(
  athleteId: string, skeletonId: string, exerciseId: number,
  startedDaysAgo: number, sets: Array<{ kg: number; dropIndex: number | null }>,
): Promise<void> {
  const at = iso(startedDaysAgo * DAY_MS);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO session_logs
       (athlete_id, skeleton_id, program_week, day_of_week, started_at, finished_at,
        total_sets_target, total_sets_completed, compliance_pct, duration_seconds)
     VALUES ($1,$2,1,1,$3,$3,$4,$4,100,3600) RETURNING id`,
    [athleteId, skeletonId, at, sets.length],
  );
  const sessionId = rows[0].id;
  for (const [i, set] of sets.entries()) {
    await pool.query(
      `INSERT INTO set_logs
         (athlete_id, exercise_id, week, day_of_week, set_index, weight_kg, value, unit,
          reps, completed, session_log_id, logged_at, drop_index)
       VALUES ($1,$2,1,1,$3,$4,$4,'kg',10,TRUE,$5,$6,$7)`,
      [athleteId, exerciseId, i + 1, set.kg, sessionId, at, set.dropIndex],
    );
  }
}

async function setup() {
  const coach = await createAdmin();
  const athlete = await createAthlete(coach);
  const skeleton = await seedSkeleton(athlete);
  const exercise = await pickExercise();
  return { athlete, skeleton, exercise };
}

describe('listWeightVsSuggested', () => {
  it('ignora los drops livianos y promedia sólo la serie de trabajo', async () => {
    const { athlete, skeleton, exercise } = await setup();
    await seedSuggestion(athlete, exercise, 100, 7);
    // Serie de trabajo a 100 kg + dos drops a 60 y 40. Sin el filtro el
    // promedio daría 66,67 → un falso -33%.
    await seedSession(athlete, skeleton, exercise, 2, [
      { kg: 100, dropIndex: 1 },
      { kg: 60, dropIndex: 2 },
      { kg: 40, dropIndex: 3 },
    ]);

    const rows = await listWeightVsSuggested(athlete, 4);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].avg_used_kg)).toBeCloseTo(100);
    expect(Number(rows[0].delta_pct)).toBeCloseTo(0);
  });

  it('excluye las series previas al último ajuste del peso sugerido', async () => {
    const { athlete, skeleton, exercise } = await setup();
    // El cron subió el sugerido a 100 kg hace 3 días.
    await seedSuggestion(athlete, exercise, 100, 3);
    // Hace 10 días levantaba 80 (bajo la sugerencia vieja): no debe contar.
    await seedSession(athlete, skeleton, exercise, 10, [{ kg: 80, dropIndex: null }]);
    // Desde el ajuste levanta los 100 pedidos.
    await seedSession(athlete, skeleton, exercise, 1, [{ kg: 100, dropIndex: null }]);

    const rows = await listWeightVsSuggested(athlete, 4);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].avg_used_kg)).toBeCloseTo(100);
    expect(Number(rows[0].delta_pct)).toBeCloseTo(0);
  });

  it('no devuelve el ejercicio si no hay series bajo la sugerencia vigente', async () => {
    const { athlete, skeleton, exercise } = await setup();
    await seedSuggestion(athlete, exercise, 100, 1);
    await seedSession(athlete, skeleton, exercise, 10, [{ kg: 80, dropIndex: null }]);

    expect(await listWeightVsSuggested(athlete, 4)).toEqual([]);
  });

  it('reporta un delta negativo real cuando el atleta se queda corto', async () => {
    const { athlete, skeleton, exercise } = await setup();
    await seedSuggestion(athlete, exercise, 100, 5);
    await seedSession(athlete, skeleton, exercise, 2, [{ kg: 90, dropIndex: null }]);

    const rows = await listWeightVsSuggested(athlete, 4);
    expect(Number(rows[0].delta_pct)).toBeCloseTo(-10);
  });

  it('respeta el techo de la ventana de semanas', async () => {
    const { athlete, skeleton, exercise } = await setup();
    // Sugerencia vieja (60 días) y series de hace 40 días: dentro de la
    // sugerencia vigente, pero fuera de la ventana de 4 semanas.
    await seedSuggestion(athlete, exercise, 100, 60);
    await seedSession(athlete, skeleton, exercise, 40, [{ kg: 100, dropIndex: null }]);

    expect(await listWeightVsSuggested(athlete, 4)).toEqual([]);
  });

  it('omite ejercicios sin peso sugerido cargado', async () => {
    const { athlete, skeleton, exercise } = await setup();
    await seedSession(athlete, skeleton, exercise, 1, [{ kg: 100, dropIndex: null }]);

    expect(await listWeightVsSuggested(athlete, 4)).toEqual([]);
  });
});
