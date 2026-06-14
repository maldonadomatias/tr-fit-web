import pool from '../db/connect.js';
import { roundWeightForEquipment } from './progression-helpers.js';
import { resolveUnit } from './equipment-units.service.js';
import { applyOverridesToSlots } from './weekly-overrides.service.js';
import type { WeeklyOverride } from './weekly-overrides.service.js';
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

  const effectiveSlots = await applyOverridesToSlots(
    athleteId, state.current_week, dayOfWeek, slotsR.rows,
  );
  if (effectiveSlots.length === 0) return [];

  const exerciseIds = effectiveSlots.map((s) => s.exercise_id);
  const exR = await pool.query<Exercise>(
    `SELECT * FROM exercises WHERE id = ANY($1::int[])`, [exerciseIds],
  );
  const exById = new Map(exR.rows.map((e) => [e.id, e]));

  const wR = await pool.query<{
    exercise_id: number; current_weight_kg: number | null;
    current_value: number | null; unit: 'kg' | 'ladrillos' | null;
    current_reps_text: string | null;
  }>(
    `SELECT exercise_id,
            COALESCE(current_value, current_weight_kg) AS current_value,
            unit,
            current_weight_kg,
            current_reps_text
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

  return Promise.all(effectiveSlots.map((slot) => buildItem(athleteId, slot, exById, wByEx, rmByEx, cfg)));
}

async function buildItem(
  athleteId: string,
  slot: SkeletonSlot & { _override?: WeeklyOverride },
  exById: Map<number, Exercise>,
  wByEx: Map<number, {
    current_value: number | null; unit: 'kg' | 'ladrillos' | null;
    current_reps_text: string | null;
  }>,
  rmByEx: Map<number, number>,
  cfg: PeriodizationConfig,
): Promise<SessionItem> {
  const exercise = exById.get(slot.exercise_id)!;
  const w = wByEx.get(slot.exercise_id);
  // Profile preference (athlete_equipment_units) is source of truth for unit.
  // Falls back to equipment default. Previously prioritized AEW.unit, which
  // froze the unit to whatever was logged first and ignored later profile
  // changes (e.g. user switches polea from kg to ladrillos).
  const unit = await resolveUnit(athleteId, exercise.equipment);
  // Drop stale suggested value if the recorded unit no longer matches.
  const aewValue =
    !w?.unit || w.unit === unit ? w?.current_value ?? null : null;
  const notes = slot.notes ?? null;

  let item: SessionItem;

  if (slot.role === 'calentamiento') {
    item = buildWarmupItem(exercise, unit, slot.slot_index, notes);
  } else if (slot.role === 'principal') {
    if (cfg.is_rm_test) {
      item = baseItem(exercise, slot.role, slot.slot_index, null, unit,
        cfg.principal_series, cfg.principal_reps, cfg.principal_descanso, notes, 'rm_test');
    } else if (cfg.principal_pct_rm && cfg.principal_rm_source) {
      const rm = rmByEx.get(slot.exercise_id);
      if (!rm) {
        item = baseItem(exercise, slot.role, slot.slot_index, null, unit,
          cfg.principal_series, cfg.principal_reps, cfg.principal_descanso, notes, 'missing_rm');
      } else {
        const weight = roundWeightForEquipment(rm * Number(cfg.principal_pct_rm), exercise.equipment);
        item = baseItem(exercise, slot.role, slot.slot_index, weight, unit,
          cfg.principal_series, cfg.principal_reps, cfg.principal_descanso, notes);
      }
    } else {
      // use_casilleros for principal
      item = baseItem(exercise, slot.role, slot.slot_index,
        aewValue, unit,
        cfg.principal_series, cfg.principal_reps, cfg.principal_descanso, notes);
    }
  } else {
    // accesorio
    item = baseItem(
      exercise, slot.role, slot.slot_index, aewValue, unit,
      cfg.accesorio_series,
      w?.current_reps_text ?? cfg.accesorio_reps,
      cfg.accesorio_descanso,
      notes,
    );
  }

  return applyOverride(item, slot._override, exercise);
}

/**
 * Applies an active weekly override to an already-built SessionItem.
 * Only 'reduce_intensity' overrides reach here — 'swap' and 'skip' are
 * handled upstream by applyOverridesToSlots before buildItem is called.
 */
function applyOverride(
  item: SessionItem,
  override: WeeklyOverride | undefined,
  exercise: Exercise,
): SessionItem {
  if (!override || override.override_type !== 'reduce_intensity') return item;

  const payload = override.intensity_payload as {
    sets_delta?: number;
    weight_pct?: number;
    rpe_delta?: number;
  };

  let { series, suggested_value } = item;

  if (typeof payload.sets_delta === 'number') {
    series = Math.max(1, series + payload.sets_delta);
  }

  if (typeof payload.weight_pct === 'number' && suggested_value !== null) {
    const adjusted = suggested_value * payload.weight_pct;
    suggested_value = roundWeightForEquipment(adjusted, exercise.equipment);
  }

  // TODO: rpe_delta is recorded in weekly_overrides.intensity_payload but
  // SessionItem does not currently expose a target_rpe field. Skip for now.

  return { ...item, series, suggested_value };
}

export function buildWarmupItem(
  exercise: Exercise,
  unit: 'kg' | 'ladrillos',
  slotIndex: number,
  notes: string | null,
): SessionItem {
  const warmupTarget =
    exercise.default_target ?? (exercise.modality === 'reps' ? '10' : '');
  return baseItem(
    exercise, 'calentamiento', slotIndex, null, unit,
    2, warmupTarget, '1 min', notes,
  );
}

function baseItem(
  ex: Exercise, role: SlotRole, slotIndex: number,
  weight: number | null, unit: 'kg' | 'ladrillos',
  series: number, reps: string, descanso: string,
  notes: string | null,
  flag?: 'rm_test' | 'missing_rm',
): SessionItem {
  return {
    exercise: ex, role, slot_index: slotIndex,
    suggested_value: weight === null ? null : Number(weight),
    unit,
    series, reps, modality: ex.modality, descanso, notes,
    ...(flag ? { flag } : {}),
  };
}

/**
 * Returns the next pending program day index for the athlete,
 * computed sequentially from `session_logs` for the current
 * program_week. Always cycles within `1..days_per_week`.
 */
export async function computeNextPendingDay(athleteId: string): Promise<number> {
  const stateR = await pool.query<{
    current_week: number | null;
    active_skeleton_id: string | null;
  }>(
    `SELECT current_week, active_skeleton_id
       FROM athlete_program_state WHERE athlete_id = $1`,
    [athleteId],
  );
  const state = stateR.rows[0];

  const profileR = await pool.query<{ days_per_week: number | null }>(
    `SELECT days_per_week FROM athlete_profiles WHERE user_id = $1`,
    [athleteId],
  );
  const daysPerWeek = profileR.rows[0]?.days_per_week ?? 7;

  if (!state || !state.active_skeleton_id) {
    return 1;
  }

  const lastR = await pool.query<{ last_day: number }>(
    `SELECT COALESCE(MAX(day_of_week), 0)::int AS last_day
       FROM session_logs
      WHERE athlete_id = $1
        AND program_week = $2
        AND finished_at IS NOT NULL`,
    [athleteId, state.current_week ?? 0],
  );
  const lastDay = lastR.rows[0]?.last_day ?? 0;

  return (lastDay % daysPerWeek) + 1;
}
