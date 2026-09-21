import pool from '../../src/db/connect.js';
import { signToken } from '../../src/middleware/auth.js';

export async function makeUser(
  role: 'athlete' | 'admin' | 'superadmin',
  name = 'User'
): Promise<{ id: string; token: string }> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role, first_name, last_name, community_terms_accepted_at)
     VALUES ($1, 'x', $2, $3, 'Test', now()) RETURNING id`,
    [`c-${Date.now()}-${Math.random()}@t.local`, role, name]
  );
  return { id: rows[0].id, token: signToken({ id: rows[0].id, role }) };
}

export async function enableCommunity(): Promise<void> {
  await pool.query(
    `UPDATE platform_fee_config SET community_launched_on = '2026-09-01' WHERE id = 1`
  );
}

/** Insert a post directly (bypasses HTTP). createdAt lets tests control ordering. */
export async function insertPost(
  authorId: string,
  opts: {
    body?: string;
    kind?: 'post' | 'announcement' | 'event';
    category?: string;
    createdAt?: string;
    pinned?: boolean;
    hidden?: boolean;
  } = {}
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO community_posts (author_id, kind, category, body, created_at, pinned_at, hidden_at, event_starts_at)
     VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()),
             CASE WHEN $6::boolean THEN now() END, CASE WHEN $7::boolean THEN now() END,
             CASE WHEN $2 = 'event' THEN now() + interval '7 days' END)
     RETURNING id`,
    [
      authorId,
      opts.kind ?? 'post',
      opts.category ?? 'general',
      opts.body ?? 'hola',
      opts.createdAt ?? null,
      opts.pinned ?? false,
      opts.hidden ?? false,
    ]
  );
  return rows[0].id;
}

export const tinyJpeg = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9,
]);
