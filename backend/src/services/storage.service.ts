import { randomUUID } from 'node:crypto';
import { getStorageBucket } from '../config/firebase.js';

/**
 * Save a buffer to Firebase Storage and return a stable public download URL.
 *
 * The object is tagged with a `firebaseStorageDownloadTokens` metadata entry,
 * which yields a publicly-fetchable URL without bucket-level public access or
 * storage-rule changes — the same scheme the Firebase client SDKs use for
 * `getDownloadURL()`.
 */
export async function uploadBufferToStorage(
  objectPath: string,
  buffer: Buffer,
  contentType: string,
  opts: { resumable?: boolean } = {},
): Promise<string> {
  const token = randomUUID();
  const bucket = getStorageBucket();
  await bucket.file(objectPath).save(buffer, {
    resumable: opts.resumable ?? false,
    contentType,
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  });
  return (
    `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
    `${encodeURIComponent(objectPath)}?alt=media&token=${token}`
  );
}
