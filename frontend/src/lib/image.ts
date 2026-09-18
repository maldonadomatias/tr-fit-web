export interface PreparedImage {
  image: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

const MAX_SIDE = 1600;
const THUMB_SIDE = 400;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_THUMB_BYTES = 200 * 1024;

async function toJpeg(
  bitmap: ImageBitmap,
  maxSide: number,
  maxBytes: number
): Promise<{ blob: Blob; w: number; h: number }> {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  for (const q of [0.82, 0.7, 0.55, 0.4]) {
    const blob = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, 'image/jpeg', q)
    );
    if (blob && blob.size <= maxBytes) return { blob, w, h };
  }
  throw new Error('image_too_large');
}

/** JPEG ≤2 MB (max 1600px) + thumbnail ≤200 KB (max 400px), matching backend limits. */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const main = await toJpeg(bitmap, MAX_SIDE, MAX_IMAGE_BYTES);
    const thumb = await toJpeg(bitmap, THUMB_SIDE, MAX_THUMB_BYTES);
    return {
      image: main.blob,
      thumb: thumb.blob,
      width: main.w,
      height: main.h,
    };
  } finally {
    bitmap.close();
  }
}
