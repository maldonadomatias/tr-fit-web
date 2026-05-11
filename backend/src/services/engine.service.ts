import pool from '../db/connect.js';
import { roundToNearest25 } from './progression-helpers.js';
import type {
  Exercise, PeriodizationConfig, SessionItem, SkeletonSlot, SlotRole,
} from '../domain/types.js';

export class TodayBlockedError extends Error {
  constructor(public reason: 'awaiting_review' | 'rm_test_required' | 'no_program') {
    super(reason);
  }
}

export async function buildTodaySession(
  athleteId: string,
  dayOfWeek: number,
): Promise<SessionItem[]> {
  const stateR = await pool.query<{
    current_week: number; rm_test_blocking: boolean;
    active_skeleton_id: string | null;
  }>(
    `SELECT current_week, rm_test_blocking, active_skeleton_id
       FROM athlete_program_state WHERE athlete_id = $1`,
    [athleteId],
  );
  if (!stateR.rows[0] || !stateR.rows[0].active_skeleton_id) {
    throw new TodayBlockedError('awaiting_review');
  }
  const state = stateR.rows[0];
  if (state.rm_test_blocking) throw new TodayBlockedError('rm_test_required');

  const cfgR = await pool.query<PeriodizationConfig>(
    `SELECT * FROM periodization_config WHERE week_number = $1`,
    [state.current_week],
  );
  const cfg = cfgR.rows[0];
  if (!cfg) throw new Error(`no periodization_config for week ${state.current_week}`);

  const slotsR = await pool.query<SkeletonSlot>(
    `SELECT * FROM skeleton_slots
       WHERE skeleton_id = $1 AND day_of_week = $2
       ORDER BY slot_index ASC`,
    [state.active_skeleton_id, dayOfWeek],
  );
  if (slotsR.rows.length === 0) return [];

  const exerciseIds = slotsR.rows.map((s) => s.exercise_id);
  const exR = await pool.query<Exercise>(
    `SELECT * FROM exercises WHERE id = ANY($1::int[])`, [exerciseIds],
  );
  const exById = new Map(exR.rows.map((e) => [e.id, e]));

  const wR = await pool.query<{
    exercise_id: number; current_weight_kg: number | null;
    current_reps_text: string | null;
  }>(
    `SELECT exercise_id, current_weight_kg, current_reps_text
       FROM athlete_exercise_weights
      WHERE athlete_id = $1 AND exercise_id = ANY($2::int[])`,
    [athleteId, exerciseIds],
  );
  const wByEx = new Map(wR.rows.map((r) => [r.exercise_id, r]));

  let rmByEx = new Map<number, number>();
  if (cfg.principal_pct_rm && cfg.principal_rm_source) {
    const rmR = await pool.query<{ exercise_id: number; value_kg: string }>(
      `SELECT exercise_id, value_kg::text
         FROM rm_tests
        WHERE athlete_id = $1 AND program_week = $2
          AND exercise_id = ANY($3::int[])`,
      [athleteId, cfg.principal_rm_source, exerciseIds],
    );
    rmByEx = new Map(rmR.rows.map((r) => [r.exercise_id, Number(r.value_kg)]));
  }

  return slotsR.rows.map((slot) => buildItem(slot, exById, wByEx, rmByEx, cfg));
}

function buildItem(
  slot: SkeletonSlot,
  exById: Map<number, Exercise>,
  wByEx: Map<number, { current_weight_kg: number | null; current_reps_text: string | null }>,
  rmByEx: Map<number, number>,
  cfg: PeriodizationConfig,
): SessionItem {
  const exercise = exById.get(slot.exercise_id)!;

  if (slot.role === 'principal') {
    if (cfg.is_rm_test) {
      return baseItem(exercise, slot.role, slot.slot_index, null,
        cfg.principal_series, cfg.principal_reps, cfg.principal_descanso, 'rm_test');
    }
    if (cfg.principal_pct_rm && cfg.principal_rm_source) {
      const rm = rmByEx.get(slot.exercise_id);
      if (!rm) {
        return baseItem(exercise, slot.role, slot.slot_index, null,
          cfg.principal_series, cfg.principal_reps, cfg.principal_descanso, 'missing_rm');
      }
      const computed = rm * Number(cfg.principal_pct_rm);
      const weight =
        exercise.equipment === 'barra' || exercise.equipment === 'smith'
          ? roundToNearest25(computed)
          : Math.round(computed);
      return baseItem(exercise, slot.role, slot.slot_index, weight,
        cfg.principal_series, cfg.principal_reps, cfg.principal_descanso);
    }
    // use_casilleros for principal
    const w = wByEx.get(slot.exercise_id);
    return baseItem(exercise, slot.role, slot.slot_index,
      w?.current_weight_kg ?? null,
      cfg.principal_series, cfg.principal_reps, cfg.principal_descanso);
  }

  // accesorio
  const w = wByEx.get(slot.exercise_id);
  return baseItem(
    exercise, slot.role, slot.slot_index, w?.current_weight_kg ?? null,
    cfg.accesorio_series,
    w?.current_reps_text ?? cfg.accesorio_reps,
    cfg.accesorio_descanso,
  );
}

function baseItem(
  ex: Exercise, role: SlotRole, slotIndex: number,
  weight: number | null, series: number, reps: string, descanso: string,
  flag?: 'rm_test' | 'missing_rm',
): SessionItem {
  return {
    exercise: ex, role, slot_index: slotIndex,
    weight_kg: weight === null ? null : Number(weight),
    series, reps, descanso, ...(flag ? { flag } : {}),
  };
}
