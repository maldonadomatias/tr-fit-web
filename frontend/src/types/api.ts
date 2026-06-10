export type Role = 'athlete' | 'admin' | 'superadmin';

export interface User {
  id: string;
  email: string;
  role: Role;
}

export interface AuthLoginResult {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface CoachAthlete {
  id: string;
  name: string;
  email: string;
  level: 'nunca' | 'bajo' | 'medio' | 'avanzado' | 'muy_avanzado';
  goal: 'hipertrofia' | 'fuerza' | 'recomp' | 'perdida_grasa';
  days_per_week: number;
  onboarded_at: string;
  current_week: number | null;
  skeleton_status:
    | 'pending_review'
    | 'approved'
    | 'rejected'
    | 'superseded'
    | null;
  last_session_at: string | null;
  unread_alerts_count: number;
}

export interface PendingRutina {
  id: string;
  athlete_id: string;
  athlete_name: string;
  created_at: string;
  generation_rationale: string | null;
}

export interface RutinaSlot {
  id: string;
  skeleton_id?: string;
  day_of_week: number;
  slot_index: number;
  exercise_id: number;
  role: 'calentamiento' | 'principal' | 'accesorio';
  notes?: string | null;
  exercise_name?: string;
  muscle_group?: string;
  equipment?: string;
  exercise_archived_at?: string | null;
}

export interface AthleteRutina {
  id: string;
  athlete_id: string;
  status: 'pending_review' | 'approved' | 'rejected' | 'superseded';
  generated_by: 'ai' | 'coach';
  generation_rationale: string | null;
  rejection_feedback: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

export interface RutinaDetail {
  skeleton: AthleteRutina;
  slots: RutinaSlot[];
  profile: {
    name: string;
    gender: 'male' | 'female' | 'other';
    age: number;
    height_cm: number;
    weight_kg: number;
    level: 'nunca' | 'bajo' | 'medio' | 'avanzado' | 'muy_avanzado';
    goal: 'hipertrofia' | 'fuerza' | 'recomp' | 'perdida_grasa';
    days_per_week: number;
    days_specific: ('lun' | 'mar' | 'mie' | 'jue' | 'vie' | 'sab' | 'dom')[];
    equipment: 'gym_completo' | 'gym_basico' | 'casa_basica' | 'solo_bw';
    injuries: string[];
  };
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
  source: 'onboarding' | 'manual' | 'coach';
  created_at: string;
}

export interface AthleteDetailResponse {
  profile: Record<string, unknown>;
  programState: unknown;
  activeSkeleton: { skeleton: unknown; slots: unknown[] } | null;
  recentSessions: unknown[];
  alertsCount: number;
  measurements: AthleteMeasurement[];
}

export type UserStatus = 'pending' | 'approved' | 'rejected';
export type SubscriptionTier = 'basico' | 'full' | 'premium';
export type SubscriptionStatus =
  | 'pending'
  | 'authorized'
  | 'paused'
  | 'cancelled';

export interface AdminUser {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  email_verified: boolean;
  email_verified_at: string | null;
  created_at: string;
  name: string | null;
  subscription_tier: SubscriptionTier | null;
  subscription_status: SubscriptionStatus | null;
  current_period_end: string | null;
}

export type AuditType =
  | 'user_created'
  | 'user_approved'
  | 'user_rejected'
  | 'user_deleted'
  | 'role_changed'
  | 'email_verified'
  | 'email_unverified'
  | 'subscription_created'
  | 'subscription_updated'
  | 'subscription_cancelled'
  | 'subscription_authorized'
  | 'subscription_paused';

export type ActivitySeverity = 'brand' | 'warning' | 'destructive' | null;

export interface ActivityEvent {
  id: string;
  type: AuditType;
  actor: string;
  target: string | null;
  target_id: string | null;
  meta: Record<string, unknown> | null;
  severity: ActivitySeverity;
  created_at: string;
}

export interface AdminStats {
  signups_30d: number;
  signups_delta_pct: number;
  signups_trend: number[];
  pending_count: number;
  active_subs: number;
  active_subs_delta: number;
  mrr_estimated: number;
  mrr_delta_pct: number;
  mrr_trend: number[];
  churn_pct: number;
  churn_delta_pp: number;
  verified_pct: number;
}

export type AlertResolutionAction =
  | 'swap_exercise' | 'skip_week' | 'regen_skeleton'
  | 'approve_switch' | 'revert_switch' | 'reduce_intensity'
  | 'reschedule_rm' | 'skip_rm_block' | 'acknowledge' | 'note_only';

export interface CoachAlert {
  id: string;
  type: 'sos_pain' | 'sos_machine' | 'rpe_flag' | 'rm_skipped' | 'rm_week_starting' | 'membership_expiring' | 'membership_overdue';
  severity: 'red' | 'yellow' | 'info';
  athlete_id: string;
  athlete_name: string;
  exercise_id: number | null;
  exercise_name: string | null;
  payload: Record<string, unknown>;
  read_at: string | null;
  resolved_at: string | null;
  created_at: string;
  resolution_action: AlertResolutionAction | null;
  resolution_note: string | null;
  resolved_by_email: string | null;
}

export interface AlertContext {
  alert: CoachAlert;
  suggestedAlternative: { id: number; name: string } | null;
  painHistory: { zone: string; intensity: number; created_at: string }[];
  activeSlot: {
    skeleton_slot_id: string;
    exercise_id: number;
    day_of_week: number;
  } | null;
}

export interface AlertsListResponse {
  items: CoachAlert[];
  total: number;
}

export interface AlertsListFilters {
  status?: 'open' | 'resolved' | 'all';
  type?: string;
  severity?: string;
  athleteId?: string;
}

export type Equipment =
  | 'barra' | 'mancuerna' | 'maquina' | 'polea' | 'smith'
  | 'bw' | 'pesa_rusa' | 'elastico' | 'disco';

export type MovementPattern =
  | 'squat' | 'hinge' | 'push_h' | 'push_v' | 'pull_h' | 'pull_v'
  | 'isolation' | 'core' | 'cardio';

export type ExerciseLevel = 'principiante' | 'intermedio' | 'avanzado';

export interface Exercise {
  id: number;
  name: string;
  muscle_group: string;
  equipment: Equipment;
  movement_pattern: MovementPattern;
  is_principal: boolean;
  is_unilateral: boolean;
  level_min: ExerciseLevel;
  contraindicated_for: string[];
  default_increment_kg: number;
  alternatives_ids: number[];
  video_url: string | null;
  illustration_url: string | null;
  archived_at: string | null;
}

export interface ActiveAthleteRow {
  athlete_id: string;
  name: string;
  skeleton_id: string;
  reviewed_at: string | null;
  days_per_week: number;
}

export interface RutinaDay {
  day_of_week: number;
  focus: string | null;
}

export interface ActiveRutinaDetail {
  skeleton: {
    id: string;
    athlete_id: string;
    status: string;
    created_at: string;
    reviewed_at: string | null;
  };
  slots: RutinaSlot[];
  days: RutinaDay[];
  profile: { user_id: string; name: string; days_per_week: number };
  has_active_session: boolean;
}

export interface ActiveRutinaResponse {
  rutina: ActiveRutinaDetail | null;
  pending_skeleton_id: string | null;
}

export interface SlotCreateInput {
  day_of_week: number;
  slot_index: number;
  exercise_id: number;
  role: 'calentamiento' | 'principal' | 'accesorio';
  notes: string | null;
}

export interface SlotPatchInput {
  exercise_id?: number;
  notes?: string | null;
  slot_index?: number;
  day_of_week?: number;
}

export interface ReorderInput {
  slots: { slot_id: string; day_of_week: number; slot_index: number }[];
}
