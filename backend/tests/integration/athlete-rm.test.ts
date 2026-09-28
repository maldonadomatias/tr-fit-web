import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import { createAdmin, createAthlete } from './helpers/fixtures.js';
import {
  createPendingSkeleton,
  approveSkeleton,
} from '../../src/services/skeleton.service.js';
import {
  listAthleteRms,
  listMissingPrincipalRms,
  setAthleteRm,
} from '../../src/services/admin.service.js';
import pool from '../../src/db/connect.js';

beforeAll(async () => {
  await ensureMigrated();
});
beforeEach(async () => {
  await resetDatabase();
});
afterAll(async () => {
  await closePool();
});

async function twoPrincipals() {
  const p = await pool.query<{ id: number; name: string }>(
    `SELECT id, name FROM exercises
      WHERE is_principal = TRUE AND equipment = 'barra'
      ORDER BY id
      LIMIT 2`
  );
  const a = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE is_principal = FALSE LIMIT 1`
  );
  if (p.rows.length < 2 || !a.rows[0]) {
    throw new Error('seed exercises missing');
  }
  return {
    withRm: p.rows[0],
    missing: p.rows[1],
    accessoryId: a.rows[0].id,
  };
}

async function skeletonWith(
  athleteId: string,
  coachId: string,
  exerciseIds: number[]
) {
  const ai = {
    rationale: 'r',
    days: exerciseIds.map((exerciseId, i) => ({
      day_index: i + 1,
      focus: `Day${i + 1}`,
      slots: [
        {
          slot_index: 1,
          exercise_id: exerciseId,
          role: 'principal' as const,
          notes: null,
          series: null,
          reps: null,
          descanso: null,
        },
      ],
    })),
  };
  const { skeletonId } = await createPendingSkeleton(
    { athleteId, generationPrompt: {}, generationRationale: 'r' },
    ai
  );
  await approveSkeleton(skeletonId, coachId);
}

async function setWeek(athleteId: string, week: number) {
  await pool.query(
    `UPDATE athlete_program_state SET current_week = $1 WHERE athlete_id = $2`,
    [week, athleteId]
  );
}

describe('missing principal RMs', () => {
  it('lists the routine principal that has no source-week RM', async () => {
    const coach = await createAdmin();
    const ath = await createAthlete(coach);
    const { withRm, missing, accessoryId } = await twoPrincipals();
    await skeletonWith(ath, coach, [withRm.id, missing.id]);
    await setWeek(ath, 13);

    await pool.query(
      `INSERT INTO rm_tests (athlete_id, exercise_id, program_week, value_kg, unit)
       VALUES ($1, $2, 10, 100, 'kg'), ($1, $3, 10, 40, 'ladrillos')`,
      [ath, withRm.id, accessoryId]
    );

    const gaps = await listMissingPrincipalRms(ath);
    expect(gaps).toEqual([
      {
        exercise_id: missing.id,
        exercise_name: missing.name,
        program_week: 10,
        unit: 'kg',
      },
    ]);

    const recorded = await listAthleteRms(ath);
    expect(recorded.map((r) => r.exercise_id).sort()).toEqual(
      [withRm.id, accessoryId].sort()
    );
  });

  it('does not ask for a future RM source week', async () => {
    const coach = await createAdmin();
    const ath = await createAthlete(coach);
    const { withRm, missing } = await twoPrincipals();
    await skeletonWith(ath, coach, [withRm.id, missing.id]);
    await setWeek(ath, 1);

    expect(await listMissingPrincipalRms(ath)).toEqual([]);
  });

  it('drops the gap once the coach sets that RM', async () => {
    const coach = await createAdmin();
    const ath = await createAthlete(coach);
    const { withRm, missing } = await twoPrincipals();
    await skeletonWith(ath, coach, [withRm.id, missing.id]);
    await setWeek(ath, 13);
    await pool.query(
      `INSERT INTO rm_tests (athlete_id, exercise_id, program_week, value_kg, unit)
       VALUES ($1, $2, 10, 100, 'kg')`,
      [ath, withRm.id]
    );

    await setAthleteRm(
      ath,
      {
        exerciseId: missing.id,
        programWeek: 10,
        valueKg: 150,
        coachNote: 'RM que no se guardó',
      },
      'coach@test.local'
    );

    expect(await listMissingPrincipalRms(ath)).toEqual([]);
    const row = (await listAthleteRms(ath)).find(
      (r) => r.exercise_id === missing.id
    );
    expect(row?.value_kg).toBe(150);
    expect(row?.program_week).toBe(10);
    expect(row?.coach_note).toBe('RM que no se guardó');
  });
});
