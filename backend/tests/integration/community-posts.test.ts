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
const { makeUser, enableCommunity, insertPost, tinyJpeg } =
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

describe('/api/community posts', () => {
  it('athlete gets 404 community_disabled while module is off; admin passes', async () => {
    const a = await makeUser('athlete');
    const adm = await makeUser('admin');
    const r1 = await request(app)
      .get('/api/community/feed')
      .set('Authorization', `Bearer ${a.token}`);
    expect(r1.status).toBe(404);
    expect(r1.body.error).toBe('community_disabled');
    const r2 = await request(app)
      .get('/api/community/feed')
      .set('Authorization', `Bearer ${adm.token}`);
    expect(r2.status).toBe(200);
  });

  it('creates a text post and returns the post shape', async () => {
    await enableCommunity();
    const a = await makeUser('athlete', 'Ana');
    const r = await request(app)
      .post('/api/community/posts')
      .set('Authorization', `Bearer ${a.token}`)
      .field('body', 'Hola gente')
      .field('category', 'training');
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      type: 'post',
      kind: 'post',
      category: 'training',
      body: 'Hola gente',
      author: { id: a.id, is_coach: false },
      like_count: 0,
      comment_count: 0,
      liked_by_me: false,
      can_delete: true,
      media: [],
    });
  });

  it('creates a post with 2 photos', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    const r = await request(app)
      .post('/api/community/posts')
      .set('Authorization', `Bearer ${a.token}`)
      .field('body', '')
      .field('widths', '800')
      .field('widths', '640')
      .field('heights', '600')
      .field('heights', '480')
      .attach('images', tinyJpeg, {
        filename: 'a.jpg',
        contentType: 'image/jpeg',
      })
      .attach('images', tinyJpeg, {
        filename: 'b.jpg',
        contentType: 'image/jpeg',
      })
      .attach('thumbs', tinyJpeg, {
        filename: 'a_t.jpg',
        contentType: 'image/jpeg',
      })
      .attach('thumbs', tinyJpeg, {
        filename: 'b_t.jpg',
        contentType: 'image/jpeg',
      });
    expect(r.status).toBe(201);
    expect(r.body.media).toHaveLength(2);
    expect(r.body.media[1]).toMatchObject({ width: 640, height: 480 });
    expect(storageOps.saved).toHaveLength(4);
  });

  it('rolls back when the third photo fails: no post, no objects left', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    let req = request(app)
      .post('/api/community/posts')
      .set('Authorization', `Bearer ${a.token}`)
      .field('body', 'x');
    for (let i = 0; i < 3; i++) {
      req = req
        .field('widths', '10')
        .field('heights', '10')
        .attach('images', tinyJpeg, {
          filename: `${i}.jpg`,
          contentType: 'image/jpeg',
        })
        .attach('thumbs', tinyJpeg, {
          filename: `${i}t.jpg`,
          contentType: 'image/jpeg',
        });
    }
    storageOps.failOn = '/2.jpg'; // postId is random: fail on any path ending in /2.jpg
    const r = await req;
    expect(r.status).toBe(500);
    expect(r.body.error).toBe('upload_failed');
    const n = await pool.query(
      `SELECT count(*)::int AS n FROM community_posts`
    );
    expect(n.rows[0].n).toBe(0);
    expect([...storageOps.deleted].sort()).toEqual(
      [...storageOps.saved].sort()
    );
  });

  it('rejects empty post, missing terms and muted user', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    const e = await request(app)
      .post('/api/community/posts')
      .set('Authorization', `Bearer ${a.token}`)
      .field('body', '  ');
    expect(e.status).toBe(400);
    expect(e.body.error).toBe('empty_post');

    await pool.query(
      `UPDATE users SET community_terms_accepted_at = NULL WHERE id = $1`,
      [a.id]
    );
    const t = await request(app)
      .post('/api/community/posts')
      .set('Authorization', `Bearer ${a.token}`)
      .field('body', 'x');
    expect(t.status).toBe(403);
    expect(t.body.error).toBe('terms_required');
    const tc = await request(app)
      .post(`/api/community/posts/${await insertPost(a.id)}/comments`)
      .set('Authorization', `Bearer ${a.token}`)
      .send({ body: 'hola' });
    expect(tc.body.error).toBe('terms_required');

    await request(app)
      .post('/api/community/terms/accept')
      .set('Authorization', `Bearer ${a.token}`)
      .expect(204);
    await pool.query(
      `UPDATE users SET community_muted_until = now() + interval '1 day' WHERE id = $1`,
      [a.id]
    );
    const m = await request(app)
      .post('/api/community/posts')
      .set('Authorization', `Bearer ${a.token}`)
      .field('body', 'x');
    expect(m.status).toBe(403);
    expect(m.body.error).toBe('muted');
  });

  it('athlete cannot create announcement or event (kind is ignored / forbidden)', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    const r = await request(app)
      .post('/api/admin/community/posts')
      .set('Authorization', `Bearer ${a.token}`)
      .field('kind', 'announcement')
      .field('body', 'x');
    expect(r.status).toBe(403);
    const r2 = await request(app)
      .post('/api/community/posts')
      .set('Authorization', `Bearer ${a.token}`)
      .field('kind', 'event')
      .field('body', 'x');
    expect(r2.status).toBe(201);
    expect(r2.body.kind).toBe('post');
  });

  it('likes are idempotent', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    const p = await insertPost(a.id);
    const auth = { Authorization: `Bearer ${a.token}` };
    await request(app)
      .post(`/api/community/posts/${p}/like`)
      .set(auth)
      .expect(204);
    await request(app)
      .post(`/api/community/posts/${p}/like`)
      .set(auth)
      .expect(204);
    let d = await request(app).get(`/api/community/posts/${p}`).set(auth);
    expect(d.body).toMatchObject({ like_count: 1, liked_by_me: true });
    await request(app)
      .delete(`/api/community/posts/${p}/like`)
      .set(auth)
      .expect(204);
    d = await request(app).get(`/api/community/posts/${p}`).set(auth);
    expect(d.body.like_count).toBe(0);
  });

  it('comments: create, list chronologically, author delete, other user forbidden', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    const b = await makeUser('athlete');
    const p = await insertPost(a.id);
    const c1 = await request(app)
      .post(`/api/community/posts/${p}/comments`)
      .set('Authorization', `Bearer ${b.token}`)
      .send({ body: 'uno' });
    expect(c1.status).toBe(201);
    await request(app)
      .post(`/api/community/posts/${p}/comments`)
      .set('Authorization', `Bearer ${a.token}`)
      .send({ body: 'dos' });
    const list = await request(app)
      .get(`/api/community/posts/${p}/comments`)
      .set('Authorization', `Bearer ${a.token}`);
    expect(list.body.items.map((c: { body: string }) => c.body)).toEqual([
      'uno',
      'dos',
    ]);
    const del = await request(app)
      .delete(`/api/community/comments/${c1.body.id}`)
      .set('Authorization', `Bearer ${a.token}`);
    expect(del.status).toBe(403);
    await request(app)
      .delete(`/api/community/comments/${c1.body.id}`)
      .set('Authorization', `Bearer ${b.token}`)
      .expect(204);
    const d = await request(app)
      .get(`/api/community/posts/${p}`)
      .set('Authorization', `Bearer ${a.token}`);
    expect(d.body.comment_count).toBe(1);
  });

  it('rejects comment longer than 500 chars', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    const p = await insertPost(a.id);
    const r = await request(app)
      .post(`/api/community/posts/${p}/comments`)
      .set('Authorization', `Bearer ${a.token}`)
      .send({ body: 'x'.repeat(501) });
    expect(r.status).toBe(400);
  });

  it('rsvp only on events', async () => {
    await enableCommunity();
    const adm = await makeUser('admin');
    const a = await makeUser('athlete');
    const post = await insertPost(adm.id);
    const ev = await insertPost(adm.id, { kind: 'event' });
    const bad = await request(app)
      .post(`/api/community/posts/${post}/rsvp`)
      .set('Authorization', `Bearer ${a.token}`);
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('not_an_event');
    await request(app)
      .post(`/api/community/posts/${ev}/rsvp`)
      .set('Authorization', `Bearer ${a.token}`)
      .expect(204);
    const d = await request(app)
      .get(`/api/community/posts/${ev}`)
      .set('Authorization', `Bearer ${a.token}`);
    expect(d.body.event).toMatchObject({ rsvp_count: 1, going: true });
  });

  it('delete post: author sets deleted_at and removes storage objects', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    const p = await insertPost(a.id);
    await pool.query(
      `INSERT INTO community_post_media (post_id, storage_path, thumb_path, url, thumb_url, width, height, position)
       VALUES ($1, 'community/x/0.jpg', 'community/x/0_thumb.jpg', 'u', 't', 1, 1, 0)`,
      [p]
    );
    await request(app)
      .delete(`/api/community/posts/${p}`)
      .set('Authorization', `Bearer ${a.token}`)
      .expect(204);
    expect(storageOps.deleted.sort()).toEqual([
      'community/x/0.jpg',
      'community/x/0_thumb.jpg',
    ]);
    const d = await request(app)
      .get(`/api/community/posts/${p}`)
      .set('Authorization', `Bearer ${a.token}`);
    expect(d.status).toBe(404);
  });

  it('/athlete/me exposes community flags', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    const b = await makeUser('athlete');
    const p = await insertPost(a.id);
    await request(app)
      .post(`/api/community/posts/${p}/comments`)
      .set('Authorization', `Bearer ${b.token}`)
      .send({ body: 'hey' });
    const me = await request(app)
      .get('/api/athlete/me')
      .set('Authorization', `Bearer ${a.token}`);
    expect(me.body).toMatchObject({
      community_enabled: true,
      community_terms_accepted: true,
      community_unseen: true,
    });
    await request(app)
      .post('/api/community/seen')
      .set('Authorization', `Bearer ${a.token}`)
      .expect(204);
    const me2 = await request(app)
      .get('/api/athlete/me')
      .set('Authorization', `Bearer ${a.token}`);
    expect(me2.body.community_unseen).toBe(false);
  });
});
