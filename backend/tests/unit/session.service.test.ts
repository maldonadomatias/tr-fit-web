import { jest } from '@jest/globals';
import pg from 'pg';
import { randomUUID } from 'crypto';

process.env.OWNER_COACH_EMAIL ??= 'owner-test@example.local';
process.env.DATABASE_URL ??= 'postgres://postgres:postgres@localhost:5432/trfit_test';
process.env.JWT_SECRET ??= 'jwt-test-secret-12345';
process.env.OPENAI_API_KEY ??= 'sk-test-12345';
process.env.RESEND_API_KEY ??= 'rk-test-12345';

// Real DB pool — used by the logSet integration describe block.
// Fallthrough to real DB is opt-in via realFallbackEnabled flag, so the
// existing getActive tests (which rely on mock returns) are unaffected.
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let realFallbackEnabled = false;

interface FakeQueryResult { rows: unknown[]; rowCount: number }
type Handler = (sql: string, params?: unknown[]) => FakeQueryResult | null;
const handlers: Handler[] = [];

function pushHandler(matcher: (sql: string) => boolean, rows: unknown[]) {
  handlers.push((sql) => (matcher(sql) ? { rows, rowCount: rows.length } : null));
}

const fakePool = {
  async query(sql: string, params?: unknown[]) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    for (const h of handlers) {
      const r = h(normalized, params);
      if (r !== null) return r;
    }
    // No handler matched — fall through to the real DB only when the logSet
    // integration describe block is active (realFallbackEnabled = true).
    // getActive tests always push handlers so they never reach this branch.
    if (realFallbackEnabled) return pool.query(sql, params as unknown[]);
    return { rows: [], rowCount: 0 };
  },
};

jest.unstable_mockModule('../../src/db/connect.js', () => ({
  default: fakePool,
}));

// Stub engine.service so we don't pull in its DB dependencies.
const mockBuildToday = jest.fn(async (_a: string, _d: number) => [
  {
    exercise: { id: 1, name: 'Sentadilla', muscle_group: 'piernas', equipment: 'barra' },
    series: 3, reps: 8, suggested_value: 100, unit: 'kg', descanso: '02:00',
    slot_index: 1, role: 'principal', notes: null, flag: null,
  },
  {
    exercise: { id: 2, name: 'Curl', muscle_group: 'brazos', equipment: 'mancuerna' },
    series: 2, reps: 12, suggested_value: 10, unit: 'kg', descanso: '01:00',
    slot_index: 2, role: 'accesorio', notes: null, flag: null,
  },
]);
jest.unstable_mockModule('../../src/services/engine.service.js', () => ({
  buildTodaySession: mockBuildToday,
  TodayBlockedError: class TodayBlockedError extends Error {
    constructor(public reason: string) { super(reason); }
  },
}));

const { getActive, logSet } = await import('../../src/services/session.service.js');

beforeEach(() => {
  handlers.length = 0;
  mockBuildToday.mockClear();
});

describe('getActive', () => {
  it('returns null when no active session_log row', async () => {
    const r = await getActive('athlete-1');
    expect(r).toEqual({ session: null });
  });

  it('returns full payload with current_slot_index=0 when no sets', async () => {
    pushHandler(
      (s) => s.startsWith('SELECT id, day_of_week, started_at FROM session_logs'),
      [{ id: 'sess-1', day_of_week: 1, started_at: '2026-05-13T10:00:00Z' }],
    );
    pushHandler(
      (s) => s.startsWith('SELECT * FROM set_logs'),
      [],
    );
    const r = await getActive('athlete-1');
    expect(r.session).toMatchObject({
      id: 'sess-1',
      day_of_week: 1,
      current_slot_index: 0,
      sets: [],
    });
    expect(r.session?.items).toHaveLength(2);
  });

  it('advances current_slot_index by one after the first item meets series', async () => {
    pushHandler(
      (s) => s.startsWith('SELECT id, day_of_week, started_at FROM session_logs'),
      [{ id: 'sess-1', day_of_week: 1, started_at: '2026-05-13T10:00:00Z' }],
    );
    pushHandler(
      (s) => s.startsWith('SELECT * FROM set_logs'),
      [
        { exercise_id: 1, completed: true, set_index: 1 },
        { exercise_id: 1, completed: true, set_index: 2 },
        { exercise_id: 1, completed: true, set_index: 3 },
      ],
    );
    const r = await getActive('athlete-1');
    expect(r.session?.current_slot_index).toBe(1);
  });

  it('caps current_slot_index at items.length when all complete', async () => {
    pushHandler(
      (s) => s.startsWith('SELECT id, day_of_week, started_at FROM session_logs'),
      [{ id: 'sess-1', day_of_week: 1, started_at: '2026-05-13T10:00:00Z' }],
    );
    pushHandler(
      (s) => s.startsWith('SELECT * FROM set_logs'),
      [
        { exercise_id: 1, completed: true, set_index: 1 },
        { exercise_id: 1, completed: true, set_index: 2 },
        { exercise_id: 1, completed: true, set_index: 3 },
        { exercise_id: 2, completed: true, set_index: 1 },
        { exercise_id: 2, completed: true, set_index: 2 },
      ],
    );
    const r = await getActive('athlete-1');
    expect(r.session?.current_slot_index).toBe(2); // items.length
  });

  it('ignores incomplete sets when counting', async () => {
    pushHandler(
      (s) => s.startsWith('SELECT id, day_of_week, started_at FROM session_logs'),
      [{ id: 'sess-1', day_of_week: 1, started_at: '2026-05-13T10:00:00Z' }],
    );
    pushHandler(
      (s) => s.startsWith('SELECT * FROM set_logs'),
      [
        { exercise_id: 1, completed: true, set_index: 1 },
        { exercise_id: 1, completed: false, set_index: 2 },
        { exercise_id: 1, completed: true, set_index: 3 },
      ],
    );
    const r = await getActive('athlete-1');
    // 2 completed out of 3 series → first item NOT complete → stays at 0
    expect(r.session?.current_slot_index).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Integration tests for logSet — use the real DB (fakePool falls through).
// Per-run unique tag so seeded exercises never collide across runs.
// ---------------------------------------------------------------------------

describe('logSet – athlete_correction upsert', () => {
  const tag = String(Date.now());
  const insertedExerciseIds: number[] = [];
  let athleteId = '';
  let sessionId = '';
  let exId = 0;
  let exId2 = 0;

  beforeAll(async () => {
    realFallbackEnabled = true;

    // Seed coach user + coach_profile
    const coachR = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, 'x', 'admin') RETURNING id`,
      [`coach-sess-${tag}@test.local`],
    );
    const coachId = coachR.rows[0].id;
    await pool.query(
      `INSERT INTO coach_profiles (user_id, name) VALUES ($1, 'Coach')`,
      [coachId],
    );

    // Seed athlete user
    const athleteR = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, 'x', 'athlete') RETURNING id`,
      [`ath-sess-${tag}@test.local`],
    );
    athleteId = athleteR.rows[0].id;

    // Seed athlete_profile (coach_id required)
    await pool.query(
      `INSERT INTO athlete_profiles
         (user_id, name, gender, age, height_cm, weight_kg,
          level, goal, days_per_week, equipment, injuries, coach_id,
          phone, plan_interest, training_mode, commitment, exercise_minutes,
          days_specific, referral_source)
       VALUES ($1, 'Test', 'male', 25, 175, 75,
               'medio', 'hipertrofia', 4, 'gym_completo', '{}', $2,
               '+5491111111111', 'full', 'gym', 'normal', 60,
               '{lun,mar,jue,sab}', 'google')`,
      [athleteId, coachId],
    );

    // Seed athlete_skeleton (required by session_logs FK)
    const skR = await pool.query<{ id: string }>(
      `INSERT INTO athlete_skeletons (athlete_id, status, generation_prompt)
       VALUES ($1, 'approved', '{}'::jsonb) RETURNING id`,
      [athleteId],
    );
    const skeletonId = skR.rows[0].id;

    // Seed two exercises with unique muscle_group per run
    const ex1R = await pool.query<{ id: number }>(
      `INSERT INTO exercises
         (name, muscle_group, equipment, movement_pattern,
          level_min, contraindicated_for, modality)
       VALUES ($1, $2, 'mancuerna', 'isolation', 'principiante', '{}', 'reps')
       RETURNING id`,
      [`ExSess1-${tag}`, `mg-sess-a-${tag}`],
    );
    exId = ex1R.rows[0].id;
    insertedExerciseIds.push(exId);

    const ex2R = await pool.query<{ id: number }>(
      `INSERT INTO exercises
         (name, muscle_group, equipment, movement_pattern,
          level_min, contraindicated_for, modality)
       VALUES ($1, $2, 'mancuerna', 'isolation', 'principiante', '{}', 'reps')
       RETURNING id`,
      [`ExSess2-${tag}`, `mg-sess-b-${tag}`],
    );
    exId2 = ex2R.rows[0].id;
    insertedExerciseIds.push(exId2);

    // Seed a non-finished session_logs row
    const slR = await pool.query<{ id: string }>(
      `INSERT INTO session_logs
         (athlete_id, skeleton_id, program_week, day_of_week, total_sets_target)
       VALUES ($1, $2, 1, 1, 3)
       RETURNING id`,
      [athleteId, skeletonId],
    );
    sessionId = slR.rows[0].id;
  });

  afterAll(async () => {
    // Clean up in dependency order:
    // 1. Remove set_logs and weights that reference the athlete/exercises
    await pool.query(`DELETE FROM set_logs WHERE session_log_id = $1`, [sessionId]);
    await pool.query(`DELETE FROM athlete_exercise_weights WHERE athlete_id = $1`, [athleteId]);
    await pool.query(`DELETE FROM session_logs WHERE id = $1`, [sessionId]);
    // 2. Delete athlete first (cascade removes athlete_profiles + athlete_skeletons)
    //    so that the coach_profiles FK (athlete_profiles.coach_id) is already gone.
    await pool.query(`DELETE FROM users WHERE email = $1`, [`ath-sess-${tag}@test.local`]);
    // 3. Now safe to delete coach
    await pool.query(`DELETE FROM users WHERE email = $1`, [`coach-sess-${tag}@test.local`]);
    if (insertedExerciseIds.length > 0) {
      await pool.query(`DELETE FROM exercises WHERE id = ANY($1)`, [insertedExerciseIds]);
    }
    realFallbackEnabled = false;
    await pool.end();
  });

  it('upserts athlete_exercise_weights as athlete_correction when a set with a weight is logged', async () => {
    await logSet(sessionId, athleteId, {
      client_id: randomUUID(),
      exercise_id: exId,
      set_index: 1,
      value: 50,
      unit: 'kg',
      reps: 8,
      completed: true,
      client_ts: new Date().toISOString(),
    });
    const w = await pool.query(
      `SELECT current_value::float AS v, unit, updated_by FROM athlete_exercise_weights WHERE athlete_id=$1 AND exercise_id=$2`,
      [athleteId, exId],
    );
    expect(w.rows[0].v).toBe(50);
    expect(w.rows[0].unit).toBe('kg');
    expect(w.rows[0].updated_by).toBe('athlete_correction');
  });

  it('does NOT touch athlete_exercise_weights when the logged value is null', async () => {
    await logSet(sessionId, athleteId, {
      client_id: randomUUID(),
      exercise_id: exId2,
      set_index: 1,
      value: null,
      unit: 'kg',
      reps: 10,
      completed: true,
      client_ts: new Date().toISOString(),
    });
    const w = await pool.query(
      `SELECT count(*)::int AS n FROM athlete_exercise_weights WHERE athlete_id=$1 AND exercise_id=$2`,
      [athleteId, exId2],
    );
    expect(w.rows[0].n).toBe(0);
  });
});
