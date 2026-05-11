import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import { createCoach, createAthlete } from './helpers/fixtures.js';
import { createPendingSkeleton, approveSkeleton } from '../../src/services/skeleton.service.js';
import { buildTodaySession, TodayBlockedError } from '../../src/services/engine.service.js';
import pool from '../../src/db/connect.js';

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

async function pickPrincipalAndAccesorio() {
  const p = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE is_principal = TRUE AND equipment='barra' LIMIT 1`,
  );
  const a = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE is_principal = FALSE LIMIT 1`,
  );
  return { principalId: p.rows[0].id, accesorioId: a.rows[0].id };
}

async function setup4DaySkeleton(athleteId: string, coachId: string) {
  const { principalId, accesorioId } = await pickPrincipalAndAccesorio();
  const ai = {
    rationale: 'r',
    days: [1, 2, 3, 4].map((d) => ({
      day_index: d, focus: `Day${d}`,
      slots: [
        { slot_index: 1, exercise_id: principalId, role: 'principal' as const },
        { slot_index: 2, exercise_id: accesorioId, role: 'accesorio' as const },
      ],
    })),
  };
  const { skeletonId } = await createPendingSkeleton(
    { athleteId, generationPrompt: {}, generationRationale: 'r' }, ai,
  );
  await approveSkeleton(skeletonId, coachId);
  return { principalId, accesorioId, skeletonId };
}

async function setProgramWeek(athleteId: string, week: number) {
  await pool.query(
    `UPDATE athlete_program_state SET current_week = $1 WHERE athlete_id = $2`,
    [week, athleteId],
  );
}

async function setWeight(
  athleteId: string, exerciseId: number, weight: number, reps?: string,
) {
  await pool.query(
    `UPDATE athlete_exercise_weights
        SET current_weight_kg = $1,
            current_reps_text = COALESCE($2, current_reps_text),
            updated_by = 'coach'
      WHERE athlete_id = $3 AND exercise_id = $4`,
    [weight, reps ?? null, athleteId, exerciseId],
  );
}

it('throws awaiting_review when no active skeleton', async () => {
  const coach = await createCoach();
  const ath = await createAthlete(coach);
  await expect(buildTodaySession(ath, 1)).rejects.toBeInstanceOf(TodayBlockedError);
});

it('returns missing_rm flag for principal in % week without RM', async () => {
  const coach = await createCoach();
  const ath = await createAthlete(coach);
  await setup4DaySkeleton(ath, coach);
  await setProgramWeek(ath, 1); // pct=0.75 rm=30
  const session = await buildTodaySession(ath, 1);
  const principal = session.find((s) => s.role === 'principal')!;
  expect(principal.flag).toBe('missing_rm');
  expect(principal.weight_kg).toBeNull();
});

it('computes principal weight from RM × pct (week 1, 75% of RM30)', async () => {
  const coach = await createCoach();
  const ath = await createAthlete(coach);
  const { principalId } = await setup4DaySkeleton(ath, coach);
  // No RM30 yet; need to use a week that uses RM10 (e.g. week 11)
  await setProgramWeek(ath, 11);
  await pool.query(
    `INSERT INTO rm_tests (athlete_id, exercise_id, program_week, value_kg)
     VALUES ($1, $2, 10, 100)`,
    [ath, principalId],
  );
  const session = await buildTodaySession(ath, 1);
  const principal = session.find((s) => s.role === 'principal')!;
  // week 11 pct = 0.72 → 72 kg, barbell rounds to nearest 2.5 → 72.5
  expect(principal.weight_kg).toBe(72.5);
});

it('rm_test flag on week 10 even without RM', async () => {
  const coach = await createCoach();
  const ath = await createAthlete(coach);
  await setup4DaySkeleton(ath, coach);
  await setProgramWeek(ath, 10);
  const session = await buildTodaySession(ath, 1);
  const principal = session.find((s) => s.role === 'principal')!;
  expect(principal.flag).toBe('rm_test');
  expect(principal.weight_kg).toBeNull();
});

it('uses casilleros (athlete_exercise_weights) for principal in week 3', async () => {
  const coach = await createCoach();
  const ath = await createAthlete(coach);
  const { principalId } = await setup4DaySkeleton(ath, coach);
  await setProgramWeek(ath, 3);
  await setWeight(ath, principalId, 60);
  const session = await buildTodaySession(ath, 1);
  const principal = session.find((s) => s.role === 'principal')!;
  expect(principal.weight_kg).toBe(60);
});

it('accesorio uses athlete_exercise_weights and reps fallback', async () => {
  const coach = await createCoach();
  const ath = await createAthlete(coach);
  const { accesorioId } = await setup4DaySkeleton(ath, coach);
  await setProgramWeek(ath, 1);
  await setWeight(ath, accesorioId, 12, '8 a 10');
  const session = await buildTodaySession(ath, 1);
  const acc = session.find((s) => s.role === 'accesorio')!;
  expect(acc.weight_kg).toBe(12);
  expect(acc.reps).toBe('8 a 10');
});

it('blocks with rm_test_required when state.rm_test_blocking=true', async () => {
  const coach = await createCoach();
  const ath = await createAthlete(coach);
  await setup4DaySkeleton(ath, coach);
  await pool.query(
    `UPDATE athlete_program_state SET rm_test_blocking = TRUE WHERE athlete_id = $1`,
    [ath],
  );
  await expect(buildTodaySession(ath, 1)).rejects.toMatchObject({
    reason: 'rm_test_required',
  });
});
