import { jest } from '@jest/globals';

process.env.DATABASE_URL ??= 'postgres://postgres:postgres@localhost:5432/trfit_test';

// ── Mock Firebase Storage bucket ───────────────────────────────────────
interface SaveCall {
  buffer: Buffer;
  opts: { contentType?: string; metadata?: { metadata?: Record<string, string> } };
}
const saveCalls: SaveCall[] = [];
let savedPath = '';

const fakeBucket = {
  name: 'test-bucket.firebasestorage.app',
  file(path: string) {
    savedPath = path;
    return {
      async save(buffer: Buffer, opts: SaveCall['opts']) {
        saveCalls.push({ buffer, opts });
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
    return { rows: [{ avatar_url: params?.[0] }], rowCount: nextRowCount };
  },
};
jest.unstable_mockModule('../../src/db/connect.js', () => ({ default: fakePool }));

const { uploadAthleteAvatar, ALLOWED_AVATAR_MIME } = await import(
  '../../src/services/avatar.service.js'
);

beforeEach(() => {
  saveCalls.length = 0;
  queryCalls.length = 0;
  savedPath = '';
  nextRowCount = 1;
});

describe('uploadAthleteAvatar', () => {
  it('saves the file with a download token and returns a matching Firebase URL', async () => {
    const url = await uploadAthleteAvatar('user-1', Buffer.from('img'), 'image/png');

    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0].opts.contentType).toBe('image/png');
    const token = saveCalls[0].opts.metadata?.metadata?.firebaseStorageDownloadTokens;
    expect(token).toBeTruthy();

    expect(savedPath).toMatch(/^avatars\/user-1\/.+\.png$/);
    expect(url).toBe(
      `https://firebasestorage.googleapis.com/v0/b/${fakeBucket.name}/o/` +
        `${encodeURIComponent(savedPath)}?alt=media&token=${token}`,
    );
  });

  it('persists the URL against the athlete profile', async () => {
    const url = await uploadAthleteAvatar('user-2', Buffer.from('img'), 'image/jpeg');
    const update = queryCalls.find((c) => c.sql.startsWith('UPDATE athlete_profiles'));
    expect(update).toBeDefined();
    expect(update!.params).toEqual([url, 'user-2']);
  });

  it('falls back to a jpg extension for unknown mime types', async () => {
    await uploadAthleteAvatar('user-3', Buffer.from('img'), 'image/gif');
    expect(savedPath).toMatch(/\.jpg$/);
  });

  it('throws when no profile row is updated', async () => {
    nextRowCount = 0;
    await expect(
      uploadAthleteAvatar('ghost', Buffer.from('img'), 'image/png'),
    ).rejects.toThrow('profile_not_found');
  });

  it('exposes the allowed mime allowlist', () => {
    expect(ALLOWED_AVATAR_MIME.has('image/jpeg')).toBe(true);
    expect(ALLOWED_AVATAR_MIME.has('image/gif')).toBe(false);
  });
});
