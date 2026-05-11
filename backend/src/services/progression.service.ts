import pool from '../db/connect.js';
import { env } from '../config/env.js';
import {
  advanceReps, applyIncrement, isExcludedFromAutoProgression,
  EJERCICIOS_HASTA_15,
} from './progression-helpers.js';
import type { Exercise } from '../domain/types.js';
import logger from '../utils/logger.js';

export interface ProgressionResult {
  athleteId: string;
  fromWeek: number;
  toWeek: number;
  compliance: number;
  weightsBumped: BumpRecord[];
  status: 'success' | 'skipped';
}

export interface BumpRecord {
  exercise_id: number;
  from_kg: number | null;
  to_kg: number | null;
  reps_from: string | null;
  reps_to: string;
}

export async function runWeeklyProgressionForAthlete(
  athleteId: string,
): Promise<ProgressionResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [athleteId]);

    const stateR = await client.query<{
      current_week: number; active_skeleton_id: string | null;
    }>(
      `SELECT current_week, active_skeleton_id
         FROM athlete_program_state WHERE athlete_id = $1
         FOR UPDATE`,
      [athleteId],
    );
    const state = stateR.rows[0];
    if (!state || !state.active_skeleton_id) {
      await client.query('COMMIT');
      return {
        athleteId, fromWeek: 0, toWeek: 0,
        compliance: 0, weightsBumped: [], status: 'skipped',
      };
    }
    const fromWeek = state.current_week;

    const accR = await client.query<Exercise & { slot_role: string }>(
      `SELECT e.*, s.role AS slot_role
         FROM skeleton_slots s
         JOIN exercises e ON e.id = s.exercise_id
        WHERE s.skeleton_id = $1`,
      [state.active_skeleton_id],
    );
    const seen = new Set<number>();
    const accesorios = accR.rows.filter((r) => {
      if (r.slot_role !== 'accesorio') return false;
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    const logsR = await client.query<{
      exercise_id: number; completed: boolean;
    }>(
      `SELECT exercise_id, completed FROM set_logs
        WHERE athlete_id = $1 AND week = $2`,
      [athleteId, fromWeek],
    );
    const logsByEx = new Map<number, boolean[]>();
    for (const l of logsR.rows) {
      const arr = logsByEx.get(l.exercise_id) ?? [];
      arr.push(l.completed);
      logsByEx.set(l.exercise_id, arr);
    }

    const totalSets = logsR.rows.length;
    const completedSets = logsR.rows.filter((r) => r.completed).length;
    const compliance = totalSets === 0 ? 0 : completedSets / totalSets;

    const bumped: BumpRecord[] = [];
    for (const ex of accesorios) {
      if (isExcludedFromAutoProgression(ex.name, ex.muscle_group)) continue;
      const arr = logsByEx.get(ex.id);
      if (!arr || arr.length === 0 || !arr.every(Boolean)) continue;

      const wR = await client.query<{
        current_weight_kg: string | null; current_reps_text: string | null;
      }>(
        `SELECT current_weight_kg::text, current_reps_text
           FROM athlete_exercise_weights
          WHERE athlete_id = $1 AND exercise_id = $2`,
        [athleteId, ex.id],
      );
      const w = wR.rows[0];
      if (!w) continue;

      const isHasta15 = EJERCICIOS_HASTA_15.has(ex.name);
      const currentReps = w.current_reps_text ?? '8';
      const adv = advanceReps(currentReps, isHasta15);

      let newWeight: number | null =
        w.current_weight_kg === null ? null : Number(w.current_weight_kg);
      if (adv.bumpWeight && newWeight !== null) {
        newWeight = applyIncrement(newWeight, ex);
      }

      await client.query(
        `UPDATE athlete_exercise_weights
            SET current_weight_kg = $1,
                current_reps_text = $2,
                updated_at = NOW(),
                updated_by = 'progression_cron'
          WHERE athlete_id = $3 AND exercise_id = $4`,
        [newWeight, adv.newReps, athleteId, ex.id],
      );

      bumped.push({
        exercise_id: ex.id,
        from_kg: w.current_weight_kg === null ? null : Number(w.current_weight_kg),
        to_kg: newWeight,
        reps_from: currentReps,
        reps_to: adv.newReps,
      });
    }

    let toWeek = fromWeek;
    if (compliance >= env.COMPLIANCE_THRESHOLD && fromWeek < 30) {
      toWeek = fromWeek + 1;
      const nextCfg = await client.query<{ is_rm_test: boolean }>(
        `SELECT is_rm_test FROM periodization_config WHERE week_number = $1`,
        [toWeek],
      );
      const blocking = !!nextCfg.rows[0]?.is_rm_test;
      await client.query(
        `UPDATE athlete_program_state
            SET current_week = $1,
                last_week_advanced_at = NOW(),
                rm_test_blocking = $2
          WHERE athlete_id = $3`,
        [toWeek, blocking, athleteId],
      );
    }

    await client.query(
      `INSERT INTO progression_runs
         (athlete_id, from_week, to_week, compliance, weights_bumped, status)
       VALUES ($1, $2, $3, $4, $5::jsonb, 'success')`,
      [athleteId, fromWeek, toWeek, compliance, JSON.stringify(bumped)],
    );

    await client.query('COMMIT');
    return {
      athleteId, fromWeek, toWeek, compliance,
      weightsBumped: bumped, status: 'success',
    };
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error({ err: e, athleteId }, 'progression failed for athlete');
    throw e;
  } finally {
    client.release();
  }
}

export async function runWeeklyProgressionForAll(): Promise<void> {
  const { rows } = await pool.query<{ athlete_id: string }>(
    `SELECT athlete_id FROM athlete_program_state
      WHERE active_skeleton_id IS NOT NULL`,
  );
  for (const r of rows) {
    try {
      await runWeeklyProgressionForAthlete(r.athlete_id);
    } catch (e) {
      logger.error({ err: e, athleteId: r.athlete_id }, 'progression cron error');
    }
  }
}
