export type Gender = 'male' | 'female' | 'other';
export type Level = 'principiante' | 'intermedio' | 'avanzado';
export type Goal = 'hipertrofia' | 'fuerza' | 'recomp';
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
}

export interface Exercise {
  id: number;
  name: string;
  muscle_group: string;
  equipment: ExerciseEquipment;
  movement_pattern: MovementPattern;
  is_principal: boolean;
  is_unilateral: boolean;
  level_min: Level;
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
