import { z } from 'zod';

export const onboardingPayload = z.object({
  name: z.string().min(1).max(100),
  gender: z.enum(['male', 'female', 'other']),
  age: z.number().int().min(12).max(100),
  height_cm: z.number().int().min(100).max(250),
  weight_kg: z.number().min(30).max(250),
  level: z.enum(['principiante', 'intermedio', 'avanzado']),
  goal: z.enum(['hipertrofia', 'fuerza', 'recomp']),
  days_per_week: z.number().int().min(3).max(6),
  equipment: z.enum(['gym_completo', 'gym_basico', 'casa_basica', 'solo_bw']),
  injuries: z.array(z.string()).default([]),
});

export const rmPayload = z.object({
  exercise_id: z.number().int().positive(),
  value_kg: z.number().min(1).max(500),
  week: z.union([z.literal(10), z.literal(20), z.literal(30)]),
});

export const skeletonRejectPayload = z.object({
  feedback: z.string().min(5).max(2000),
});

// IA structured output schema (also used for runtime validation)
export const aiSkeletonOutput = z.object({
  rationale: z.string(),
  days: z.array(
    z.object({
      day_index: z.number().int().min(1).max(7),
      focus: z.string(),
      slots: z.array(
        z.object({
          slot_index: z.number().int().min(1).max(12),
          exercise_id: z.number().int().positive(),
          role: z.enum(['principal', 'accesorio']),
        }),
      ).min(1).max(12),
    }),
  ).min(1).max(7),
});

export type AiSkeletonOutput = z.infer<typeof aiSkeletonOutput>;
export type OnboardingPayload = z.infer<typeof onboardingPayload>;
export type RmPayload = z.infer<typeof rmPayload>;

export const signupPayload = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(200),
});

export const loginPayload = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

export const refreshPayload = z.object({
  refreshToken: z.string().min(32),
});

export const logoutPayload = z.object({
  refreshToken: z.string().min(32),
});

export const forgotPasswordPayload = z.object({
  email: z.string().email().toLowerCase(),
});

export const resetPasswordPayload = z.object({
  token: z.string().min(32),
  newPassword: z.string().min(8).max(200),
});

export type SignupPayload = z.infer<typeof signupPayload>;
export type LoginPayload = z.infer<typeof loginPayload>;
export type RefreshPayload = z.infer<typeof refreshPayload>;
export type ForgotPasswordPayload = z.infer<typeof forgotPasswordPayload>;
export type ResetPasswordPayload = z.infer<typeof resetPasswordPayload>;

export const startSessionPayload = z.object({
  day_of_week: z.number().int().min(1).max(7),
  client_id: z.string().uuid(),
});

export const setLogPayload = z.object({
  exercise_id: z.number().int().positive(),
  set_index: z.number().int().min(1).max(20),
  weight_kg: z.number().min(0).max(500).nullable(),
  reps: z.number().int().min(0).max(100).nullable(),
  completed: z.boolean(),
  rpe: z.number().min(1).max(10).nullable().optional(),
  client_id: z.string().uuid(),
  client_ts: z.string().datetime(),
});

export const syncPayload = z.object({
  sets: z.array(setLogPayload).min(1).max(200),
});

export const finishSessionPayload = z.object({
  fatigue_rating: z.enum(['suave', 'normal', 'exigente']),
});

export const alertPayload = z.object({
  type: z.enum(['sos_pain', 'sos_machine']),
  exercise_id: z.number().int().positive().optional(),
  session_log_id: z.string().uuid().optional(),
  payload: z.union([
    z.object({
      zone: z.enum(['lumbar','rodilla','hombro','cervical','cadera','otro']),
      intensity: z.number().int().min(1).max(10),
    }),
    z.object({
      switched_to_exercise_id: z.number().int().positive(),
    }),
  ]),
});

export type StartSessionPayload = z.infer<typeof startSessionPayload>;
export type SetLogPayload = z.infer<typeof setLogPayload>;
export type SyncPayload = z.infer<typeof syncPayload>;
export type FinishSessionPayload = z.infer<typeof finishSessionPayload>;
export type AlertPayload = z.infer<typeof alertPayload>;
