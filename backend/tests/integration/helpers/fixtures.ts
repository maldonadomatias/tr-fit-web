import bcrypt from 'bcrypt';
import pool from '../../../src/db/connect.js';
import type { AthleteProfile } from '../../../src/domain/types.js';
import {
  generateToken, hashToken, expiresIn, VERIFY_TOKEN_TTL_MS,
} from '../../../src/services/verification.service.js';

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
  await pool.query(
    `INSERT INTO athlete_profiles
       (user_id, name, gender, age, height_cm, weight_kg, level, goal,
        days_per_week, equipment, injuries, coach_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      id, override.name ?? 'Atleta Test',
      override.gender ?? 'male', override.age ?? 30,
      override.height_cm ?? 175, override.weight_kg ?? 75,
      override.level ?? 'intermedio', override.goal ?? 'hipertrofia',
      override.days_per_week ?? 4,
      override.equipment ?? 'gym_completo',
      override.injuries ?? [],
      coachId,
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
