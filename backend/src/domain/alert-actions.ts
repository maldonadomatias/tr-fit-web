// backend/src/domain/alert-actions.ts
import { z } from 'zod';

export const ALERT_RESOLUTION_ACTIONS = [
  'swap_exercise',
  'skip_week',
  'regen_skeleton',
  'approve_switch',
  'revert_switch',
  'reduce_intensity',
  'reschedule_rm',
  'skip_rm_block',
  'acknowledge',
  'note_only',
] as const;

export type AlertResolutionAction = (typeof ALERT_RESOLUTION_ACTIONS)[number];

// Keep in sync with CoachAlert['type'] in types.ts.
// Cannot derive from it — importing types.ts would create a circular dep.
export type AlertType =
  | 'sos_pain'
  | 'sos_machine'
  | 'rpe_flag'
  | 'rm_skipped'
  | 'rm_week_starting';

export const ALERT_ACTION_MATRIX: Record<AlertType, AlertResolutionAction[]> = {
  sos_pain:         ['swap_exercise', 'skip_week', 'regen_skeleton', 'note_only'],
  sos_machine:      ['approve_switch', 'revert_switch', 'swap_exercise', 'note_only'],
  rpe_flag:         ['reduce_intensity', 'skip_week', 'note_only'],
  rm_skipped:       ['reschedule_rm', 'skip_rm_block', 'note_only'],
  rm_week_starting: ['acknowledge', 'note_only'],
};

// Per-action payload schemas. Used by the resolve route to validate body.payload.
export const swapExercisePayload = z.object({
  replacement_exercise_id: z.number().int().positive(),
});
export const skipWeekPayload = z.object({}).strict();
export const regenSkeletonPayload = z.object({
  reason: z.string().min(1).max(500).optional(),
});
export const approveSwitchPayload = z.object({}).strict();
export const revertSwitchPayload = z.object({}).strict();
export const reduceIntensityPayload = z.object({
  sets_delta: z.number().int().min(-5).max(0).optional(),
  weight_pct: z.number().min(0.5).max(1.0).optional(),
  rpe_delta: z.number().int().min(-3).max(0).optional(),
}).refine(
  (v) =>
    (v.sets_delta != null && v.sets_delta < 0) ||
    (v.weight_pct != null && v.weight_pct < 1.0) ||
    (v.rpe_delta != null && v.rpe_delta < 0),
  { message: 'at least one field must express a reduction (sets_delta<0, weight_pct<1.0, or rpe_delta<0)' },
);
export const rescheduleRmPayload = z.object({
  target_week: z.number().int().min(1).max(30),
});
export const skipRmBlockPayload = z.object({}).strict();
export const acknowledgePayload = z.object({}).strict();
export const noteOnlyPayload = z.object({}).strict();

export const PAYLOAD_SCHEMA_BY_ACTION: Record<AlertResolutionAction, z.ZodTypeAny> = {
  swap_exercise: swapExercisePayload,
  skip_week: skipWeekPayload,
  regen_skeleton: regenSkeletonPayload,
  approve_switch: approveSwitchPayload,
  revert_switch: revertSwitchPayload,
  reduce_intensity: reduceIntensityPayload,
  reschedule_rm: rescheduleRmPayload,
  skip_rm_block: skipRmBlockPayload,
  acknowledge: acknowledgePayload,
  note_only: noteOnlyPayload,
};

export function isActionAllowedForType(
  type: AlertType,
  action: AlertResolutionAction,
): boolean {
  return ALERT_ACTION_MATRIX[type].includes(action);
}
