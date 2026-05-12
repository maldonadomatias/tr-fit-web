export type Role = 'athlete' | 'coach' | 'admin';

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

export interface PendingSkeleton {
  id: string;
  athlete_id: string;
  athlete_name: string;
  created_at: string;
  generation_rationale: string | null;
}

export interface SkeletonSlot {
  id: string;
  day_of_week: number;
  slot_index: number;
  exercise_id: number;
  role: 'principal' | 'accesorio';
  exercise_name?: string;
  muscle_group?: string;
  equipment?: string;
}

export interface AthleteSkeleton {
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

export interface SkeletonDetail {
  skeleton: AthleteSkeleton;
  slots: SkeletonSlot[];
  profile: {
    name: string;
    gender: 'male' | 'female' | 'other';
    age: number;
    height_cm: number;
    weight_kg: number;
    level: 'nunca' | 'bajo' | 'medio' | 'avanzado' | 'muy_avanzado';
    goal: 'hipertrofia' | 'fuerza' | 'recomp' | 'perdida_grasa';
    days_per_week: number;
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
