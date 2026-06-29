import { randomUUID } from 'node:crypto';
import { uploadBufferToStorage } from './storage.service.js';
import pool from '../db/connect.js';

const EXT_BY_MIME: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};

export const ALLOWED_VIDEO_MIME = new Set(Object.keys(EXT_BY_MIME));

/**
 * Upload an exercise technique video to Firebase Storage and persist the URL on
 * the exercise. The app's native player (expo-video) needs a direct mp4/HLS URL,
 * which this produces — unlike a YouTube link, which it can't play.
 */
export async function uploadExerciseVideo(
  exerciseId: number,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const ext = EXT_BY_MIME[contentType] ?? 'mp4';
  const objectPath = `exercise-videos/${exerciseId}/${randomUUID()}.${ext}`;
  const url = await uploadBufferToStorage(objectPath, buffer, contentType);

  const r = await pool.query(
    `UPDATE exercises SET video_url = $1 WHERE id = $2 AND archived_at IS NULL RETURNING video_url`,
    [url, exerciseId],
  );
  if (r.rowCount === 0) throw new Error('exercise_not_found');

  return url;
}
