import pool from '../db/connect.js';
import { generateRoutine } from './routine-generation.service.js';
import { createPendingSkeleton } from './skeleton.service.js';
import { listExercisesForAthlete, listExercises } from './exercise.service.js';
import type { AthleteProfile } from '../domain/types.js';

export class PendingReviewExistsError extends Error {
  statusCode = 409;
  constructor() {
    super('pending_review skeleton or active regen job already exists');
    this.name = 'PendingReviewExistsError';
  }
}

/** Job ran for a user who never finished onboarding (no athlete_profiles row). */
export class NoAthleteProfileError extends Error {
  constructor(athleteId: string) {
    super(`no athlete profile for ${athleteId}`);
    this.name = 'NoAthleteProfileError';
  }
}

// Enqueue a background regeneration job. Rejects if the athlete already has an
// active job (queued/running) or a pending_review skeleton awaiting the coach.
export async function enqueueRegenJob(
  athleteId: string,
): Promise<{ jobId: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [athleteId]);

    const hasProfile = await client.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM athlete_profiles WHERE user_id = $1) AS exists`,
      [athleteId],
    );
    if (!hasProfile.rows[0].exists) {
      throw new NoAthleteProfileError(athleteId);
    }

    const active = await client.query<{ exists: boolean }>(
      `SELECT (
         EXISTS(SELECT 1 FROM skeleton_regen_jobs
                 WHERE athlete_id = $1 AND status IN ('queued','running'))
         OR
         EXISTS(SELECT 1 FROM athlete_skeletons
                 WHERE athlete_id = $1 AND status = 'pending_review')
       ) AS exists`,
      [athleteId],
    );
    if (active.rows[0].exists) {
      throw new PendingReviewExistsError();
    }

    const ins = await client.query<{ id: string }>(
      `INSERT INTO skeleton_regen_jobs (athlete_id, status)
       VALUES ($1, 'queued') RETURNING id`,
      [athleteId],
    );
    await client.query('COMMIT');
    return { jobId: ins.rows[0].id };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// Never re-enqueue the same athlete more often than this. Generation can be
// deterministically broken for a profile (bad catalog, model refusing); the
// sweep is a safety net, not a hot retry loop.
export const SWEEP_COOLDOWN_MS = 1_800_000;

// Reconciliation: profiles that never got any skeleton (process died
// mid-generation, or every job attempt burned out) and have no active job get
// one enqueued. Runs periodically from the worker.
export async function sweepOrphanProfiles(): Promise<{ enqueued: number }> {
  const r = await pool.query(
    `INSERT INTO skeleton_regen_jobs (athlete_id, status)
     SELECT p.user_id, 'queued'
       FROM athlete_profiles p
      WHERE NOT EXISTS (
              SELECT 1 FROM athlete_skeletons s WHERE s.athlete_id = p.user_id)
        AND NOT EXISTS (
              SELECT 1 FROM skeleton_regen_jobs j
               WHERE j.athlete_id = p.user_id
                 AND j.status IN ('queued', 'running'))
        AND NOT EXISTS (
              SELECT 1 FROM skeleton_regen_jobs j
               WHERE j.athlete_id = p.user_id
                 AND j.created_at > now() - ($1::int * interval '1 millisecond'))`,
    [SWEEP_COOLDOWN_MS],
  );
  return { enqueued: r.rowCount ?? 0 };
}

// Run the actual generation for one athlete. Used by the worker. Idempotent:
// if a pending_review skeleton already exists, returns { skeletonId: null }.
export async function runRegenJob(
  athleteId: string,
): Promise<{ skeletonId: string | null }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [athleteId]);

    const pendingR = await client.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM athlete_skeletons
         WHERE athlete_id = $1 AND status = 'pending_review'
       ) AS exists`,
      [athleteId],
    );
    if (pendingR.rows[0].exists) {
      await client.query('COMMIT');
      return { skeletonId: null };
    }

    const profileR = await client.query<AthleteProfile>(
      `SELECT * FROM athlete_profiles WHERE user_id = $1`, [athleteId],
    );
    const profile = profileR.rows[0];
    if (!profile) {
      throw new NoAthleteProfileError(athleteId);
    }
    const exercises = await listExercisesForAthlete(profile, athleteId);
    const catalog = await listExercises();
    const gen = await generateRoutine({ profile, exercises, catalog });
    const { skeletonId } = await createPendingSkeleton(
      {
        athleteId,
        generationPrompt: {
          profile, exercises_count: exercises.length, trigger: 'regen',
          source: gen.source, template: gen.templateSource, reasons: gen.reasons,
          substituted: gen.substituted,
        },
        generationRationale: gen.skeleton.rationale,
      },
      gen.skeleton,
    );
    await client.query(
      `INSERT INTO skeleton_regen_log (athlete_id, result) VALUES ($1, 'approved_gen')`,
      [athleteId],
    );
    await client.query('COMMIT');
    return { skeletonId };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
