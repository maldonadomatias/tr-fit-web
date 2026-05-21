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
  day_of_week: number;
  slot_index: number;
  exercise_id: number;
  role: 'principal' | 'accesorio';
  exercise_name?: string;
  muscle_group?: string;
  equipment?: string;
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

export interface CoachAlert {
  id: string;
  type: 'sos_pain' | 'sos_machine' | 'rpe_flag' | 'rm_skipped' | 'rm_week_starting';
  severity: 'red' | 'yellow' | 'info';
  athlete_name: string;
  exercise_name: string | null;
  payload: Record<string, unknown>;
  read_at: string | null;
  resolved_at: string | null;
  created_at: string;
}
