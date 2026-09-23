import { randomUUID } from 'node:crypto';
import pool from '../db/connect.js';
import logger from '../utils/logger.js';
import { notifyUser } from './notification.service.js';
import {
  uploadPostMedia,
  validateMedia,
  deleteMediaObjects,
  type MediaInput,
} from './community-media.service.js';
import { activeAdsForFeed, type AdDTO } from './community-ads.service.js';
import { interleaveAds } from './platform-fee.math.js';

export type Role = 'athlete' | 'admin' | 'superadmin';
export interface Viewer {
  id: string;
  role: Role;
}
export type PostKind = 'post' | 'announcement' | 'event';
export type Category = 'general' | 'meals' | 'training';

export interface AuthorDTO {
  id: string;
  name: string;
  avatar_url: string | null;
  is_coach: boolean;
}

export interface PostDTO {
  type: 'post';
  id: string;
  kind: PostKind;
  category: Category;
  body: string;
  created_at: string;
  pinned: boolean;
  author: AuthorDTO;
  media: Array<{
    url: string;
    thumb_url: string;
    width: number;
    height: number;
  }>;
  /** Total reactions of any emoji (kept for clients that only know "me gusta"). */
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  my_reaction: ReactionEmoji | null;
  /** Count per emoji, most used first. */
  reactions: ReactionCount[];
  event?: {
    location: string | null;
    starts_at: string;
    rsvp_count: number;
    going: boolean;
  };
  can_delete: boolean;
  hidden_at?: string | null;
}

/** Keep in sync with the CHECK in migration 066. */
export const REACTION_EMOJIS = ['❤️', '💪', '🔥', '👏', '😂', '😮'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];
export interface ReactionCount {
  emoji: ReactionEmoji;
  count: number;
}

export interface CommentDTO {
  id: string;
  post_id: string;
  body: string;
  created_at: string;
  author: AuthorDTO;
  can_delete: boolean;
}

export class CommunityError extends Error {
  constructor(
    public status: number,
    public code: string
  ) {
    super(code);
  }
}

export const FEED_PAGE_SIZE = 20;
export const COMMENTS_PAGE_SIZE = 30;
export const MAX_PINNED = 3;

export const isAdminRole = (role: Role): boolean =>
  role === 'admin' || role === 'superadmin';

/** Display name: signup name, else athlete/coach profile name. `u` = users alias prefix. */
export const AUTHOR_NAME_SQL = (u: string, ap: string, cp: string) =>
  `COALESCE(NULLIF(TRIM(CONCAT(${u}.first_name, ' ', ${u}.last_name)), ''), ${ap}.name, ${cp}.name, 'Usuario')`;

/**
 * The single block filter: excludes authors I blocked and authors who blocked me.
 * `authorCol` is the SQL column holding the author id, `viewerParam` the placeholder ($n).
 */
export function visibleAuthorsClause(
  authorCol: string,
  viewerParam: string
): string {
  return `NOT EXISTS (
    SELECT 1 FROM community_blocks b
     WHERE (b.blocker_id = ${viewerParam} AND b.blocked_id = ${authorCol})
        OR (b.blocker_id = ${authorCol} AND b.blocked_id = ${viewerParam}))`;
}

/** Opaque keyset cursor over (created_at, id, post-offset). ts keeps microseconds as text. */
export function encodeCursor(ts: string, id: string, offset = 0): string {
  return Buffer.from(`${ts}|${id}|${offset}`).toString('base64url');
}

export function decodeCursor(
  cursor: string
): { ts: string; id: string; offset: number } | null {
  try {
    const [ts, id, rawOffset] = Buffer.from(cursor, 'base64url')
      .toString('utf8')
      .split('|');
    if (!ts || !id || Number.isNaN(Date.parse(ts))) return null;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const offset = rawOffset === undefined ? 0 : Number(rawOffset);
    if (!Number.isInteger(offset) || offset < 0) return null;
    return { ts, id, offset };
  } catch {
    return null;
  }
}

const CURSOR_TS_SQL = (col: string) =>
  `to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

export async function isCommunityEnabled(): Promise<boolean> {
  const r = await pool.query<{ on: boolean }>(
    `SELECT community_launched_on IS NOT NULL AS on FROM platform_fee_config WHERE id = 1`
  );
  return r.rows[0]?.on ?? false;
}

interface PostRow {
  id: string;
  kind: PostKind;
  category: Category;
  body: string;
  created_at: Date;
  cursor_ts: string;
  pinned_at: Date | null;
  hidden_at: Date | null;
  event_location: string | null;
  event_starts_at: Date | null;
  author_id: string;
  author_name: string;
  author_avatar: string | null;
  author_role: Role;
  media: Array<{
    url: string;
    thumb_url: string;
    width: number;
    height: number;
  }>;
  like_count: number;
  comment_count: number;
  my_reaction: ReactionEmoji | null;
  reactions: ReactionCount[];
  rsvp_count: number;
  going: boolean;
}

function toPostDTO(
  row: PostRow,
  viewer: Viewer,
  admin: boolean
): PostDTO & { cursor_ts: string } {
  const dto: PostDTO & { cursor_ts: string } = {
    type: 'post',
    id: row.id,
    kind: row.kind,
    category: row.category,
    body: row.body,
    created_at: new Date(row.created_at).toISOString(),
    pinned: row.pinned_at !== null,
    author: {
      id: row.author_id,
      name: row.author_name,
      avatar_url: row.author_avatar,
      is_coach: isAdminRole(row.author_role),
    },
    media: row.media ?? [],
    like_count: Number(row.like_count),
    comment_count: Number(row.comment_count),
    liked_by_me: row.my_reaction !== null,
    my_reaction: row.my_reaction,
    reactions: row.reactions ?? [],
    can_delete: row.author_id === viewer.id || isAdminRole(viewer.role),
    cursor_ts: row.cursor_ts,
  };
  if (row.kind === 'event' && row.event_starts_at) {
    dto.event = {
      location: row.event_location,
      starts_at: new Date(row.event_starts_at).toISOString(),
      rsvp_count: Number(row.rsvp_count),
      going: row.going,
    };
  }
  if (admin)
    dto.hidden_at = row.hidden_at
      ? new Date(row.hidden_at).toISOString()
      : null;
  return dto;
}

/**
 * Shared post SELECT. `$1` is always the viewer id; callers append their own params
 * starting at $2 and pass extra WHERE fragments. Deleted posts are always excluded.
 */
export async function selectPosts(
  viewer: Viewer,
  opts: {
    where: string[];
    params: unknown[];
    orderBy: string;
    limit: number;
    admin?: boolean;
  }
): Promise<Array<PostDTO & { cursor_ts: string }>> {
  const where = ['p.deleted_at IS NULL', ...opts.where];
  const r = await pool.query<PostRow>(
    `SELECT p.id, p.kind, p.category, p.body, p.created_at, ${CURSOR_TS_SQL('p.created_at')} AS cursor_ts,
            p.pinned_at, p.hidden_at, p.event_location, p.event_starts_at,
            p.author_id, ${AUTHOR_NAME_SQL('u', 'ap', 'cp')} AS author_name,
            ap.avatar_url AS author_avatar, u.role AS author_role,
            COALESCE((SELECT json_agg(json_build_object('url', m.url, 'thumb_url', m.thumb_url,
                                                       'width', m.width, 'height', m.height)
                                      ORDER BY m.position)
                        FROM community_post_media m WHERE m.post_id = p.id), '[]'::json) AS media,
            (SELECT count(*) FROM community_likes l WHERE l.post_id = p.id)::int AS like_count,
            (SELECT count(*) FROM community_comments c
              WHERE c.post_id = p.id AND c.deleted_at IS NULL AND c.hidden_at IS NULL)::int AS comment_count,
            (SELECT l.emoji FROM community_likes l WHERE l.post_id = p.id AND l.user_id = $1) AS my_reaction,
            COALESCE((SELECT json_agg(json_build_object('emoji', x.emoji, 'count', x.n) ORDER BY x.n DESC, x.first_at)
                        FROM (SELECT l.emoji, count(*)::int AS n, min(l.created_at) AS first_at
                                FROM community_likes l WHERE l.post_id = p.id GROUP BY l.emoji) x),
                     '[]'::json) AS reactions,
            (SELECT count(*) FROM community_event_rsvps r WHERE r.post_id = p.id)::int AS rsvp_count,
            EXISTS (SELECT 1 FROM community_event_rsvps r WHERE r.post_id = p.id AND r.user_id = $1) AS going
       FROM community_posts p
       JOIN users u ON u.id = p.author_id
       LEFT JOIN athlete_profiles ap ON ap.user_id = u.id
       LEFT JOIN coach_profiles cp ON cp.user_id = u.id
      WHERE ${where.join(' AND ')}
      ORDER BY ${opts.orderBy}
      LIMIT ${opts.limit}`,
    [viewer.id, ...opts.params]
  );
  return r.rows.map((row) => toPostDTO(row, viewer, opts.admin ?? false));
}

const strip = ({
  cursor_ts: _c,
  ...rest
}: PostDTO & { cursor_ts: string }): PostDTO => rest;

/** Visible-to-viewer filter used by every /community read. */
const VISIBLE = [
  'p.hidden_at IS NULL',
  visibleAuthorsClause('p.author_id', '$1'),
];

export async function getFeed(
  viewer: Viewer,
  opts: { cursor?: string; category?: Category }
): Promise<{
  pinned: PostDTO[];
  items: Array<PostDTO | AdDTO>;
  next_cursor: string | null;
}> {
  // $1 is the viewer inside selectPosts, so our params start at $2.
  const where = [...VISIBLE, 'p.pinned_at IS NULL'];
  const params: unknown[] = [];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length + 1}`;
  };
  if (opts.category) where.push(`p.category = ${add(opts.category)}`);
  let pinned: PostDTO[] = [];
  let offset = 0;
  if (opts.cursor) {
    const c = decodeCursor(opts.cursor);
    if (!c) throw new CommunityError(400, 'invalid_cursor');
    offset = c.offset;
    where.push(
      `(p.created_at, p.id) < (${add(c.ts)}::timestamptz, ${add(c.id)}::uuid)`
    );
  } else {
    const pinWhere = [...VISIBLE, 'p.pinned_at IS NOT NULL'];
    const pinParams: unknown[] = [];
    if (opts.category) {
      pinParams.push(opts.category);
      pinWhere.push(`p.category = $2`);
    }
    pinned = (
      await selectPosts(viewer, {
        where: pinWhere,
        params: pinParams,
        orderBy: 'p.pinned_at DESC',
        limit: MAX_PINNED,
      })
    ).map(strip);
  }
  const rows = await selectPosts(viewer, {
    where,
    params,
    orderBy: 'p.created_at DESC, p.id DESC',
    limit: FEED_PAGE_SIZE,
  });
  const ads = await activeAdsForFeed();
  const posts = rows.map(strip);
  const last = rows[rows.length - 1];
  return {
    pinned,
    items: interleaveAds<PostDTO, AdDTO>(posts, ads, offset),
    next_cursor:
      rows.length === FEED_PAGE_SIZE && last
        ? encodeCursor(last.cursor_ts, last.id, offset + rows.length)
        : null,
  };
}

export async function newCount(
  viewer: Viewer,
  sinceId: string | undefined
): Promise<number> {
  if (!sinceId || !/^[0-9a-f-]{36}$/i.test(sinceId)) return 0;
  const r = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM community_posts p, community_posts s
      WHERE s.id = $2
        AND p.deleted_at IS NULL AND ${VISIBLE.join(' AND ')}
        AND (p.created_at, p.id) > (s.created_at, s.id)`,
    [viewer.id, sinceId]
  );
  return r.rows[0]?.n ?? 0;
}

export async function getPost(
  viewer: Viewer,
  postId: string
): Promise<PostDTO> {
  const rows = await selectPosts(viewer, {
    where: [...VISIBLE, 'p.id = $2'],
    params: [postId],
    orderBy: 'p.created_at DESC',
    limit: 1,
  });
  if (!rows[0]) throw new CommunityError(404, 'post_not_found');
  return strip(rows[0]);
}

export async function assertCanParticipate(viewer: Viewer): Promise<void> {
  if (isAdminRole(viewer.role)) return;
  const r = await pool.query<{ terms: boolean; muted: boolean }>(
    `SELECT community_terms_accepted_at IS NOT NULL AS terms,
            COALESCE(community_muted_until > now(), false) AS muted
       FROM users WHERE id = $1`,
    [viewer.id]
  );
  const u = r.rows[0];
  if (!u?.terms) throw new CommunityError(403, 'terms_required');
  if (u.muted) throw new CommunityError(403, 'muted');
}

async function countPinned(): Promise<number> {
  const r = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM community_posts
      WHERE pinned_at IS NOT NULL AND deleted_at IS NULL AND hidden_at IS NULL`
  );
  return r.rows[0].n;
}

export async function createPost(
  viewer: Viewer,
  input: {
    kind: PostKind;
    category: Category;
    body: string;
    media: MediaInput[];
    event_location?: string | null;
    event_starts_at?: string | null;
    pin?: boolean;
  }
): Promise<PostDTO> {
  if (input.kind !== 'post' && !isAdminRole(viewer.role))
    throw new CommunityError(403, 'forbidden');
  await assertCanParticipate(viewer);
  const body = input.body.trim();
  if (!body && input.media.length === 0)
    throw new CommunityError(400, 'empty_post');
  validateMedia(input.media);
  if (input.pin && (await countPinned()) >= MAX_PINNED)
    throw new CommunityError(409, 'pin_limit');

  const postId = randomUUID();
  const stored = await uploadPostMedia(postId, input.media);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO community_posts
         (id, author_id, kind, category, body, event_location, event_starts_at, pinned_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $8::boolean THEN now() END)`,
      [
        postId,
        viewer.id,
        input.kind,
        input.category,
        body,
        input.kind === 'event' ? (input.event_location ?? null) : null,
        input.kind === 'event' ? (input.event_starts_at ?? null) : null,
        input.pin ?? false,
      ]
    );
    for (const m of stored) {
      await client.query(
        `INSERT INTO community_post_media
           (post_id, storage_path, thumb_path, url, thumb_url, width, height, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          postId,
          m.storage_path,
          m.thumb_path,
          m.url,
          m.thumb_url,
          m.width,
          m.height,
          m.position,
        ]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    await deleteMediaObjects(
      stored.flatMap((m) => [m.storage_path, m.thumb_path])
    );
    throw e;
  } finally {
    client.release();
  }
  return getPost(viewer, postId);
}

export async function deletePost(
  viewer: Viewer,
  postId: string
): Promise<void> {
  const r = await pool.query<{ author_id: string }>(
    `SELECT author_id FROM community_posts WHERE id = $1 AND deleted_at IS NULL`,
    [postId]
  );
  const post = r.rows[0];
  if (!post) throw new CommunityError(404, 'post_not_found');
  if (post.author_id !== viewer.id && !isAdminRole(viewer.role))
    throw new CommunityError(403, 'forbidden');
  await pool.query(
    `UPDATE community_posts SET deleted_at = now(), pinned_at = NULL WHERE id = $1`,
    [postId]
  );
  const media = await pool.query<{ storage_path: string; thumb_path: string }>(
    `SELECT storage_path, thumb_path FROM community_post_media WHERE post_id = $1`,
    [postId]
  );
  await deleteMediaObjects(
    media.rows.flatMap((m) => [m.storage_path, m.thumb_path])
  );
}

/** 404 unless the post exists, is not deleted/hidden and its author is not blocked either way. */
async function assertVisiblePost(
  viewer: Viewer,
  postId: string
): Promise<{ author_id: string; kind: PostKind }> {
  const r = await pool.query<{ author_id: string; kind: PostKind }>(
    `SELECT p.author_id, p.kind FROM community_posts p
      WHERE p.id = $2 AND p.deleted_at IS NULL AND ${VISIBLE.join(' AND ')}`,
    [viewer.id, postId]
  );
  if (!r.rows[0]) throw new CommunityError(404, 'post_not_found');
  return r.rows[0];
}

export interface ReactorDTO {
  id: string;
  name: string;
  avatar_url: string | null;
  emoji: ReactionEmoji;
}

/**
 * Who reacted. Only the post author gets the names; everyone else keeps the
 * public counts on the post itself. Admins do not bypass this.
 */
export async function listReactors(
  viewer: Viewer,
  postId: string
): Promise<ReactorDTO[]> {
  const post = await pool.query<{ author_id: string }>(
    `SELECT author_id FROM community_posts WHERE id = $1 AND deleted_at IS NULL`,
    [postId]
  );
  if (!post.rows[0]) throw new CommunityError(404, 'post_not_found');
  if (post.rows[0].author_id !== viewer.id)
    throw new CommunityError(403, 'forbidden');

  const people = await pool.query<ReactorDTO>(
    `SELECT u.id, ${AUTHOR_NAME_SQL('u', 'ap', 'cp')} AS name, ap.avatar_url, l.emoji
       FROM community_likes l
       JOIN users u ON u.id = l.user_id
       LEFT JOIN athlete_profiles ap ON ap.user_id = u.id
       LEFT JOIN coach_profiles cp ON cp.user_id = u.id
      WHERE l.post_id = $1
      ORDER BY l.created_at DESC, u.id`,
    [postId]
  );
  return people.rows;
}

/** One reaction per user per post; a new emoji replaces the previous one, null removes it. */
export async function setReaction(
  viewer: Viewer,
  postId: string,
  emoji: ReactionEmoji | null
): Promise<void> {
  await assertVisiblePost(viewer, postId);
  if (emoji) {
    await pool.query(
      `INSERT INTO community_likes (post_id, user_id, emoji) VALUES ($1, $2, $3)
       ON CONFLICT (post_id, user_id)
       DO UPDATE SET emoji = EXCLUDED.emoji, created_at = now()
       WHERE community_likes.emoji <> EXCLUDED.emoji`,
      [postId, viewer.id, emoji]
    );
  } else {
    await pool.query(
      `DELETE FROM community_likes WHERE post_id = $1 AND user_id = $2`,
      [postId, viewer.id]
    );
  }
}

interface CommentRow {
  id: string;
  post_id: string;
  body: string;
  created_at: Date;
  cursor_ts: string;
  author_id: string;
  author_name: string;
  author_avatar: string | null;
  author_role: Role;
}

const COMMENT_SELECT = `
  SELECT c.id, c.post_id, c.body, c.created_at, ${CURSOR_TS_SQL('c.created_at')} AS cursor_ts,
         c.author_id, ${AUTHOR_NAME_SQL('u', 'ap', 'cp')} AS author_name,
         ap.avatar_url AS author_avatar, u.role AS author_role
    FROM community_comments c
    JOIN users u ON u.id = c.author_id
    LEFT JOIN athlete_profiles ap ON ap.user_id = u.id
    LEFT JOIN coach_profiles cp ON cp.user_id = u.id`;

function toCommentDTO(row: CommentRow, viewer: Viewer): CommentDTO {
  return {
    id: row.id,
    post_id: row.post_id,
    body: row.body,
    created_at: new Date(row.created_at).toISOString(),
    author: {
      id: row.author_id,
      name: row.author_name,
      avatar_url: row.author_avatar,
      is_coach: isAdminRole(row.author_role),
    },
    can_delete: row.author_id === viewer.id || isAdminRole(viewer.role),
  };
}

export async function listComments(
  viewer: Viewer,
  postId: string,
  cursor?: string
): Promise<{ items: CommentDTO[]; next_cursor: string | null }> {
  await assertVisiblePost(viewer, postId);
  const params: unknown[] = [viewer.id, postId];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const where = [
    'c.post_id = $2',
    'c.deleted_at IS NULL',
    'c.hidden_at IS NULL',
    visibleAuthorsClause('c.author_id', '$1'),
  ];
  if (cursor) {
    const c = decodeCursor(cursor);
    if (!c) throw new CommunityError(400, 'invalid_cursor');
    where.push(
      `(c.created_at, c.id) > (${add(c.ts)}::timestamptz, ${add(c.id)}::uuid)`
    );
  }
  const r = await pool.query<CommentRow>(
    `${COMMENT_SELECT} WHERE ${where.join(' AND ')}
      ORDER BY c.created_at ASC, c.id ASC LIMIT ${COMMENTS_PAGE_SIZE}`,
    params
  );
  const last = r.rows[r.rows.length - 1];
  return {
    items: r.rows.map((row) => toCommentDTO(row, viewer)),
    next_cursor:
      r.rows.length === COMMENTS_PAGE_SIZE && last
        ? encodeCursor(last.cursor_ts, last.id)
        : null,
  };
}

export async function createComment(
  viewer: Viewer,
  postId: string,
  body: string
): Promise<CommentDTO> {
  await assertCanParticipate(viewer);
  const post = await assertVisiblePost(viewer, postId);
  const ins = await pool.query<{ id: string }>(
    `INSERT INTO community_comments (post_id, author_id, body) VALUES ($1, $2, $3) RETURNING id`,
    [postId, viewer.id, body.trim()]
  );
  const r = await pool.query<CommentRow>(`${COMMENT_SELECT} WHERE c.id = $1`, [
    ins.rows[0].id,
  ]);
  const dto = toCommentDTO(r.rows[0], viewer);
  if (post.author_id !== viewer.id) {
    void notifyUser(post.author_id, 'community_comment', {
      postId,
      commenter: dto.author.name,
    }).catch((e) => logger.error({ err: e }, 'community comment push failed'));
  }
  return dto;
}

export async function deleteComment(
  viewer: Viewer,
  commentId: string
): Promise<void> {
  const r = await pool.query<{ author_id: string }>(
    `SELECT author_id FROM community_comments WHERE id = $1 AND deleted_at IS NULL`,
    [commentId]
  );
  const c = r.rows[0];
  if (!c) throw new CommunityError(404, 'comment_not_found');
  if (c.author_id !== viewer.id && !isAdminRole(viewer.role))
    throw new CommunityError(403, 'forbidden');
  await pool.query(
    `UPDATE community_comments SET deleted_at = now() WHERE id = $1`,
    [commentId]
  );
}

export async function setRsvp(
  viewer: Viewer,
  postId: string,
  going: boolean
): Promise<void> {
  const post = await assertVisiblePost(viewer, postId);
  if (post.kind !== 'event') throw new CommunityError(400, 'not_an_event');
  if (going) {
    await pool.query(
      `INSERT INTO community_event_rsvps (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [postId, viewer.id]
    );
  } else {
    await pool.query(
      `DELETE FROM community_event_rsvps WHERE post_id = $1 AND user_id = $2`,
      [postId, viewer.id]
    );
  }
}

export async function listBlocks(
  userId: string
): Promise<Array<{ id: string; name: string; avatar_url: string | null }>> {
  const r = await pool.query<{
    id: string;
    name: string;
    avatar_url: string | null;
  }>(
    `SELECT u.id, ${AUTHOR_NAME_SQL('u', 'ap', 'cp')} AS name, ap.avatar_url
       FROM community_blocks b
       JOIN users u ON u.id = b.blocked_id
       LEFT JOIN athlete_profiles ap ON ap.user_id = u.id
       LEFT JOIN coach_profiles cp ON cp.user_id = u.id
      WHERE b.blocker_id = $1
      ORDER BY b.created_at DESC`,
    [userId]
  );
  return r.rows;
}

export async function setBlock(
  userId: string,
  blockedId: string,
  blocked: boolean
): Promise<void> {
  if (userId === blockedId) throw new CommunityError(400, 'cannot_block_self');
  if (!blocked) {
    await pool.query(
      `DELETE FROM community_blocks WHERE blocker_id = $1 AND blocked_id = $2`,
      [userId, blockedId]
    );
    return;
  }
  const exists = await pool.query(`SELECT 1 FROM users WHERE id = $1`, [
    blockedId,
  ]);
  if (!exists.rowCount) throw new CommunityError(404, 'user_not_found');
  await pool.query(
    `INSERT INTO community_blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, blockedId]
  );
}

export async function acceptTerms(userId: string): Promise<void> {
  await pool.query(
    `UPDATE users SET community_terms_accepted_at = COALESCE(community_terms_accepted_at, now()) WHERE id = $1`,
    [userId]
  );
}

export async function markSeen(userId: string): Promise<void> {
  await pool.query(`UPDATE users SET community_seen_at = now() WHERE id = $1`, [
    userId,
  ]);
}

export async function communityFlags(userId: string): Promise<{
  community_enabled: boolean;
  community_terms_accepted: boolean;
  community_unseen: boolean;
}> {
  const r = await pool.query<{
    enabled: boolean;
    terms: boolean;
    unseen: boolean;
  }>(
    `SELECT (SELECT community_launched_on IS NOT NULL FROM platform_fee_config WHERE id = 1) AS enabled,
            u.community_terms_accepted_at IS NOT NULL AS terms,
            EXISTS (
              SELECT 1 FROM community_comments c
                JOIN community_posts p ON p.id = c.post_id
               WHERE p.author_id = u.id AND p.deleted_at IS NULL
                 AND c.author_id <> u.id AND c.deleted_at IS NULL AND c.hidden_at IS NULL
                 AND c.created_at > COALESCE(u.community_seen_at, '-infinity'::timestamptz)
            ) AS unseen
       FROM users u WHERE u.id = $1`,
    [userId]
  );
  const row = r.rows[0];
  return {
    community_enabled: row?.enabled ?? false,
    community_terms_accepted: row?.terms ?? false,
    community_unseen: row?.unseen ?? false,
  };
}
