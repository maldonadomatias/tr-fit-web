import pool from '../db/connect.js';
import type {
  AthleteSkeleton, SkeletonSlot, SkeletonStatus,
} from '../domain/types.js';
import type { AiSkeletonOutput } from '../domain/schemas.js';

export interface CreateSkeletonInput {
  athleteId: string;
  generationPrompt: unknown;
  generationRationale: string | null;
  rejectionFeedback?: string;
}

export async function createPendingSkeleton(
  input: CreateSkeletonInput,
  aiOutput: AiSkeletonOutput,
): Promise<{ skeletonId: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sk = await client.query<AthleteSkeleton>(
      `INSERT INTO athlete_skeletons
         (athlete_id, status, generated_by, generation_prompt,
          generation_rationale, rejection_feedback)
       VALUES ($1, 'pending_review', 'ai', $2::jsonb, $3, $4)
       RETURNING id`,
      [
        input.athleteId,
        JSON.stringify(input.generationPrompt),
        input.generationRationale,
        input.rejectionFeedback ?? null,
      ],
    );
    const skeletonId = sk.rows[0].id;

    for (const day of aiOutput.days) {
      for (const slot of day.slots) {
        // Per-slot prescription only applies to accessories; null it out for
        // principals/warmups so they keep periodization / warmup defaults even
        // if the model returned stray values.
        const isAccessory = slot.role === 'accesorio';
        await client.query(
          `INSERT INTO skeleton_slots
             (skeleton_id, day_of_week, slot_index, exercise_id, role, notes,
              series, reps, descanso)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            skeletonId, day.day_index, slot.slot_index,
            slot.exercise_id, slot.role, slot.notes,
            isAccessory ? slot.series ?? null : null,
            isAccessory ? slot.reps ?? null : null,
            isAccessory ? slot.descanso ?? null : null,
          ],
        );
      }
    }

    for (const day of aiOutput.days) {
      await client.query(
        `INSERT INTO skeleton_days (skeleton_id, day_of_week, focus)
         VALUES ($1, $2, $3)
         ON CONFLICT (skeleton_id, day_of_week) DO NOTHING`,
        [skeletonId, day.day_index, day.focus],
      );
    }

    await client.query('COMMIT');
    return { skeletonId };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function findSkeleton(id: string): Promise<AthleteSkeleton | null> {
  const { rows } = await pool.query<AthleteSkeleton>(
    `SELECT * FROM athlete_skeletons WHERE id = $1`, [id],
  );
  return rows[0] ?? null;
}

export async function listSlots(skeletonId: string): Promise<SkeletonSlot[]> {
  const { rows } = await pool.query<SkeletonSlot>(
    `SELECT s.*, e.name AS exercise_name, e.muscle_group, e.equipment
     FROM skeleton_slots s
     JOIN exercises e ON e.id = s.exercise_id
     WHERE s.skeleton_id = $1
     ORDER BY s.day_of_week, s.slot_index`,
    [skeletonId],
  );
  return rows;
}

export interface ApproveSkeletonOptions {
  startDate?: Date;
  /** Exercise/notes/set-scheme edits made by the admin before approving. */
  slotOverrides?: {
    slot_id: string;
    exercise_id: number;
    notes?: string | null;
    // Per-slot set scheme (accessories only at runtime). When a key is present
    // it is written as-is; null clears it back to the periodization default.
    series?: number | null;
    reps?: string | null;
    descanso?: string | null;
  }[];
  /** Full reordering of the skeleton's slots (every slot, new day/index). */
  slotOrder?: {
    slot_id: string;
    day_of_week: number;
    slot_index: number;
  }[];
  /** Slots removed by the admin before approving. */
  deletedSlotIds?: string[];
  /** Brand-new slots added by the admin (client-generated id) before approving. */
  addedSlots?: {
    id: string;
    day_of_week: number;
    exercise_id: number;
    role: string;
    notes?: string | null;
    series?: number | null;
    reps?: string | null;
    descanso?: string | null;
  }[];
}

export async function approveSkeleton(
  skeletonId: string,
  reviewerId: string,
  opts: ApproveSkeletonOptions = {},
): Promise<void> {
  const startDate = opts.startDate ?? new Date();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sk = await client.query<AthleteSkeleton>(
      `SELECT * FROM athlete_skeletons WHERE id = $1 FOR UPDATE`, [skeletonId],
    );
    if (!sk.rows[0]) throw new Error('skeleton not found');
    if (sk.rows[0].status !== 'pending_review') {
      throw new Error(`cannot approve skeleton in status=${sk.rows[0].status}`);
    }
    const athleteId = sk.rows[0].athlete_id;

    // Remove slots the admin deleted before any other edit so downstream
    // reorder/seeding never sees them.
    if (opts.deletedSlotIds && opts.deletedSlotIds.length > 0) {
      await client.query(
        `DELETE FROM skeleton_slots
          WHERE id = ANY($1::uuid[]) AND skeleton_id = $2`,
        [opts.deletedSlotIds, skeletonId],
      );
    }

    // Insert brand-new slots the admin added. Done before reorder & seeding so
    // they participate in the final ordering and get a weight row. The client
    // supplies the id; slot_index is assigned per day as max(existing)+1 (and
    // re-set later if the admin also reordered).
    if (opts.addedSlots && opts.addedSlots.length > 0) {
      const nextIndex = new Map<number, number>();
      for (const a of opts.addedSlots) {
        let idx = nextIndex.get(a.day_of_week);
        if (idx === undefined) {
          const maxR = await client.query<{ max: number | null }>(
            `SELECT MAX(slot_index) AS max FROM skeleton_slots
              WHERE skeleton_id = $1 AND day_of_week = $2`,
            [skeletonId, a.day_of_week],
          );
          idx = (maxR.rows[0]?.max ?? 0) + 1;
        }
        if (idx > 12) {
          throw new Error('day exceeds 12 slots');
        }
        nextIndex.set(a.day_of_week, idx + 1);
        await client.query(
          `INSERT INTO skeleton_slots
             (id, skeleton_id, day_of_week, slot_index, exercise_id, role, notes,
              series, reps, descanso)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            a.id, skeletonId, a.day_of_week, idx, a.exercise_id, a.role,
            a.notes ?? null, a.series ?? null, a.reps ?? null, a.descanso ?? null,
          ],
        );
      }
    }

    // Apply admin edits (exercise swap / notes / set scheme) before reorder &
    // seeding so downstream queries (weight seeding) see the final exercise set.
    for (const ov of opts.slotOverrides ?? []) {
      // Only touch the set-scheme columns when the edit actually carried them
      // (accessories); otherwise a plain swap/notes edit would wipe them.
      const hasScheme =
        'series' in ov || 'reps' in ov || 'descanso' in ov;
      if (hasScheme) {
        await client.query(
          `UPDATE skeleton_slots
              SET exercise_id = $1, notes = $2,
                  series = $3, reps = $4, descanso = $5
            WHERE id = $6 AND skeleton_id = $7`,
          [
            ov.exercise_id, ov.notes ?? null,
            ov.series ?? null, ov.reps ?? null, ov.descanso ?? null,
            ov.slot_id, skeletonId,
          ],
        );
      } else {
        await client.query(
          `UPDATE skeleton_slots
              SET exercise_id = $1, notes = $2
            WHERE id = $3 AND skeleton_id = $4`,
          [ov.exercise_id, ov.notes ?? null, ov.slot_id, skeletonId],
        );
      }
    }

    // Apply admin reordering. Delete + re-insert (preserving the final
    // exercise_id/role/notes) to avoid intermediate
    // UNIQUE(skeleton_id, day_of_week, slot_index) violations.
    if (opts.slotOrder && opts.slotOrder.length > 0) {
      const orderIds = opts.slotOrder.map((s) => s.slot_id);
      const moved = await client.query<{
        id: string;
        exercise_id: number;
        role: string;
        notes: string | null;
        series: number | null;
        reps: string | null;
        descanso: string | null;
      }>(
        `DELETE FROM skeleton_slots
          WHERE id = ANY($1::uuid[]) AND skeleton_id = $2
          RETURNING id, exercise_id, role, notes, series, reps, descanso`,
        [orderIds, skeletonId],
      );
      if (moved.rowCount !== orderIds.length) {
        throw new Error('slot_order references slot not in skeleton');
      }
      const byId = new Map(moved.rows.map((r) => [r.id, r]));
      for (const s of opts.slotOrder) {
        const orig = byId.get(s.slot_id)!;
        await client.query(
          `INSERT INTO skeleton_slots
             (id, skeleton_id, day_of_week, slot_index, exercise_id, role, notes,
              series, reps, descanso)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            orig.id, skeletonId, s.day_of_week, s.slot_index,
            orig.exercise_id, orig.role, orig.notes,
            orig.series, orig.reps, orig.descanso,
          ],
        );
      }
    }

    // Supersede previous approved skeleton (if any)
    await client.query(
      `UPDATE athlete_skeletons
         SET status = 'superseded'
       WHERE athlete_id = $1 AND status = 'approved'`,
      [athleteId],
    );

    // Approve this one
    await client.query(
      `UPDATE athlete_skeletons
         SET status = 'approved',
             reviewed_at = NOW(),
             reviewed_by = $1
       WHERE id = $2`,
      [reviewerId, skeletonId],
    );

    // Upsert program_state
    await client.query(
      `INSERT INTO athlete_program_state
         (athlete_id, active_skeleton_id, current_week, start_date, rm_test_blocking)
       VALUES ($1, $2, 1, $3::date, false)
       ON CONFLICT (athlete_id) DO UPDATE
         SET active_skeleton_id = EXCLUDED.active_skeleton_id`,
      [athleteId, skeletonId, startDate.toISOString().slice(0, 10)],
    );

    // Seed athlete_exercise_weights with NULL for every distinct exercise in slots
    await client.query(
      `INSERT INTO athlete_exercise_weights
         (athlete_id, exercise_id, current_weight_kg, current_reps_text, updated_by)
       SELECT $1, exercise_id, NULL, NULL, 'athlete_initial'
       FROM (SELECT DISTINCT exercise_id FROM skeleton_slots WHERE skeleton_id = $2) s
       ON CONFLICT (athlete_id, exercise_id) DO NOTHING`,
      [athleteId, skeletonId],
    );

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function rejectSkeleton(
  skeletonId: string,
  reviewerId: string,
  feedback: string,
): Promise<void> {
  await pool.query(
    `UPDATE athlete_skeletons
       SET status = 'rejected',
           rejection_feedback = $1,
           reviewed_at = NOW(),
           reviewed_by = $2
     WHERE id = $3 AND status = 'pending_review'`,
    [feedback, reviewerId, skeletonId],
  );
}

export async function listPendingForCoach(coachId: string) {
  const { rows } = await pool.query(
    `SELECT id, athlete_id, created_at, generation_rationale, athlete_name
       FROM (
         SELECT DISTINCT ON (s.athlete_id)
                s.id, s.athlete_id, s.created_at, s.generation_rationale,
                ap.name AS athlete_name
           FROM athlete_skeletons s
           JOIN athlete_profiles ap ON ap.user_id = s.athlete_id
          WHERE s.status = 'pending_review' AND ap.coach_id = $1
          ORDER BY s.athlete_id, s.created_at DESC
       ) t
      ORDER BY created_at ASC`,
    [coachId],
  );
  return rows;
}

export async function findActiveByAthlete(athleteId: string): Promise<{
  state: { current_week: number; rm_test_blocking: boolean } | null;
  skeleton: AthleteSkeleton | null;
  status: SkeletonStatus | null;
}> {
  const stateR = await pool.query(
    `SELECT current_week, rm_test_blocking, active_skeleton_id
       FROM athlete_program_state WHERE athlete_id = $1`,
    [athleteId],
  );
  if (!stateR.rows[0]) {
    // Maybe a pending skeleton without state yet
    const pendingR = await pool.query<AthleteSkeleton>(
      `SELECT * FROM athlete_skeletons
        WHERE athlete_id = $1
        ORDER BY created_at DESC LIMIT 1`,
      [athleteId],
    );
    return {
      state: null, skeleton: pendingR.rows[0] ?? null,
      status: pendingR.rows[0]?.status ?? null,
    };
  }
  const state = stateR.rows[0];
  if (!state.active_skeleton_id) {
    return { state, skeleton: null, status: null };
  }
  const sk = await findSkeleton(state.active_skeleton_id);
  return { state, skeleton: sk, status: sk?.status ?? null };
}
