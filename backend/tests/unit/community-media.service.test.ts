import { jest } from '@jest/globals';

const saved: string[] = [];
const deleted: string[] = [];
let failOnPath: string | null = null;

const fakeBucket = {
  name: 'test-bucket',
  file(path: string) {
    return {
      async save() {
        if (path === failOnPath) throw new Error('boom');
        saved.push(path);
      },
      async delete() {
        deleted.push(path);
      },
    };
  },
};
jest.unstable_mockModule('../../src/config/firebase.js', () => ({
  getStorageBucket: () => fakeBucket,
}));
jest.unstable_mockModule('../../src/db/connect.js', () => ({
  default: { query: async () => ({ rows: [], rowCount: 0 }) },
}));

const { validateMedia, uploadPostMedia, CommunityMediaError } =
  await import('../../src/services/community-media.service.js');

const img = (size = 1000, mimetype = 'image/jpeg') => ({
  buffer: Buffer.alloc(size),
  mimetype,
  size,
});
const item = () => ({ image: img(), thumb: img(100), width: 800, height: 600 });

beforeEach(() => {
  saved.length = 0;
  deleted.length = 0;
  failOnPath = null;
});

describe('validateMedia', () => {
  it('rejects more than 4 images', () => {
    expect(() =>
      validateMedia([item(), item(), item(), item(), item()])
    ).toThrow(CommunityMediaError);
  });
  it('rejects gif', () => {
    expect(() =>
      validateMedia([{ ...item(), image: img(10, 'image/gif') }])
    ).toThrow('invalid_type');
  });
  it('rejects image > 2MB and thumb > 200KB', () => {
    expect(() =>
      validateMedia([{ ...item(), image: img(2 * 1024 * 1024 + 1) }])
    ).toThrow('image_too_large');
    expect(() =>
      validateMedia([{ ...item(), thumb: img(200 * 1024 + 1) }])
    ).toThrow('thumb_too_large');
  });
  it('rejects non-positive dimensions', () => {
    expect(() => validateMedia([{ ...item(), width: 0 }])).toThrow(
      'invalid_dimensions'
    );
  });
});

describe('uploadPostMedia', () => {
  it('uploads image + thumb per position', async () => {
    const out = await uploadPostMedia('p1', [item(), item()]);
    expect(saved).toEqual([
      'community/p1/0.jpg',
      'community/p1/0_thumb.jpg',
      'community/p1/1.jpg',
      'community/p1/1_thumb.jpg',
    ]);
    expect(out[1]).toMatchObject({
      position: 1,
      storage_path: 'community/p1/1.jpg',
      width: 800,
    });
  });

  it('rolls back uploaded objects when the third image fails', async () => {
    failOnPath = 'community/p1/2.jpg';
    await expect(
      uploadPostMedia('p1', [item(), item(), item()])
    ).rejects.toThrow('boom');
    expect(deleted.sort()).toEqual([...saved].sort());
    expect(saved).toHaveLength(4);
  });
});
