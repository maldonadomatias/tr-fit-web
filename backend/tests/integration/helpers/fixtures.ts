import bcrypt from 'bcrypt';
import pool from '../../../src/db/connect.js';
import type { AthleteProfile, Weekday } from '../../../src/domain/types.js';
import {
  generateToken, hashToken, expiresIn, VERIFY_TOKEN_TTL_MS,
} from '../../../src/services/verification.service.js';

/**
 * Default values for new required onboarding columns introduced in migration 012.
 * Exposed for reuse in tests that need to insert athlete profiles directly.
 */
export const profileExtras = {
  phone: '+5491111111111',
  plan_interest: 'full',
  training_mode: 'gym',
  commitment: 'normal',
  exercise_minutes: 60,
  referral_source: 'google',
} as const;

/**
 * Distinct, valid weekday presets sized to match `days_per_week`.
 * Used so fixtures satisfy the CHECK constraint (cardinality + uniqueness).
 */
export const DAY_PRESETS: Record<2 | 3 | 4 | 5 | 6, Weekday[]> = {
  2: ['lun', 'jue'],
  3: ['lun', 'mie', 'vie'],
  4: ['lun', 'mar', 'jue', 'sab'],
  5: ['lun', 'mar', 'mie', 'jue', 'vie'],
  6: ['lun', 'mar', 'mie', 'jue', 'vie', 'sab'],
};

export async function createAdmin(): Promise<string> {
  const hash = await bcrypt.hash('test-pass', 4);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, $2, 'admin') RETURNING id`,
    [`admin-${Date.now()}@test.local`, hash],
  );
  await pool.query(
    `INSERT INTO coach_profiles (user_id, name) VALUES ($1, $2)`,
    [rows[0].id, 'Admin Test'],
  );
  return rows[0].id;
}

export async function createSuperadmin(): Promise<string> {
  const hash = await bcrypt.hash('test-pass', 4);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, $2, 'superadmin') RETURNING id`,
    [`super-${Date.now()}@test.local`, hash],
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
  const preset = DAY_PRESETS[daysPerWeek as 2 | 3 | 4 | 5 | 6];
  if (!preset) {
    throw new Error(
      `createAthlete: no DAY_PRESETS entry for days_per_week=${daysPerWeek}`,
    );
  }
  const daysSpecific = override.days_specific ?? preset;
  if (daysSpecific.length !== daysPerWeek) {
    throw new Error(
      `createAthlete: days_specific length ${daysSpecific.length} != days_per_week ${daysPerWeek}`,
    );
  }
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
      daysSpecific,
      override.referral_source ?? profileExtras.referral_source,
    ],
  );
  // Seed an active membership so fixture athletes can pass the login payment gate.
  await pool.query(
    `INSERT INTO memberships (user_id, status, paid_until)
     VALUES ($1, 'active', 'infinity') ON CONFLICT (user_id) DO NOTHING`,
    [id],
  );
  return id;
}

/** Set (or upsert) an athlete's membership for tests. */
export async function setMembership(
  userId: string,
  paidUntil: string | null, // ISO, 'infinity', or null
  status: 'active' | 'expiring' | 'expired' | 'cancelled' = 'active',
): Promise<void> {
  await pool.query(
    `INSERT INTO memberships (user_id, status, paid_until)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET status = $2, paid_until = $3, updated_at = now()`,
    [userId, status, paidUntil],
  );
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
  // Seed an active membership so this "enabled athlete" passes the login gate.
  await pool.query(
    `INSERT INTO memberships (user_id, status, paid_until)
     VALUES ($1, 'active', 'infinity') ON CONFLICT (user_id) DO NOTHING`,
    [id],
  );
  return { id, email, password };
}
