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

describe('community moderation', () => {
  it('report: 201 first time, 200 duplicate, 404 unknown target', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    const b = await makeUser('athlete');
    const p = await insertPost(b.id);
    const auth = { Authorization: `Bearer ${a.token}` };
    const body = { target_type: 'post', target_id: p, reason: 'spam' };
    const r1 = await request(app)
      .post('/api/community/reports')
      .set(auth)
      .send(body);
    expect(r1.status).toBe(201);
    const r2 = await request(app)
      .post('/api/community/reports')
      .set(auth)
      .send(body);
    expect(r2.status).toBe(200);
    expect(r2.body.id).toBe(r1.body.id);
    const r3 = await request(app)
      .post('/api/community/reports')
      .set(auth)
      .send({ ...body, target_id: '00000000-0000-0000-0000-000000000000' });
    expect(r3.status).toBe(404);
  });

  it('admin lists open reports with embedded content and resolves by hiding (closes sibling reports)', async () => {
    await enableCommunity();
    const adm = await makeUser('admin');
    const a = await makeUser('athlete');
    const c = await makeUser('athlete');
    const b = await makeUser('athlete', 'Bad');
    const p = await insertPost(b.id, { body: 'ofensivo' });
    for (const u of [a, c]) {
      await request(app)
        .post('/api/community/reports')
        .set('Authorization', `Bearer ${u.token}`)
        .send({ target_type: 'post', target_id: p, reason: 'offensive' });
    }
    const list = await request(app)
      .get('/api/admin/community/reports?status=open')
      .set('Authorization', `Bearer ${adm.token}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);
    expect(list.body[0].content).toMatchObject({
      body: 'ofensivo',
      author_id: b.id,
      hidden: false,
    });
    expect(typeof list.body[0].age_hours).toBe('number');

    await request(app)
      .post(`/api/admin/community/reports/${list.body[0].id}/resolve`)
      .set('Authorization', `Bearer ${adm.token}`)
      .send({ action: 'hide' })
      .expect(204);
    const open = await pool.query(
      `SELECT count(*)::int AS n FROM community_reports WHERE status = 'open'`
    );
    expect(open.rows[0].n).toBe(0);
    const d = await request(app)
      .get(`/api/community/posts/${p}`)
      .set('Authorization', `Bearer ${a.token}`);
    expect(d.status).toBe(404);
  });

  it('resolve mute silences the author; dismiss only closes that report', async () => {
    await enableCommunity();
    const adm = await makeUser('admin');
    const a = await makeUser('athlete');
    const b = await makeUser('athlete');
    const p = await insertPost(b.id);
    const cm = await pool.query<{ id: string }>(
      `INSERT INTO community_comments (post_id, author_id, body) VALUES ($1, $2, 'mal') RETURNING id`,
      [p, b.id]
    );
    const rep = await request(app)
      .post('/api/community/reports')
      .set('Authorization', `Bearer ${a.token}`)
      .send({
        target_type: 'comment',
        target_id: cm.rows[0].id,
        reason: 'offensive',
      });
    const bad = await request(app)
      .post(`/api/admin/community/reports/${rep.body.id}/resolve`)
      .set('Authorization', `Bearer ${adm.token}`)
      .send({ action: 'mute' });
    expect(bad.status).toBe(400); // mute_days required
    await request(app)
      .post(`/api/admin/community/reports/${rep.body.id}/resolve`)
      .set('Authorization', `Bearer ${adm.token}`)
      .send({ action: 'mute', mute_days: 3 })
      .expect(204);
    const post = await request(app)
      .post('/api/community/posts')
      .set('Authorization', `Bearer ${b.token}`)
      .field('body', 'x');
    expect(post.body.error).toBe('muted');
    const st = await pool.query(
      `SELECT status FROM community_reports WHERE id = $1`,
      [rep.body.id]
    );
    expect(st.rows[0].status).toBe('actioned');

    await request(app)
      .post(`/api/admin/community/users/${b.id}/mute`)
      .set('Authorization', `Bearer ${adm.token}`)
      .send({ days: null })
      .expect(204);
    const post2 = await request(app)
      .post('/api/community/posts')
      .set('Authorization', `Bearer ${b.token}`)
      .field('body', 'x');
    expect(post2.status).toBe(201);
  });

  it('admin hides/unhides a post and a comment; admin wall shows hidden with include_hidden=1', async () => {
    await enableCommunity();
    const adm = await makeUser('admin');
    const a = await makeUser('athlete');
    const p = await insertPost(a.id, { body: 'x' });
    const auth = { Authorization: `Bearer ${adm.token}` };
    await request(app)
      .post(`/api/admin/community/posts/${p}/hide`)
      .set(auth)
      .expect(204);
    let w = await request(app).get('/api/admin/community/posts').set(auth);
    expect(w.body.items).toHaveLength(0);
    w = await request(app)
      .get('/api/admin/community/posts?include_hidden=1')
      .set(auth);
    expect(w.body.items[0]).toMatchObject({
      id: p,
      hidden_at: expect.any(String),
    });
    await request(app)
      .post(`/api/admin/community/posts/${p}/unhide`)
      .set(auth)
      .expect(204);
    const cm = await pool.query<{ id: string }>(
      `INSERT INTO community_comments (post_id, author_id, body) VALUES ($1, $2, 'c') RETURNING id`,
      [p, a.id]
    );
    await request(app)
      .post(`/api/admin/community/comments/${cm.rows[0].id}/hide`)
      .set(auth)
      .expect(204);
    const list = await request(app)
      .get(`/api/community/posts/${p}/comments`)
      .set('Authorization', `Bearer ${a.token}`);
    expect(list.body.items).toHaveLength(0);
  });

  it('pin limit is 3', async () => {
    await enableCommunity();
    const adm = await makeUser('admin');
    const auth = { Authorization: `Bearer ${adm.token}` };
    const ids = [];
    for (let i = 0; i < 4; i++) ids.push(await insertPost(adm.id));
    for (let i = 0; i < 3; i++) {
      await request(app)
        .patch(`/api/admin/community/posts/${ids[i]}/pin`)
        .set(auth)
        .send({ pinned: true })
        .expect(204);
    }
    const r = await request(app)
      .patch(`/api/admin/community/posts/${ids[3]}/pin`)
      .set(auth)
      .send({ pinned: true });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('pin_limit');
    await request(app)
      .patch(`/api/admin/community/posts/${ids[0]}/pin`)
      .set(auth)
      .send({ pinned: false })
      .expect(204);
    await request(app)
      .patch(`/api/admin/community/posts/${ids[3]}/pin`)
      .set(auth)
      .send({ pinned: true })
      .expect(204);
  });

  it('admin creates an event (with pin) and lists rsvps', async () => {
    const adm = await makeUser('admin', 'Tato');
    const a = await makeUser('athlete');
    await enableCommunity();
    const auth = { Authorization: `Bearer ${adm.token}` };
    const r = await request(app)
      .post('/api/admin/community/posts')
      .set(auth)
      .field('kind', 'event')
      .field('body', 'Asado')
      .field('event_location', 'Club')
      .field('event_starts_at', '2026-10-01T20:00:00.000Z')
      .field('pin', 'true');
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      kind: 'event',
      pinned: true,
      author: { is_coach: true },
      event: {
        location: 'Club',
        starts_at: '2026-10-01T20:00:00.000Z',
        rsvp_count: 0,
      },
    });
    await request(app)
      .post(`/api/community/posts/${r.body.id}/rsvp`)
      .set('Authorization', `Bearer ${a.token}`)
      .expect(204);
    const rs = await request(app)
      .get(`/api/admin/community/posts/${r.body.id}/rsvps`)
      .set(auth);
    expect(rs.body.map((x: { id: string }) => x.id)).toEqual([a.id]);

    const noDate = await request(app)
      .post('/api/admin/community/posts')
      .set(auth)
      .field('kind', 'event')
      .field('body', 'x');
    expect(noDate.status).toBe(400);
  });

  it('admin endpoints reject athletes', async () => {
    const a = await makeUser('athlete');
    const r = await request(app)
      .get('/api/admin/community/reports')
      .set('Authorization', `Bearer ${a.token}`);
    expect(r.status).toBe(403);
  });
});
