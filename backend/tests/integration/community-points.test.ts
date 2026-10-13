import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/config/firebase.js', () => ({
  getStorageBucket: () => ({
    name: 'test-bucket',
    file: () => ({ save: async () => {}, delete: async () => {} }),
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
const { getLeaderboard, POINTS, DAILY_CAPS } =
  await import('../../src/services/community-points.service.js');

// 15/10/2026 12:00 en BA (-03:00)
const NOW = new Date('2026-10-15T15:00:00Z');
const AT = '2026-10-10T15:00:00Z';

async function react(postId: string, userId: string, at = AT) {
  await pool.query(
    `INSERT INTO community_likes (post_id, user_id, emoji, created_at) VALUES ($1, $2, '🔥', $3)`,
    [postId, userId, at]
  );
}
async function comment(postId: string, userId: string, at = AT) {
  await pool.query(
    `INSERT INTO community_comments (post_id, author_id, body, created_at) VALUES ($1, $2, 'buenísimo', $3)`,
    [postId, userId, at]
  );
}
async function rsvp(postId: string, userId: string, at = AT) {
  await pool.query(
    `INSERT INTO community_event_rsvps (post_id, user_id, created_at) VALUES ($1, $2, $3)`,
    [postId, userId, at]
  );
}
async function addPhoto(postId: string) {
  await pool.query(
    `INSERT INTO community_post_media (post_id, storage_path, thumb_path, url, thumb_url, width, height, position)
     VALUES ($1, 'p', 't', 'https://x/p.jpg', 'https://x/t.jpg', 100, 100, 0)`,
    [postId]
  );
}
const pointsOf = (lb: { top: { user: { id: string }; points: number }[] }, id: string) =>
  lb.top.find((e) => e.user.id === id)?.points ?? 0;

beforeAll(async () => {
  await ensureMigrated();
});
beforeEach(async () => {
  await resetDatabase();
  await enableCommunity();
});
afterAll(async () => {
  await closePool();
});

describe('getLeaderboard scoring', () => {
  it('scores every action with the configured points', async () => {
    const ana = await makeUser('athlete', 'Ana');
    const beto = await makeUser('athlete', 'Beto');
    const coach = await makeUser('admin', 'Coach');

    const plain = await insertPost(ana.id, { createdAt: AT });
    const withPhoto = await insertPost(ana.id, { createdAt: AT });
    await addPhoto(withPhoto);
    await comment(plain, beto.id);
    await react(plain, beto.id);
    const event = await insertPost(coach.id, { kind: 'event', createdAt: AT });
    await rsvp(event, beto.id);

    const lb = await getLeaderboard({ id: ana.id, role: 'athlete' }, NOW);

    expect(pointsOf(lb, ana.id)).toBe(
      POINTS.post * 2 + POINTS.post_photo_bonus + POINTS.comment_received + POINTS.reaction_received
    );
    expect(pointsOf(lb, beto.id)).toBe(POINTS.comment + POINTS.reaction + POINTS.rsvp);
    expect(lb.month).toBe('2026-10');
    expect(lb.points).toEqual(POINTS);
    expect(lb.caps).toEqual(DAILY_CAPS);
  });

  it('does not score self interaction and counts a received comment once per commenter', async () => {
    const ana = await makeUser('athlete', 'Ana');
    const beto = await makeUser('athlete', 'Beto');
    const post = await insertPost(ana.id, { createdAt: AT });
    await comment(post, ana.id);
    await react(post, ana.id);
    for (let i = 0; i < 3; i++) await comment(post, beto.id, `2026-10-10T15:0${i}:00Z`);

    const lb = await getLeaderboard({ id: ana.id, role: 'athlete' }, NOW);

    expect(pointsOf(lb, ana.id)).toBe(POINTS.post + POINTS.comment_received);
    expect(pointsOf(lb, beto.id)).toBe(POINTS.comment * 3);
  });

  it('hidden and deleted content does not score', async () => {
    const ana = await makeUser('athlete', 'Ana');
    const beto = await makeUser('athlete', 'Beto');
    const hidden = await insertPost(ana.id, { createdAt: AT, hidden: true });
    await react(hidden, beto.id);
    const deleted = await insertPost(ana.id, { createdAt: AT });
    await comment(deleted, beto.id);
    await pool.query(`UPDATE community_posts SET deleted_at = now() WHERE id = $1`, [deleted]);
    const ok = await insertPost(ana.id, { createdAt: AT });
    await comment(ok, beto.id);
    await pool.query(`UPDATE community_comments SET hidden_at = now() WHERE post_id = $1`, [ok]);

    const lb = await getLeaderboard({ id: ana.id, role: 'athlete' }, NOW);

    expect(pointsOf(lb, ana.id)).toBe(POINTS.post);
    expect(pointsOf(lb, beto.id)).toBe(0);
  });

  it('applies daily caps per Buenos Aires day', async () => {
    const ana = await makeUser('athlete', 'Ana');
    // 5 posts el 10/10 BA (el último a las 23:30 BA = 02:30Z del 11/10) + 1 post el 11/10 BA
    for (let i = 0; i < 4; i++) await insertPost(ana.id, { createdAt: `2026-10-10T15:0${i}:00Z` });
    await insertPost(ana.id, { createdAt: '2026-10-11T02:30:00Z' });
    await insertPost(ana.id, { createdAt: '2026-10-11T15:00:00Z' });

    const lb = await getLeaderboard({ id: ana.id, role: 'athlete' }, NOW);

    expect(pointsOf(lb, ana.id)).toBe(POINTS.post * (DAILY_CAPS.post + 1));
  });

  it('month and day boundaries use Buenos Aires time', async () => {
    const ana = await makeUser('athlete', 'Ana');
    await insertPost(ana.id, { createdAt: '2026-10-01T02:30:00Z' }); // 30/09 23:30 BA → septiembre
    await insertPost(ana.id, { createdAt: '2026-10-01T03:30:00Z' }); // 01/10 00:30 BA → octubre
    await insertPost(ana.id, { createdAt: '2026-10-15T16:00:00Z' }); // después de NOW → no cuenta

    const lb = await getLeaderboard({ id: ana.id, role: 'athlete' }, NOW);

    expect(pointsOf(lb, ana.id)).toBe(POINTS.post);
  });
});

describe('getLeaderboard ranking', () => {
  it('only ranks approved, non-muted athletes', async () => {
    const coach = await makeUser('admin', 'Coach');
    const pending = await makeUser('athlete', 'Pend');
    const muted = await makeUser('athlete', 'Mute');
    const ok = await makeUser('athlete', 'Ok');
    await pool.query(`UPDATE users SET status = 'pending' WHERE id = $1`, [pending.id]);
    await pool.query(`UPDATE users SET community_muted_until = now() + interval '1 day' WHERE id = $1`, [muted.id]);
    for (const u of [coach, pending, muted, ok]) await insertPost(u.id, { createdAt: AT });

    const lb = await getLeaderboard({ id: coach.id, role: 'admin' }, NOW);

    expect(lb.top.map((e) => e.user.id)).toEqual([ok.id]);
    expect(lb.me).toEqual({ rank: null, points: 0 });
  });

  it('ties share rank, top is capped at 5 and me carries the viewer rank', async () => {
    const users = [];
    for (let i = 0; i < 22; i++) users.push(await makeUser('athlete', `U${i}`));
    // U0 y U1: 2 posts (empatan primeros); resto: 1 post; el viewer U21 sin nada más que un post.
    for (const [i, u] of users.entries()) {
      await insertPost(u.id, { createdAt: AT });
      if (i < 2) await insertPost(u.id, { createdAt: '2026-10-11T15:00:00Z' });
    }
    const viewer = users[21];

    const lb = await getLeaderboard({ id: viewer.id, role: 'athlete' }, NOW);

    expect(lb.top).toHaveLength(5);
    expect(lb.top.some((e) => e.user.id === viewer.id)).toBe(false);
    expect(lb.top[0].rank).toBe(1);
    expect(lb.top[1].rank).toBe(1);
    expect(lb.top[2].rank).toBe(3);
    expect(lb.me).toEqual({ rank: 3, points: POINTS.post });
  });

  it('hides blocked users without renumbering', async () => {
    const ana = await makeUser('athlete', 'Ana');
    const beto = await makeUser('athlete', 'Beto');
    const caro = await makeUser('athlete', 'Caro');
    await insertPost(beto.id, { createdAt: AT });
    await insertPost(beto.id, { createdAt: '2026-10-11T15:00:00Z' });
    await insertPost(caro.id, { createdAt: AT });
    await pool.query(
      `INSERT INTO community_blocks (blocker_id, blocked_id) VALUES ($1, $2)`,
      [beto.id, ana.id]
    );

    const lb = await getLeaderboard({ id: ana.id, role: 'athlete' }, NOW);

    expect(lb.top.map((e) => [e.user.name, e.rank])).toEqual([['Caro Test', 2]]);
  });

  it('points reset every month', async () => {
    const ana = await makeUser('athlete', 'Ana');
    await insertPost(ana.id, { createdAt: '2026-10-10T15:00:00Z' });

    const oct = await getLeaderboard({ id: ana.id, role: 'athlete' }, NOW);
    const nov = await getLeaderboard(
      { id: ana.id, role: 'athlete' },
      new Date('2026-11-01T03:30:00Z') // 00:30 BA del 1/11
    );

    expect(oct.me).toEqual({ rank: 1, points: POINTS.post });
    expect(nov.month).toBe('2026-11');
    expect(nov.top).toEqual([]);
    expect(nov.me).toEqual({ rank: null, points: 0 });
  });

  it('empty month', async () => {
    const ana = await makeUser('athlete', 'Ana');
    await insertPost(ana.id, { createdAt: '2026-09-20T15:00:00Z' });

    const lb = await getLeaderboard({ id: ana.id, role: 'athlete' }, NOW);

    expect(lb.top).toEqual([]);
    expect(lb.me).toEqual({ rank: null, points: 0 });
  });
});

describe('GET /api/community/leaderboard', () => {
  it('returns the leaderboard for the current viewer', async () => {
    const ana = await makeUser('athlete', 'Ana');
    await insertPost(ana.id);

    const r = await request(app)
      .get('/api/community/leaderboard')
      .set('Authorization', `Bearer ${ana.token}`);

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      points: POINTS,
      caps: DAILY_CAPS,
      me: { rank: 1, points: POINTS.post },
    });
    expect(r.body.top[0].user).toMatchObject({ id: ana.id, name: 'Ana Test' });
  });

  it('is 404 for athletes when community is disabled', async () => {
    await pool.query(
      `UPDATE platform_fee_config SET community_launched_on = NULL WHERE id = 1`
    );
    const ana = await makeUser('athlete', 'Ana');

    const r = await request(app)
      .get('/api/community/leaderboard')
      .set('Authorization', `Bearer ${ana.token}`);

    expect(r.status).toBe(404);
  });
});
