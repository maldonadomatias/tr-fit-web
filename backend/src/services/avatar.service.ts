import { randomUUID } from 'node:crypto';
import { uploadBufferToStorage } from './storage.service.js';
import pool from '../db/connect.js';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const ALLOWED_AVATAR_MIME = new Set(Object.keys(EXT_BY_MIME));

/**
 * Upload an athlete's profile picture to Firebase Storage and persist the URL.
 *
 * The object is saved with a `firebaseStorageDownloadTokens` metadata entry, which
 * yields a stable, publicly-fetchable download URL without requiring bucket-level
 * public access or storage security-rule changes — the same scheme the Firebase
 * client SDKs use for `getDownloadURL()`.
 */
export async function uploadAthleteAvatar(
  userId: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const ext = EXT_BY_MIME[contentType] ?? 'jpg';
  const objectPath = `avatars/${userId}/${randomUUID()}.${ext}`;
  const url = await uploadBufferToStorage(objectPath, buffer, contentType);

  const r = await pool.query(
    `UPDATE athlete_profiles SET avatar_url = $1 WHERE user_id = $2 RETURNING avatar_url`,
    [url, userId],
  );
  if (r.rowCount === 0) throw new Error('profile_not_found');

  return url;
}
