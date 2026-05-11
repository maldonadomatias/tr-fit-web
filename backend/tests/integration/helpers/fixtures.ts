import bcrypt from 'bcrypt';
import pool from '../../../src/db/connect.js';
import type { AthleteProfile } from '../../../src/domain/types.js';
import {
  generateToken, hashToken, expiresIn, VERIFY_TOKEN_TTL_MS,
} from '../../../src/services/verification.service.js';

/**
 * Default values for new required onboarding columns introduced in migration 012.
 * Exposed for reuse in tests that need to insert athlete profiles directly.
 */
export const profileExtras = {
  phone: '+5491111111111',
  plan_interest: 'full' as const,
  training_mode: 'gym' as const,
  commitment: 'normal' as const,
  exercise_minutes: 60,
  days_specific: ['lun', 'mar', 'jue', 'sab'] as const,
  referral_source: 'google' as const,
};

/**
 * Distinct, valid weekday presets sized to match `days_per_week`.
 * Used so fixtures satisfy the CHECK constraint (cardinality + uniqueness).
 */
export const DAY_PRESETS: Record<number, string[]> = {
  2: ['lun', 'jue'],
  3: ['lun', 'mie', 'vie'],
  4: ['lun', 'mar', 'jue', 'sab'],
  5: ['lun', 'mar', 'mie', 'jue', 'vie'],
  6: ['lun', 'mar', 'mie', 'jue', 'vie', 'sab'],
};

export async function createCoach(): Promise<string> {
  const hash = await bcrypt.hash('test-pass', 4);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, $2, 'coach') RETURNING id`,
    [`coach-${Date.now()}@test.local`, hash],
  );
  await pool.query(
    `INSERT INTO coach_profiles (user_id, name) VALUES ($1, $2)`,
    [rows[0].id, 'Coach Test'],
  );
  return rows[0].id;
}

export async function createAthlete(
  coachId: string,
  override: Partial<AthleteProfile> = {},
): Promise<string> {
  const hash = await bcrypt.hash('test-pass', 4);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, $2, 'athlete') RETURNING id`,
    [`ath-${Date.now()}-${Math.random()}@test.local`, hash],
  );
  const id = rows[0].id;
  const daysPerWeek = override.days_per_week ?? 4;
  const days = DAY_PRESETS[daysPerWeek] ?? profileExtras.days_specific;
  await pool.query(
    `INSERT INTO athlete_profiles
       (user_id, name, gender, age, height_cm, weight_kg, level, goal,
        days_per_week, equipment, injuries, coach_id,
        phone, plan_interest, training_mode, commitment, exercise_minutes,
        days_specific, referral_source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
             $13, $14, $15, $16, $17, $18, $19)`,
    [
      id, override.name ?? 'Atleta Test',
      override.gender ?? 'male', override.age ?? 30,
      override.height_cm ?? 175, override.weight_kg ?? 75,
      override.level ?? 'medio', override.goal ?? 'hipertrofia',
      daysPerWeek,
      override.equipment ?? 'gym_completo',
      override.injuries ?? [],
      coachId,
      override.phone ?? profileExtras.phone,
      override.plan_interest ?? profileExtras.plan_interest,
      override.training_mode ?? profileExtras.training_mode,
      override.commitment ?? profileExtras.commitment,
      override.exercise_minutes ?? profileExtras.exercise_minutes,
      override.days_specific ?? days,
      override.referral_source ?? profileExtras.referral_source,
    ],
  );
  return id;
}

export async function signupUserInDb(
  email: string,
  password: string,
  verified: boolean = false,
): Promise<{ id: string; verifyToken: string }> {
  const hash = await bcrypt.hash(password, 4);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role, email_verified, email_verified_at)
     VALUES ($1, $2, 'athlete', $3, $4) RETURNING id`,
    [email, hash, verified, verified ? new Date() : null],
  );
  const id = rows[0].id;

  const token = generateToken();
  await pool.query(
    `INSERT INTO email_verifications (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [id, hashToken(token), expiresIn(VERIFY_TOKEN_TTL_MS)],
  );
  return { id, verifyToken: token };
}

export async function verifiedAthleteUser(
  email: string = `vuser-${Date.now()}-${Math.random()}@test.local`,
): Promise<{ id: string; email: string; password: string }> {
  const password = 'test-pass-1234';
  const { id } = await signupUserInDb(email, password, true);
  return { id, email, password };
}
