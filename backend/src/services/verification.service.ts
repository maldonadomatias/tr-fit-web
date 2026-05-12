import crypto from 'crypto';

export const TOKEN_LENGTH_BYTES = 32;

/**
 * Generate a cryptographically random token as a hex string.
 * Default 32 bytes = 64 hex chars (256 bits of entropy).
 */
export function generateToken(bytes: number = TOKEN_LENGTH_BYTES): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Hash a token with SHA-256. We store hashes in DB so leaked rows
 * cannot be used to impersonate users.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function isExpired(expiresAt: string | Date): boolean {
  const exp = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  return exp.getTime() < Date.now();
}

export function expiresIn(ms: number): Date {
  return new Date(Date.now() + ms);
}

export const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;       // 24 hr
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;             // 1 hr
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
