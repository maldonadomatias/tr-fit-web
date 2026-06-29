import { jest } from '@jest/globals';

process.env.DATABASE_URL ??= 'postgres://postgres:postgres@localhost:5432/trfit_test';

// ── Mock Firebase Storage bucket ───────────────────────────────────────
const saveCalls: Array<{ contentType?: string; metadata?: { metadata?: Record<string, string> } }> = [];
let savedPath = '';
const fakeBucket = {
  name: 'test-bucket.firebasestorage.app',
  file(path: string) {
    savedPath = path;
    return {
      async save(_buffer: Buffer, opts: (typeof saveCalls)[number]) {
        saveCalls.push(opts);
      },
    };
  },
};
jest.unstable_mockModule('../../src/config/firebase.js', () => ({
  getStorageBucket: () => fakeBucket,
}));

// ── Mock pool ──────────────────────────────────────────────────────────
let nextRowCount = 1;
const queryCalls: Array<{ sql: string; params?: unknown[] }> = [];
const fakePool = {
  async query(sql: string, params?: unknown[]) {
    queryCalls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    return { rows: [{ video_url: params?.[0] }], rowCount: nextRowCount };
  },
};
jest.unstable_mockModule('../../src/db/connect.js', () => ({ default: fakePool }));

const { uploadExerciseVideo, ALLOWED_VIDEO_MIME } = await import(
  '../../src/services/exercise-video.service.js'
);

beforeEach(() => {
  saveCalls.length = 0;
  queryCalls.length = 0;
  savedPath = '';
  nextRowCount = 1;
});

describe('uploadExerciseVideo', () => {
  it('uploads under exercise-videos/<id>/ and returns a Firebase URL', async () => {
    const url = await uploadExerciseVideo(42, Buffer.from('vid'), 'video/mp4');

    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0].contentType).toBe('video/mp4');
    const token = saveCalls[0].metadata?.metadata?.firebaseStorageDownloadTokens;
    expect(token).toBeTruthy();
    expect(savedPath).toMatch(/^exercise-videos\/42\/.+\.mp4$/);
    expect(url).toBe(
      `https://firebasestorage.googleapis.com/v0/b/${fakeBucket.name}/o/` +
        `${encodeURIComponent(savedPath)}?alt=media&token=${token}`,
    );
  });

  it('persists the URL on the (non-archived) exercise', async () => {
    const url = await uploadExerciseVideo(7, Buffer.from('vid'), 'video/quicktime');
    const update = queryCalls.find((c) => c.sql.startsWith('UPDATE exercises'));
    expect(update?.sql).toContain('archived_at IS NULL');
    expect(update?.params).toEqual([url, 7]);
    expect(savedPath).toMatch(/\.mov$/);
  });

  it('throws when the exercise is missing or archived', async () => {
    nextRowCount = 0;
    await expect(
      uploadExerciseVideo(999, Buffer.from('vid'), 'video/mp4'),
    ).rejects.toThrow('exercise_not_found');
  });

  it('allows only mp4 / quicktime', () => {
    expect(ALLOWED_VIDEO_MIME.has('video/mp4')).toBe(true);
    expect(ALLOWED_VIDEO_MIME.has('video/quicktime')).toBe(true);
    expect(ALLOWED_VIDEO_MIME.has('video/webm')).toBe(false);
  });
});
