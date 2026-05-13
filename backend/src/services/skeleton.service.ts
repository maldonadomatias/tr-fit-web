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
        await client.query(
          `INSERT INTO skeleton_slots
             (skeleton_id, day_of_week, slot_index, exercise_id, role)
           VALUES ($1, $2, $3, $4, $5)`,
          [skeletonId, day.day_index, slot.slot_index, slot.exercise_id, slot.role],
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
    `SELECT * FROM skeleton_slots
     WHERE skeleton_id = $1
     ORDER BY day_of_week, slot_index`,
    [skeletonId],
  );
  return rows;
}

export async function approveSkeleton(
  skeletonId: string,
  reviewerId: string,
  startDate: Date = new Date(),
): Promise<void> {
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
    `SELECT s.id, s.athlete_id, s.created_at, s.generation_rationale,
            ap.name AS athlete_name
       FROM athlete_skeletons s
       JOIN athlete_profiles ap ON ap.user_id = s.athlete_id
      WHERE s.status = 'pending_review' AND ap.coach_id = $1
      ORDER BY s.created_at ASC`,
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
