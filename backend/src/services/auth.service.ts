import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import pool from '../db/connect.js';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';
import type { AuthLoginResult } from '../domain/types.js';
import {
  generateToken,
  hashToken,
  expiresIn,
  isExpired,
  VERIFY_TOKEN_TTL_MS,
  RESET_TOKEN_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
} from './verification.service.js';
import {
  sendVerifyEmail,
  sendPasswordResetEmail,
} from './email.service.js';

const BCRYPT_COST = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ─── Signup ──────────────────────────────────────────────────────
export interface SignupResult {
  userId: string;
  email: string;
  emailSendFailed: boolean;
}

export async function signup(
  email: string,
  password: string,
): Promise<SignupResult> {
  const exists = await pool.query(`SELECT 1 FROM users WHERE email = $1`, [email]);
  if (exists.rowCount && exists.rowCount > 0) {
    const err = new Error('email_already_registered');
    (err as Error & { code?: string }).code = 'EMAIL_TAKEN';
    throw err;
  }

  const passwordHash = await hashPassword(password);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ins = await client.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, email_verified)
       VALUES ($1, $2, 'athlete', FALSE) RETURNING id`,
      [email, passwordHash],
    );
    const userId = ins.rows[0].id;

    const token = generateToken();
    const tokenHash = hashToken(token);
    await client.query(
      `INSERT INTO email_verifications (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresIn(VERIFY_TOKEN_TTL_MS)],
    );
    await client.query('COMMIT');

    let emailSendFailed = false;
    try {
      await sendVerifyEmail(email, token);
    } catch (e) {
      logger.error({ err: e, userId, email }, 'verify email send failed');
      emailSendFailed = true;
    }

    return { userId, email, emailSendFailed };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ─── Login ───────────────────────────────────────────────────────
export class LoginError extends Error {
  constructor(public reason: 'invalid_credentials' | 'email_not_verified') {
    super(reason);
  }
}

export interface LoginContext {
  userAgent?: string | null;
  ipAddress?: string | null;
}

export async function login(
  email: string,
  password: string,
  ctx: LoginContext = {},
): Promise<AuthLoginResult> {
  const r = await pool.query<{
    id: string; password_hash: string; role: 'athlete'|'coach'|'admin';
    email: string; email_verified: boolean;
  }>(
    `SELECT id, password_hash, role, email, email_verified
       FROM users WHERE email = $1`,
    [email],
  );
  const user = r.rows[0];
  if (!user) {
    // Run a dummy compare so non-existent users take same time as wrong-password users
    // (timing-attack mitigation against email enumeration)
    await comparePassword(password, '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid');
    throw new LoginError('invalid_credentials');
  }
  const ok = await comparePassword(password, user.password_hash);
  if (!ok) throw new LoginError('invalid_credentials');
  if (!user.email_verified) throw new LoginError('email_not_verified');

  const familyId = randomUUID();
  const refresh = generateToken();
  const refreshHash = hashToken(refresh);
  await pool.query(
    `INSERT INTO refresh_tokens
       (user_id, family_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [user.id, familyId, refreshHash, expiresIn(REFRESH_TOKEN_TTL_MS),
     ctx.userAgent ?? null, ctx.ipAddress ?? null],
  );

  const accessToken = jwt.sign(
    { id: user.id, role: user.role },
    env.JWT_SECRET as jwt.Secret,
    { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions,
  );

  return {
    accessToken,
    refreshToken: refresh,
    user: { id: user.id, email: user.email, role: user.role },
  };
}

// ─── Refresh (rotation + family revoke on reuse) ─────────────────
export class RefreshError extends Error {
  constructor(public reason: 'invalid' | 'reuse_detected' | 'expired') {
    super(reason);
  }
}

export async function refresh(
  refreshToken: string,
  ctx: LoginContext = {},
): Promise<{ accessToken: string; refreshToken: string }> {
  const tokenHash = hashToken(refreshToken);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const r = await client.query<{
      id: string; user_id: string; family_id: string;
      expires_at: string; revoked_at: string | null;
    }>(
      `SELECT id, user_id, family_id, expires_at, revoked_at
         FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
      [tokenHash],
    );
    const row = r.rows[0];
    if (!row) {
      await client.query('COMMIT');
      throw new RefreshError('invalid');
    }

    if (row.revoked_at) {
      // REUSE DETECTED — revoke entire family
      await client.query(
        `UPDATE refresh_tokens SET revoked_at = NOW()
          WHERE family_id = $1 AND revoked_at IS NULL`,
        [row.family_id],
      );
      await client.query('COMMIT');
      logger.warn({ userId: row.user_id, familyId: row.family_id }, 'refresh token reuse detected');
      throw new RefreshError('reuse_detected');
    }

    if (isExpired(row.expires_at)) {
      await client.query('COMMIT');
      throw new RefreshError('expired');
    }

    // Rotate: revoke current, insert new in same family
    const newRefresh = generateToken();
    const newHash = hashToken(newRefresh);
    const newR = await client.query<{ id: string }>(
      `INSERT INTO refresh_tokens
         (user_id, family_id, token_hash, expires_at, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [row.user_id, row.family_id, newHash, expiresIn(REFRESH_TOKEN_TTL_MS),
       ctx.userAgent ?? null, ctx.ipAddress ?? null],
    );
    await client.query(
      `UPDATE refresh_tokens SET revoked_at = NOW(), replaced_by = $1 WHERE id = $2`,
      [newR.rows[0].id, row.id],
    );

    // Get user role for new access token
    const u = await client.query<{ role: 'athlete'|'coach'|'admin' }>(
      `SELECT role FROM users WHERE id = $1`, [row.user_id],
    );
    await client.query('COMMIT');

    const accessToken = jwt.sign(
      { id: row.user_id, role: u.rows[0].role },
      env.JWT_SECRET as jwt.Secret,
      { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions,
    );

    return { accessToken, refreshToken: newRefresh };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// ─── Logout ──────────────────────────────────────────────────────
export async function logout(refreshToken: string): Promise<void> {
  const tokenHash = hashToken(refreshToken);
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW()
      WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash],
  );
}

// ─── Email verification ─────────────────────────────────────────
export class VerifyError extends Error {
  constructor(public reason: 'invalid' | 'expired' | 'used') {
    super(reason);
  }
}

export async function verifyEmail(token: string): Promise<{ userId: string }> {
  const tokenHash = hashToken(token);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query<{
      id: string; user_id: string; expires_at: string; used_at: string | null;
    }>(
      `SELECT id, user_id, expires_at, used_at
         FROM email_verifications WHERE token_hash = $1 FOR UPDATE`,
      [tokenHash],
    );
    const row = r.rows[0];
    if (!row) throw new VerifyError('invalid');
    if (row.used_at) throw new VerifyError('used');
    if (isExpired(row.expires_at)) throw new VerifyError('expired');

    await client.query(
      `UPDATE email_verifications SET used_at = NOW() WHERE id = $1`,
      [row.id],
    );
    await client.query(
      `UPDATE users
          SET email_verified = TRUE, email_verified_at = NOW()
        WHERE id = $1`,
      [row.user_id],
    );
    await client.query('COMMIT');
    return { userId: row.user_id };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function resendVerification(userId: string): Promise<{
  emailSendFailed: boolean;
  alreadyVerified?: boolean;
}> {
  const u = await pool.query<{ email: string; email_verified: boolean }>(
    `SELECT email, email_verified FROM users WHERE id = $1`, [userId],
  );
  const user = u.rows[0];
  if (!user) throw new VerifyError('invalid');
  if (user.email_verified) return { emailSendFailed: false, alreadyVerified: true };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Invalidate previous
    await client.query(
      `UPDATE email_verifications SET used_at = NOW()
        WHERE user_id = $1 AND used_at IS NULL`,
      [userId],
    );
    const token = generateToken();
    await client.query(
      `INSERT INTO email_verifications (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, hashToken(token), expiresIn(VERIFY_TOKEN_TTL_MS)],
    );
    await client.query('COMMIT');

    let emailSendFailed = false;
    try {
      await sendVerifyEmail(user.email, token);
    } catch (e) {
      logger.error({ err: e, userId }, 'resend verify email failed');
      emailSendFailed = true;
    }
    return { emailSendFailed };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// ─── Forgot / Reset password ────────────────────────────────────
export async function forgotPassword(
  email: string,
  requestedIp: string | null = null,
): Promise<void> {
  const r = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE email = $1`, [email],
  );
  const user = r.rows[0];
  if (!user) return; // Silently return — anti-enumeration

  const token = generateToken();
  await pool.query(
    `INSERT INTO password_resets (user_id, token_hash, expires_at, requested_ip)
     VALUES ($1, $2, $3, $4)`,
    [user.id, hashToken(token), expiresIn(RESET_TOKEN_TTL_MS), requestedIp],
  );
  await sendPasswordResetEmail(email, token);
}

export class ResetError extends Error {
  constructor(public reason: 'invalid' | 'used' | 'expired') {
    super(reason);
  }
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const tokenHash = hashToken(token);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query<{
      id: string; user_id: string; expires_at: string; used_at: string | null;
    }>(
      `SELECT id, user_id, expires_at, used_at
         FROM password_resets WHERE token_hash = $1 FOR UPDATE`,
      [tokenHash],
    );
    const row = r.rows[0];
    if (!row) throw new ResetError('invalid');
    if (row.used_at) throw new ResetError('used');
    if (isExpired(row.expires_at)) throw new ResetError('expired');

    const newHash = await hashPassword(newPassword);
    await client.query(
      `UPDATE users SET password_hash = $1 WHERE id = $2`,
      [newHash, row.user_id],
    );
    await client.query(
      `UPDATE password_resets SET used_at = NOW() WHERE id = $1`, [row.id],
    );
    // Revoke ALL active refresh tokens for this user (anti-takeover)
    await client.query(
      `UPDATE refresh_tokens SET revoked_at = NOW()
        WHERE user_id = $1 AND revoked_at IS NULL`,
      [row.user_id],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
