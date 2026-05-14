export type Gender = 'male' | 'female' | 'other';
export type Level = 'nunca' | 'bajo' | 'medio' | 'avanzado' | 'muy_avanzado';
export type Goal = 'hipertrofia' | 'fuerza' | 'recomp' | 'perdida_grasa';
export type PlanInterest = 'basico' | 'full' | 'premium';
export type TrainingMode = 'gym' | 'casa' | 'mixto';
export type Commitment = 'suave' | 'normal' | 'exigente';
export type Weekday = 'lun' | 'mar' | 'mie' | 'jue' | 'vie' | 'sab' | 'dom';
export type ReferralSource = 'instagram' | 'facebook' | 'google' | 'amigo' | 'otro';
export type Equipment =
  | 'gym_completo' | 'gym_basico' | 'casa_basica' | 'solo_bw';
export type ExerciseEquipment =
  | 'barra' | 'mancuerna' | 'maquina' | 'polea' | 'smith'
  | 'bw' | 'pesa_rusa' | 'elastico' | 'disco';
export type MovementPattern =
  | 'squat' | 'hinge' | 'push_h' | 'push_v' | 'pull_h' | 'pull_v'
  | 'isolation' | 'core' | 'cardio';
export type SkeletonStatus =
  | 'pending_review' | 'approved' | 'rejected' | 'superseded';
export type SlotRole = 'principal' | 'accesorio';

export interface AthleteProfile {
  user_id: string;
  name: string;
  gender: Gender;
  age: number;
  height_cm: number;
  weight_kg: number;
  level: Level;
  goal: Goal;
  days_per_week: number;
  equipment: Equipment;
  injuries: string[];
  coach_id: string | null;
  onboarded_at: string;
  phone: string | null;
  plan_interest: PlanInterest | null;
  training_mode: TrainingMode | null;
  commitment: Commitment | null;
  exercise_minutes: number | null;
  days_specific: Weekday[] | null;
  referral_source: ReferralSource | null;
  sport_focus: string | null;
}

export type ExerciseLevel = 'principiante' | 'intermedio' | 'avanzado';

export interface Exercise {
  id: number;
  name: string;
  muscle_group: string;
  equipment: ExerciseEquipment;
  movement_pattern: MovementPattern;
  is_principal: boolean;
  is_unilateral: boolean;
  level_min: ExerciseLevel;
  contraindicated_for: string[];
  default_increment_kg: number;
  alternatives_ids: number[];
  video_url: string | null;
  illustration_url: string | null;
}

export interface PeriodizationConfig {
  week_number: number;
  block_label: string;
  is_rm_test: boolean;
  is_deload: boolean;
  principal_series: number;
  principal_reps: string;
  principal_descanso: string;
  principal_pct_rm: number | null;
  principal_rm_source: 10 | 20 | 30 | null;
  principal_use_casilleros: boolean;
  accesorio_series: number;
  accesorio_reps: string;
  accesorio_descanso: string;
  notes: string | null;
}

export interface SkeletonSlot {
  id: string;
  skeleton_id: string;
  day_of_week: number;
  slot_index: number;
  exercise_id: number;
  role: SlotRole;
  exercise_name?: string;
  muscle_group?: string;
  equipment?: string;
}

export interface AthleteSkeleton {
  id: string;
  athlete_id: string;
  status: SkeletonStatus;
  generated_by: 'ai' | 'coach';
  generation_prompt: unknown;
  generation_rationale: string | null;
  rejection_feedback: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

export interface SessionItem {
  exercise: Exercise;
  role: SlotRole;
  slot_index: number;
  weight_kg: number | null;
  series: number;
  reps: string;
  descanso: string;
  flag?: 'rm_test' | 'missing_rm';
}

export interface RefreshToken {
  id: string;
  user_id: string;
  family_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  replaced_by: string | null;
  created_at: string;
  user_agent: string | null;
  ip_address: string | null;
}

export interface EmailVerification {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface PasswordReset {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
  requested_ip: string | null;
}

export interface AuthLoginResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; role: 'athlete' | 'coach' | 'admin' };
}

export interface SessionLog {
  id: string;
  athlete_id: string;
  skeleton_id: string;
  program_week: number;
  day_of_week: number;
  started_at: string;
  finished_at: string | null;
  fatigue_rating: 'suave' | 'normal' | 'exigente' | null;
  total_sets_target: number | null;
  total_sets_completed: number | null;
  compliance_pct: number | null;
  total_volume_kg: number | null;
  duration_seconds: number | null;
  client_id: string | null;
}

export interface SetLog {
  id: string;
  athlete_id: string;
  exercise_id: number;
  week: number;
  day_of_week: number;
  set_index: number;
  weight_kg: number | null;
  reps: number | null;
  completed: boolean;
  logged_at: string;
  session_log_id: string | null;
  client_id: string | null;
  client_ts: string | null;
  rpe: number | null;
  synced_at: string;
}

export interface CoachAlert {
  id: string;
  athlete_id: string;
  coach_id: string;
  type: 'sos_pain' | 'sos_machine' | 'rpe_flag' | 'rm_skipped' | 'rm_week_starting';
  severity: 'red' | 'yellow' | 'info';
  exercise_id: number | null;
  session_log_id: string | null;
  payload: unknown;
  read_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface SessionSummary {
  totalVolumeKg: number;
  setsCompleted: number;
  setsTarget: number;
  compliancePct: number;
  durationSeconds: number;
  newPRs: Array<{ exerciseId: number; name: string; kg: number; reps: number }>;
}

export interface AthleteMeasurement {
  id: string;
  athlete_id: string;
  measured_at: string;
  chest_cm: string | null;
  waist_cm: string | null;
  hip_cm: string | null;
  thigh_cm: string | null;
  calf_cm: string | null;
  bicep_cm: string | null;
  body_weight_kg: string | null;
  source: 'onboarding' | 'manual' | 'coach';
  created_at: string;
}

export type { MeasurementPayload } from './schemas.js';

export type NotificationType =
  | 'session_reminder'
  | 'session_missed'
  | 'week_start'
  | 'skeleton_approved'
  | 'sos_resolved'
  | 'rm_test_week';

export type NotificationPrefs = Record<NotificationType, boolean>;

export interface PushToken {
  id: string;
  user_id: string;
  token: string;
  platform: 'ios' | 'android' | 'web';
  last_seen_at: string;
  created_at: string;
}

export interface NotificationLogRow {
  id: string;
  user_id: string;
  type: NotificationType;
  sent_at: string;
  payload: Record<string, unknown> | null;
  delivery_status: 'sent' | 'failed' | 'token_invalid';
}
