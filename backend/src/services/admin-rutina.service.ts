import pool from '../db/connect.js';
import type { AthleteSkeleton, SkeletonSlot } from '../domain/types.js';
import type { AdminSlotCreate } from '../domain/schemas.js';
import type { PoolClient } from 'pg';

export type AdminRutinaErrorCode =
  | 'not_found'
  | 'rutina_not_active'
  | 'invalid_exercise'
  | 'empty_patch';

export class AdminRutinaError extends Error {
  constructor(
    public code: AdminRutinaErrorCode,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export interface ActiveAthleteRow {
  athlete_id: string;
  name: string;
  skeleton_id: string;
  reviewed_at: string | null;
  days_per_week: number;
}

export async function listActiveAthletes(opts: {
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: ActiveAthleteRow[]; total: number }> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;
  const q = opts.q ? `%${opts.q.toLowerCase()}%` : null;

  const params: unknown[] = [];
  // Inner-joins drop athletes without active_skeleton_id / no program_state.
  // That is intentional: this endpoint lists athletes with a fully-activated routine.
  let where = `s.status = 'approved' AND ps.active_skeleton_id = s.id`;
  if (q) {
    params.push(q);
    where += ` AND LOWER(ap.name) LIKE $${params.length}`;
  }

  const totalSql = `
    SELECT COUNT(*)::int AS c
      FROM athlete_skeletons s
      JOIN athlete_program_state ps ON ps.athlete_id = s.athlete_id
      JOIN athlete_profiles ap ON ap.user_id = s.athlete_id
     WHERE ${where}`;
  const total = (await pool.query<{ c: number }>(totalSql, params)).rows[0].c;

  params.push(limit, offset);
  const sql = `
    SELECT s.athlete_id, ap.name, s.id AS skeleton_id,
           s.reviewed_at, ap.days_per_week
      FROM athlete_skeletons s
      JOIN athlete_program_state ps ON ps.athlete_id = s.athlete_id
      JOIN athlete_profiles ap ON ap.user_id = s.athlete_id
     WHERE ${where}
     ORDER BY s.reviewed_at DESC NULLS LAST
     LIMIT $${params.length - 1} OFFSET $${params.length}`;
  const { rows } = await pool.query<ActiveAthleteRow>(sql, params);
  return { items: rows, total };
}

export interface RutinaDetail {
  skeleton: AthleteSkeleton;
  slots: SkeletonSlot[];
  days: { day_of_week: number; focus: string | null }[];
  profile: {
    user_id: string;
    name: string;
    days_per_week: number;
  };
  has_active_session: boolean;
}

export async function getActiveRutina(
  athleteId: string,
): Promise<RutinaDetail | null> {
  const state = await pool.query<{ active_skeleton_id: string | null }>(
    `SELECT active_skeleton_id FROM athlete_program_state WHERE athlete_id = $1`,
    [athleteId],
  );
  const skId = state.rows[0]?.active_skeleton_id;
  if (!skId) return null;

  const skR = await pool.query<AthleteSkeleton>(
    `SELECT * FROM athlete_skeletons WHERE id = $1 AND status = 'approved'`,
    [skId],
  );
  if (!skR.rows[0]) return null;

  const profR = await pool.query<{
    user_id: string;
    name: string;
    days_per_week: number;
  }>(
    `SELECT user_id, name, days_per_week FROM athlete_profiles
      WHERE user_id = $1`,
    [athleteId],
  );
  if (!profR.rows[0]) return null;

  const slotsR = await pool.query<SkeletonSlot>(
    `SELECT s.*, e.name AS exercise_name, e.muscle_group, e.equipment
       FROM skeleton_slots s
       JOIN exercises e ON e.id = s.exercise_id
      WHERE s.skeleton_id = $1
      ORDER BY s.day_of_week, s.slot_index`,
    [skId],
  );
  const daysR = await pool.query<{ day_of_week: number; focus: string | null }>(
    `SELECT day_of_week, focus FROM skeleton_days WHERE skeleton_id = $1
      ORDER BY day_of_week`,
    [skId],
  );
  const sessR = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM session_logs
        WHERE athlete_id = $1 AND finished_at IS NULL
     ) AS exists`,
    [athleteId],
  );

  return {
    skeleton: skR.rows[0],
    slots: slotsR.rows,
    days: daysR.rows,
    profile: profR.rows[0],
    has_active_session: sessR.rows[0].exists,
  };
}

async function assertAthleteActiveSkeleton(
  client: PoolClient,
  athleteId: string,
): Promise<string> {
  const r = await client.query<{ skeleton_id: string }>(
    `SELECT s.id AS skeleton_id
       FROM athlete_program_state ps
       JOIN athlete_skeletons s
         ON s.id = ps.active_skeleton_id AND s.status = 'approved'
      WHERE ps.athlete_id = $1`,
    [athleteId],
  );
  if (!r.rows[0]) throw new AdminRutinaError('rutina_not_active');
  return r.rows[0].skeleton_id;
}

async function assertExerciseAvailable(
  client: PoolClient,
  exerciseId: number,
): Promise<void> {
  const r = await client.query<{ id: number }>(
    `SELECT id FROM exercises WHERE id = $1 AND archived_at IS NULL`,
    [exerciseId],
  );
  if (!r.rows[0]) throw new AdminRutinaError('invalid_exercise');
}

async function seedAthleteExerciseWeight(
  client: PoolClient,
  athleteId: string,
  exerciseId: number,
): Promise<void> {
  await client.query(
    `INSERT INTO athlete_exercise_weights
       (athlete_id, exercise_id, current_weight_kg, current_reps_text, updated_by)
     VALUES ($1, $2, NULL, NULL, 'athlete_initial')
     ON CONFLICT (athlete_id, exercise_id) DO NOTHING`,
    [athleteId, exerciseId],
  );
}

export async function createSlot(
  athleteId: string,
  input: AdminSlotCreate,
): Promise<SkeletonSlot> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const skId = await assertAthleteActiveSkeleton(client, athleteId);
    await assertExerciseAvailable(client, input.exercise_id);
    const r = await client.query<SkeletonSlot>(
      `INSERT INTO skeleton_slots
         (skeleton_id, day_of_week, slot_index, exercise_id, role, notes)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        skId,
        input.day_of_week,
        input.slot_index,
        input.exercise_id,
        input.role,
        input.notes ?? null,
      ],
    );
    await seedAthleteExerciseWeight(client, athleteId, input.exercise_id);
    await client.query('COMMIT');
    return r.rows[0];
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore — preserve the original error
    }
    throw e;
  } finally {
    client.release();
  }
}
