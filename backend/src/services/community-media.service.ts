import pool from '../db/connect.js';
import { uploadBufferToStorage, deleteFromStorage } from './storage.service.js';

export const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_THUMB_BYTES = 200 * 1024;
export const MAX_IMAGES = 4;

export interface UploadImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export interface MediaInput {
  image: UploadImage;
  thumb: UploadImage;
  width: number;
  height: number;
}

export interface StoredMedia {
  storage_path: string;
  thumb_path: string;
  url: string;
  thumb_url: string;
  width: number;
  height: number;
  position: number;
}

export class CommunityMediaError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export function validateMedia(items: MediaInput[]): void {
  if (items.length > MAX_IMAGES)
    throw new CommunityMediaError('too_many_images');
  for (const it of items) {
    if (
      !ALLOWED_IMAGE_MIME.has(it.image.mimetype) ||
      !ALLOWED_IMAGE_MIME.has(it.thumb.mimetype)
    ) {
      throw new CommunityMediaError('invalid_type');
    }
    if (it.image.size > MAX_IMAGE_BYTES)
      throw new CommunityMediaError('image_too_large');
    if (it.thumb.size > MAX_THUMB_BYTES)
      throw new CommunityMediaError('thumb_too_large');
    if (
      !Number.isInteger(it.width) ||
      !Number.isInteger(it.height) ||
      it.width <= 0 ||
      it.height <= 0
    ) {
      throw new CommunityMediaError('invalid_dimensions');
    }
  }
}

export async function deleteMediaObjects(paths: string[]): Promise<void> {
  await Promise.all(paths.map((p) => deleteFromStorage(p)));
}

/** Upload every image + thumb; on any failure delete what was already uploaded and rethrow. */
export async function uploadPostMedia(
  postId: string,
  items: MediaInput[]
): Promise<StoredMedia[]> {
  const uploaded: string[] = [];
  const out: StoredMedia[] = [];
  try {
    for (const [position, it] of items.entries()) {
      const storage_path = `community/${postId}/${position}.jpg`;
      const thumb_path = `community/${postId}/${position}_thumb.jpg`;
      const url = await uploadBufferToStorage(
        storage_path,
        it.image.buffer,
        it.image.mimetype
      );
      uploaded.push(storage_path);
      const thumb_url = await uploadBufferToStorage(
        thumb_path,
        it.thumb.buffer,
        it.thumb.mimetype
      );
      uploaded.push(thumb_path);
      out.push({
        storage_path,
        thumb_path,
        url,
        thumb_url,
        width: it.width,
        height: it.height,
        position,
      });
    }
    return out;
  } catch (e) {
    await deleteMediaObjects(uploaded);
    throw e;
  }
}

/** Called before a user row is deleted: FK cascade removes rows, not Storage objects. */
export async function deleteUserCommunityMedia(userId: string): Promise<void> {
  const r = await pool.query<{ storage_path: string; thumb_path: string }>(
    `SELECT m.storage_path, m.thumb_path
       FROM community_post_media m
       JOIN community_posts p ON p.id = m.post_id
      WHERE p.author_id = $1`,
    [userId]
  );
  await deleteMediaObjects(
    r.rows.flatMap((row) => [row.storage_path, row.thumb_path])
  );
}
