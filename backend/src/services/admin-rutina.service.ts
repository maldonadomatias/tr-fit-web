import pool from '../db/connect.js';
import type { AthleteSkeleton, SkeletonSlot } from '../domain/types.js';
import type {
  AdminSlotCreate,
  AdminSlotPatch,
  AdminReorderInput,
  AdminTrainingDaysInput,
} from '../domain/schemas.js';
import type { PoolClient } from 'pg';

export type AdminRutinaErrorCode =
  | 'not_found'
  | 'rutina_not_active'
  | 'invalid_exercise'
  | 'empty_patch'
  | 'regen_pending';

export class AdminRutinaError extends Error {
  constructor(
    public code: AdminRutinaErrorCode,
    message?: string
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
    days_specific: string[] | null;
  };
  has_active_session: boolean;
}

export async function getPendingSkeletonId(
  athleteId: string
): Promise<string | null> {
  const r = await pool.query<{ id: string }>(
    `SELECT id FROM athlete_skeletons
      WHERE athlete_id = $1 AND status = 'pending_review'
      ORDER BY created_at DESC
      LIMIT 1`,
    [athleteId]
  );
  return r.rows[0]?.id ?? null;
}

export async function getActiveRutina(
  athleteId: string
): Promise<RutinaDetail | null> {
  const state = await pool.query<{ active_skeleton_id: string | null }>(
    `SELECT active_skeleton_id FROM athlete_program_state WHERE athlete_id = $1`,
    [athleteId]
  );
  const skId = state.rows[0]?.active_skeleton_id;
  if (!skId) return null;

  const skR = await pool.query<AthleteSkeleton>(
    `SELECT * FROM athlete_skeletons WHERE id = $1 AND status = 'approved'`,
    [skId]
  );
  if (!skR.rows[0]) return null;

  const profR = await pool.query<{
    user_id: string;
    name: string;
    days_per_week: number;
    days_specific: string[] | null;
  }>(
    `SELECT user_id, name, days_per_week, days_specific FROM athlete_profiles
      WHERE user_id = $1`,
    [athleteId]
  );
  if (!profR.rows[0]) return null;

  const slotsR = await pool.query<SkeletonSlot>(
    `SELECT s.*, e.name AS exercise_name, e.muscle_group, e.equipment,
            e.archived_at AS exercise_archived_at
       FROM skeleton_slots s
       JOIN exercises e ON e.id = s.exercise_id
      WHERE s.skeleton_id = $1
      ORDER BY s.day_of_week, s.slot_index`,
    [skId]
  );
  const daysR = await pool.query<{ day_of_week: number; focus: string | null }>(
    `SELECT day_of_week, focus FROM skeleton_days WHERE skeleton_id = $1
      ORDER BY day_of_week`,
    [skId]
  );
  const sessR = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM session_logs
        WHERE athlete_id = $1 AND finished_at IS NULL
     ) AS exists`,
    [athleteId]
  );

  return {
    skeleton: skR.rows[0],
    slots: slotsR.rows,
    days: daysR.rows,
    profile: profR.rows[0],
    has_active_session: sessR.rows[0].exists,
  };
}

export async function changeTrainingDays(
  athleteId: string,
  input: AdminTrainingDaysInput
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      athleteId,
    ]);
    const blocked = await client.query<{ exists: boolean }>(
      `SELECT (
         EXISTS(SELECT 1 FROM skeleton_regen_jobs WHERE athlete_id = $1 AND status IN ('queued','running'))
         OR EXISTS(SELECT 1 FROM athlete_skeletons WHERE athlete_id = $1 AND status = 'pending_review')
       ) AS exists`,
      [athleteId]
    );
    if (blocked.rows[0].exists) {
      throw new AdminRutinaError('regen_pending');
    }
    const updated = await client.query(
      `UPDATE athlete_profiles
          SET days_per_week = $2, days_specific = $3
        WHERE user_id = $1`,
      [athleteId, input.days_specific.length, input.days_specific]
    );
    if (!updated.rowCount) throw new AdminRutinaError('not_found');
    await client.query(
      `INSERT INTO skeleton_regen_jobs (athlete_id, status) VALUES ($1, 'queued')`,
      [athleteId]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function assertAthleteActiveSkeleton(
  client: PoolClient,
  athleteId: string
): Promise<string> {
  const r = await client.query<{ skeleton_id: string }>(
    `SELECT s.id AS skeleton_id
       FROM athlete_program_state ps
       JOIN athlete_skeletons s
         ON s.id = ps.active_skeleton_id AND s.status = 'approved'
      WHERE ps.athlete_id = $1`,
    [athleteId]
  );
  if (!r.rows[0]) throw new AdminRutinaError('rutina_not_active');
  return r.rows[0].skeleton_id;
}

async function assertExerciseAvailable(
  client: PoolClient,
  exerciseId: number
): Promise<void> {
  const r = await client.query<{ id: number }>(
    `SELECT id FROM exercises WHERE id = $1 AND archived_at IS NULL`,
    [exerciseId]
  );
  if (!r.rows[0]) throw new AdminRutinaError('invalid_exercise');
}

async function seedAthleteExerciseWeight(
  client: PoolClient,
  athleteId: string,
  exerciseId: number
): Promise<void> {
  await client.query(
    `INSERT INTO athlete_exercise_weights
       (athlete_id, exercise_id, current_weight_kg, current_reps_text, updated_by)
     VALUES ($1, $2, NULL, NULL, 'athlete_initial')
     ON CONFLICT (athlete_id, exercise_id) DO NOTHING`,
    [athleteId, exerciseId]
  );
}

export async function createSlot(
  athleteId: string,
  input: AdminSlotCreate
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
      ]
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

async function assertSlotInActiveSkeleton(
  client: PoolClient,
  slotId: string
): Promise<{ athleteId: string; skeletonId: string }> {
  const r = await client.query<{ athlete_id: string; skeleton_id: string }>(
    `SELECT s.athlete_id, s.id AS skeleton_id
       FROM skeleton_slots sl
       JOIN athlete_skeletons s ON s.id = sl.skeleton_id
       JOIN athlete_program_state ps
         ON ps.athlete_id = s.athlete_id
        AND ps.active_skeleton_id = s.id
      WHERE sl.id = $1 AND s.status = 'approved'`,
    [slotId]
  );
  if (!r.rows[0]) throw new AdminRutinaError('rutina_not_active');
  return {
    athleteId: r.rows[0].athlete_id,
    skeletonId: r.rows[0].skeleton_id,
  };
}

export async function deleteSlot(slotId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertSlotInActiveSkeleton(client, slotId);
    await client.query(`DELETE FROM skeleton_slots WHERE id = $1`, [slotId]);
    await client.query('COMMIT');
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore — preserve original error
    }
    throw e;
  } finally {
    client.release();
  }
}

export async function updateSlot(
  slotId: string,
  patch: AdminSlotPatch
): Promise<SkeletonSlot> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { athleteId } = await assertSlotInActiveSkeleton(client, slotId);
    if (patch.exercise_id !== undefined) {
      await assertExerciseAvailable(client, patch.exercise_id);
    }
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      values.push(v);
      sets.push(`${k} = $${values.length}`);
    }
    values.push(slotId);
    const r = await client.query<SkeletonSlot>(
      `UPDATE skeleton_slots SET ${sets.join(', ')}
        WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (patch.exercise_id !== undefined) {
      await seedAthleteExerciseWeight(client, athleteId, patch.exercise_id);
    }
    await client.query('COMMIT');
    return r.rows[0];
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore — preserve original error
    }
    throw e;
  } finally {
    client.release();
  }
}

export async function reorderSlots(
  athleteId: string,
  input: AdminReorderInput
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const skId = await assertAthleteActiveSkeleton(client, athleteId);

    const totalR = await client.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM skeleton_slots WHERE skeleton_id = $1`,
      [skId]
    );
    if (totalR.rows[0].c !== input.slots.length) {
      throw new AdminRutinaError(
        'not_found',
        'reorder payload must include every slot of the skeleton'
      );
    }

    const slotIds = input.slots.map((s) => s.slot_id);
    const check = await client.query<{ id: string }>(
      `SELECT id FROM skeleton_slots
        WHERE id = ANY($1::uuid[]) AND skeleton_id = $2`,
      [slotIds, skId]
    );
    if (check.rowCount !== slotIds.length) {
      throw new AdminRutinaError('not_found', 'slot not in active skeleton');
    }

    // Use a temporary unique key (skeleton_id, id) trick: set all targeted
    // slots to (day_of_week=0, slot_index=0) to vacate the unique positions,
    // then apply the new values. day_of_week=0 is outside CHECK (1–7) so we
    // instead use a two-phase approach: first move slots OUT of the way by
    // nulling their position within a deferred constraint — but since the
    // constraint is not DEFERRABLE we delete + re-insert within the same txn.
    //
    // Delete the targeted slots, then re-insert with new positions to avoid
    // any intermediate UNIQUE(skeleton_id, day_of_week, slot_index) violation.
    const targetedSlotIds = input.slots.map((s) => s.slot_id);
    const existing = await client.query<{
      id: string;
      exercise_id: number;
      role: string;
      notes: string | null;
    }>(
      `DELETE FROM skeleton_slots
        WHERE id = ANY($1::uuid[])
        RETURNING id, exercise_id, role, notes`,
      [targetedSlotIds]
    );

    const existingById = new Map(existing.rows.map((r) => [r.id, r]));

    for (const s of input.slots) {
      const orig = existingById.get(s.slot_id);
      if (!orig) continue; // already validated above
      await client.query(
        `INSERT INTO skeleton_slots
           (id, skeleton_id, day_of_week, slot_index, exercise_id, role, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          orig.id,
          skId,
          s.day_of_week,
          s.slot_index,
          orig.exercise_id,
          orig.role,
          orig.notes,
        ]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore — preserve original error
    }
    throw e;
  } finally {
    client.release();
  }
}
