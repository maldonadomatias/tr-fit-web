import { jest } from '@jest/globals';

export const storageOps: {
  saved: string[];
  deleted: string[];
  failOn: string | null;
} = { saved: [], deleted: [], failOn: null };
jest.unstable_mockModule('../../src/config/firebase.js', () => ({
  getStorageBucket: () => ({
    name: 'test-bucket',
    file: (path: string) => ({
      save: async () => {
        if (storageOps.failOn && path.endsWith(storageOps.failOn))
          throw new Error('boom');
        storageOps.saved.push(path);
      },
      delete: async () => {
        storageOps.deleted.push(path);
      },
    }),
  }),
  getFirebaseApp: () => ({}),
}));
jest.unstable_mockModule('../../src/services/push.service.js', () => ({
  sendPush: async () => 'sent',
}));

const { resetDatabase, ensureMigrated, closePool } =
  await import('./helpers/test-db.js');
const pool = (await import('../../src/db/connect.js')).default;
const request = (await import('supertest')).default;
const app = (await import('../../src/app.js')).default;
const { makeUser, enableCommunity, insertPost } =
  await import('./community-helpers.js');

beforeAll(async () => {
  await ensureMigrated();
});
beforeEach(async () => {
  await resetDatabase();
  storageOps.saved.length = 0;
  storageOps.deleted.length = 0;
  storageOps.failOn = null;
});
afterAll(async () => {
  await closePool();
});

describe('coach author name', () => {
  it('uses the coach profile name when the admin has no signup name', async () => {
    await enableCommunity();
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, community_terms_accepted_at)
       VALUES ('coach-public-name@t.local', 'x', 'admin', now())
       RETURNING id`
    );
    await pool.query(
      `INSERT INTO coach_profiles (user_id, name) VALUES ($1, 'Tato Robles Fit')`,
      [rows[0].id]
    );
    await insertPost(rows[0].id, { body: 'aviso', kind: 'announcement' });
    const viewer = await makeUser('athlete', 'Ana');
    const r = await request(app)
      .get('/api/community/feed')
      .set('Authorization', `Bearer ${viewer.token}`);
    expect(r.body.items[0].author).toMatchObject({
      name: 'Tato Robles Fit',
      is_coach: true,
    });
  });
});

describe('/api/community/feed', () => {
  it('paginates 20 per page with an opaque cursor, newest first', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    for (let i = 0; i < 25; i++) {
      await insertPost(a.id, {
        body: `p${i}`,
        createdAt: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString(),
      });
    }
    const auth = { Authorization: `Bearer ${a.token}` };
    const p1 = await request(app).get('/api/community/feed').set(auth);
    expect(p1.body.items).toHaveLength(20);
    expect(p1.body.items[0].body).toBe('p24');
    expect(p1.body.next_cursor).toEqual(expect.any(String));
    const p2 = await request(app)
      .get(`/api/community/feed?cursor=${p1.body.next_cursor}`)
      .set(auth);
    expect(p2.body.items.map((x: { body: string }) => x.body)).toEqual([
      'p4',
      'p3',
      'p2',
      'p1',
      'p0',
    ]);
    expect(p2.body.next_cursor).toBeNull();
    expect(p2.body.pinned).toEqual([]);
  });

  it('filters by category together with a cursor', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    for (let i = 0; i < 22; i++) {
      await insertPost(a.id, {
        body: `m${i}`,
        category: 'meals',
        createdAt: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString(),
      });
      await insertPost(a.id, {
        body: `t${i}`,
        category: 'training',
        createdAt: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString(),
      });
    }
    const auth = { Authorization: `Bearer ${a.token}` };
    const p1 = await request(app)
      .get('/api/community/feed?category=meals')
      .set(auth);
    const p2 = await request(app)
      .get(`/api/community/feed?category=meals&cursor=${p1.body.next_cursor}`)
      .set(auth);
    expect(
      [...p1.body.items, ...p2.body.items].every(
        (x: { category: string }) => x.category === 'meals'
      )
    ).toBe(true);
    expect(p1.body.items.length + p2.body.items.length).toBe(22);
  });

  it('first page lists up to 3 pinned separately; hidden and deleted never appear', async () => {
    await enableCommunity();
    const adm = await makeUser('admin');
    const a = await makeUser('athlete');
    await insertPost(adm.id, { body: 'pin', pinned: true });
    await insertPost(a.id, { body: 'hidden', hidden: true });
    const d = await insertPost(a.id, { body: 'deleted' });
    await pool.query(
      `UPDATE community_posts SET deleted_at = now() WHERE id = $1`,
      [d]
    );
    await insertPost(a.id, { body: 'normal' });
    const r = await request(app)
      .get('/api/community/feed')
      .set('Authorization', `Bearer ${a.token}`);
    expect(r.body.pinned.map((x: { body: string }) => x.body)).toEqual(['pin']);
    expect(r.body.items.map((x: { body: string }) => x.body)).toEqual([
      'normal',
    ]);
  });

  it('blocks filter both directions in feed, detail, comments and new-count', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    const b = await makeUser('athlete');
    const c = await makeUser('athlete');
    const anchor = await insertPost(c.id, {
      createdAt: '2026-09-01T00:00:00Z',
    });
    const pb = await insertPost(b.id, {
      body: 'from b',
      createdAt: '2026-09-02T00:00:00Z',
    });
    await pool.query(
      `INSERT INTO community_comments (post_id, author_id, body) VALUES ($1, $2, 'b comment')`,
      [anchor, b.id]
    );
    await request(app)
      .post(`/api/community/blocks/${b.id}`)
      .set('Authorization', `Bearer ${a.token}`)
      .expect(204);

    for (const viewer of [a, b]) {
      const auth = { Authorization: `Bearer ${viewer.token}` };
      const other = viewer === a ? b : a;
      const otherPost =
        viewer === a
          ? pb
          : await insertPost(a.id, {
              body: 'from a',
              createdAt: '2026-09-03T00:00:00Z',
            });
      const feed = await request(app).get('/api/community/feed').set(auth);
      expect(
        feed.body.items.some(
          (x: { author: { id: string } }) => x.author.id === other.id
        )
      ).toBe(false);
      const det = await request(app)
        .get(`/api/community/posts/${otherPost}`)
        .set(auth);
      expect(det.status).toBe(404);
      const nc = await request(app)
        .get(`/api/community/feed/new-count?since=${anchor}`)
        .set(auth);
      // a: b's newer post is blocked → 0. b: own newer post counts, a's is blocked → 1.
      expect(nc.body.count).toBe(viewer === a ? 0 : 1);
    }
    const comments = await request(app)
      .get(`/api/community/posts/${anchor}/comments`)
      .set('Authorization', `Bearer ${a.token}`);
    expect(comments.body.items).toHaveLength(0);

    const blocks = await request(app)
      .get('/api/community/blocks')
      .set('Authorization', `Bearer ${a.token}`);
    expect(blocks.body.map((x: { id: string }) => x.id)).toEqual([b.id]);
    await request(app)
      .delete(`/api/community/blocks/${b.id}`)
      .set('Authorization', `Bearer ${a.token}`)
      .expect(204);
    const det = await request(app)
      .get(`/api/community/posts/${pb}`)
      .set('Authorization', `Bearer ${a.token}`);
    expect(det.status).toBe(200);
  });

  it('new-count counts visible newer posts', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    const first = await insertPost(a.id, { createdAt: '2026-09-01T00:00:00Z' });
    await insertPost(a.id, { createdAt: '2026-09-02T00:00:00Z' });
    await insertPost(a.id, { createdAt: '2026-09-03T00:00:00Z', hidden: true });
    const r = await request(app)
      .get(`/api/community/feed/new-count?since=${first}`)
      .set('Authorization', `Bearer ${a.token}`);
    expect(r.body).toEqual({ count: 1 });
  });

  it('rejects a garbage cursor with 400 invalid_cursor', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    const r = await request(app)
      .get('/api/community/feed?cursor=zzz')
      .set('Authorization', `Bearer ${a.token}`);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('invalid_cursor');
  });
});
