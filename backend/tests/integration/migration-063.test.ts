import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import pool from '../../src/db/connect.js';

beforeAll(async () => {
  await ensureMigrated();
});
beforeEach(async () => {
  await resetDatabase();
});
afterAll(async () => {
  await closePool();
});

describe('migration 063/064 community', () => {
  it('creates community tables', async () => {
    const r = await pool.query<{ t: string | null }>(
      `SELECT to_regclass(x) AS t FROM unnest(ARRAY[
        'public.community_posts','public.community_post_media','public.community_likes',
        'public.community_comments','public.community_event_rsvps','public.community_reports',
        'public.community_blocks','public.community_ads','public.community_ad_events'
      ]) AS x`
    );
    expect(r.rows.every((row) => row.t !== null)).toBe(true);
  });

  it('rejects an event without starts_at', async () => {
    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role) VALUES ('m@t.local','x','admin') RETURNING id`
    );
    await expect(
      pool.query(
        `INSERT INTO community_posts (author_id, kind, body) VALUES ($1, 'event', 'x')`,
        [u.rows[0].id]
      )
    ).rejects.toThrow();
  });

  it('defaults new users to community push prefs on', async () => {
    const u = await pool.query<{ notification_prefs: Record<string, boolean> }>(
      `INSERT INTO users (email, password_hash, role) VALUES ('n@t.local','x','athlete')
       RETURNING notification_prefs`
    );
    expect(u.rows[0].notification_prefs.community_comment).toBe(true);
    expect(u.rows[0].notification_prefs.community_announcement).toBe(true);
  });

  it('module starts disabled', async () => {
    const r = await pool.query(
      `SELECT community_launched_on FROM platform_fee_config WHERE id = 1`
    );
    expect(r.rows[0].community_launched_on).toBeNull();
  });
});
