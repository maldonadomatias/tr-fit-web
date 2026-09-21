import pool from '../db/connect.js';
import logger from '../utils/logger.js';
import { notifyUser } from './notification.service.js';
import {
  AUTHOR_NAME_SQL,
  CommunityError,
  FEED_PAGE_SIZE,
  MAX_PINNED,
  decodeCursor,
  encodeCursor,
  selectPosts,
  type PostDTO,
  type Viewer,
} from './community.service.js';

type TargetType = 'post' | 'comment';

async function targetExists(type: TargetType, id: string): Promise<boolean> {
  const table = type === 'post' ? 'community_posts' : 'community_comments';
  const r = await pool.query(
    `SELECT 1 FROM ${table} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return (r.rowCount ?? 0) > 0;
}

async function adminIds(): Promise<string[]> {
  const r = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE role IN ('admin', 'superadmin')`
  );
  return r.rows.map((row) => row.id);
}

function fireAndLog(p: Promise<void>, msg: string): void {
  void p.catch((e) => logger.error({ err: e }, msg));
}

export async function createReport(
  reporterId: string,
  input: {
    target_type: TargetType;
    target_id: string;
    reason: 'offensive' | 'spam' | 'inappropriate' | 'other';
    note?: string;
  }
): Promise<{ created: boolean; id: string }> {
  if (!(await targetExists(input.target_type, input.target_id)))
    throw new CommunityError(404, 'target_not_found');
  const ins = await pool.query<{ id: string }>(
    `INSERT INTO community_reports (reporter_id, target_type, target_id, reason, note)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (reporter_id, target_type, target_id) DO NOTHING
     RETURNING id`,
    [
      reporterId,
      input.target_type,
      input.target_id,
      input.reason,
      input.note ?? null,
    ]
  );
  if (ins.rows[0]) {
    const id = ins.rows[0].id;
    for (const adminId of await adminIds()) {
      fireAndLog(
        notifyUser(adminId, 'community_report', {
          reportId: id,
          reason: input.reason,
        }),
        'report push failed'
      );
    }
    return { created: true, id };
  }
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM community_reports WHERE reporter_id = $1 AND target_type = $2 AND target_id = $3`,
    [reporterId, input.target_type, input.target_id]
  );
  return { created: false, id: existing.rows[0].id };
}

/** ponytail: sequential per-user push; fine for ~100 athletes, batch if the roster grows to thousands. */
export async function notifyAllAthletes(
  type: 'community_announcement' | 'community_event',
  vars: Record<string, string>
): Promise<void> {
  const r = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE role = 'athlete' AND status = 'approved'`
  );
  for (const { id } of r.rows)
    fireAndLog(notifyUser(id, type, vars), 'community broadcast push failed');
}

export async function listAdminPosts(
  viewer: Viewer,
  opts: { cursor?: string; includeHidden: boolean }
): Promise<{ items: PostDTO[]; next_cursor: string | null }> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length + 1}`; // $1 is the viewer inside selectPosts
  };
  if (!opts.includeHidden) where.push('p.hidden_at IS NULL');
  if (opts.cursor) {
    const c = decodeCursor(opts.cursor);
    if (!c) throw new CommunityError(400, 'invalid_cursor');
    where.push(
      `(p.created_at, p.id) < (${add(c.ts)}::timestamptz, ${add(c.id)}::uuid)`
    );
  }
  const rows = await selectPosts(viewer, {
    where,
    params,
    orderBy: 'p.created_at DESC, p.id DESC',
    limit: FEED_PAGE_SIZE,
    admin: true,
  });
  const last = rows[rows.length - 1];
  return {
    items: rows.map(({ cursor_ts: _c, ...rest }) => rest),
    next_cursor:
      rows.length === FEED_PAGE_SIZE && last
        ? encodeCursor(last.cursor_ts, last.id)
        : null,
  };
}

export async function setPinned(
  postId: string,
  pinned: boolean
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize pin changes so two concurrent pins can't both pass the limit check.
    await client.query(
      `LOCK TABLE community_posts IN SHARE ROW EXCLUSIVE MODE`
    );
    const cur = await client.query<{ pinned: boolean }>(
      `SELECT pinned_at IS NOT NULL AS pinned FROM community_posts WHERE id = $1 AND deleted_at IS NULL`,
      [postId]
    );
    if (!cur.rows[0]) throw new CommunityError(404, 'post_not_found');
    if (pinned && !cur.rows[0].pinned) {
      const n = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM community_posts
          WHERE pinned_at IS NOT NULL AND deleted_at IS NULL AND hidden_at IS NULL`
      );
      if (n.rows[0].n >= MAX_PINNED) throw new CommunityError(409, 'pin_limit');
      await client.query(
        `UPDATE community_posts SET pinned_at = now() WHERE id = $1`,
        [postId]
      );
    } else if (!pinned) {
      await client.query(
        `UPDATE community_posts SET pinned_at = NULL WHERE id = $1`,
        [postId]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function setPostHidden(
  postId: string,
  hidden: boolean,
  adminId: string
): Promise<void> {
  const r = await pool.query(
    hidden
      ? `UPDATE community_posts SET hidden_at = now(), hidden_by = $2 WHERE id = $1 AND deleted_at IS NULL`
      : `UPDATE community_posts SET hidden_at = NULL, hidden_by = NULL WHERE id = $1 AND deleted_at IS NULL AND $2::uuid IS NOT NULL`,
    [postId, adminId]
  );
  if (!r.rowCount) throw new CommunityError(404, 'post_not_found');
}

export async function hideComment(commentId: string): Promise<void> {
  const r = await pool.query(
    `UPDATE community_comments SET hidden_at = now() WHERE id = $1 AND deleted_at IS NULL`,
    [commentId]
  );
  if (!r.rowCount) throw new CommunityError(404, 'comment_not_found');
}

export async function listRsvps(postId: string): Promise<
  Array<{
    id: string;
    name: string;
    avatar_url: string | null;
    created_at: string;
  }>
> {
  const r = await pool.query<{
    id: string;
    name: string;
    avatar_url: string | null;
    created_at: Date;
  }>(
    `SELECT u.id, ${AUTHOR_NAME_SQL('u', 'ap', 'cp')} AS name, ap.avatar_url, r.created_at
       FROM community_event_rsvps r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN athlete_profiles ap ON ap.user_id = u.id
       LEFT JOIN coach_profiles cp ON cp.user_id = u.id
      WHERE r.post_id = $1
      ORDER BY r.created_at`,
    [postId]
  );
  return r.rows.map((row) => ({
    ...row,
    created_at: new Date(row.created_at).toISOString(),
  }));
}

export interface ReportDTO {
  id: string;
  target_type: TargetType;
  target_id: string;
  reason: string;
  note: string | null;
  status: 'open' | 'actioned' | 'dismissed';
  created_at: string;
  age_hours: number;
  reporter: { id: string; name: string };
  content: {
    body: string;
    author_id: string;
    author_name: string;
    hidden: boolean;
    media: Array<{ thumb_url: string }>;
    post_id: string;
  } | null;
}

export async function listReports(
  status: 'open' | 'actioned' | 'dismissed'
): Promise<ReportDTO[]> {
  const r = await pool.query<{
    id: string;
    target_type: TargetType;
    target_id: string;
    reason: string;
    note: string | null;
    status: ReportDTO['status'];
    created_at: Date;
    age_hours: string;
    reporter_id: string;
    reporter_name: string;
    body: string | null;
    author_id: string | null;
    author_name: string | null;
    hidden: boolean | null;
    media: Array<{ thumb_url: string }> | null;
    post_id: string | null;
  }>(
    `SELECT r.id, r.target_type, r.target_id, r.reason, r.note, r.status, r.created_at,
            EXTRACT(EPOCH FROM (now() - r.created_at)) / 3600 AS age_hours,
            r.reporter_id, ${AUTHOR_NAME_SQL('ru', 'rap', 'rcp')} AS reporter_name,
            COALESCE(p.body, c.body) AS body,
            COALESCE(p.author_id, c.author_id) AS author_id,
            ${AUTHOR_NAME_SQL('au', 'aap', 'acp')} AS author_name,
            COALESCE(p.hidden_at, c.hidden_at) IS NOT NULL AS hidden,
            CASE WHEN p.id IS NOT NULL THEN
              COALESCE((SELECT json_agg(json_build_object('thumb_url', m.thumb_url) ORDER BY m.position)
                          FROM community_post_media m WHERE m.post_id = p.id), '[]'::json)
            END AS media,
            COALESCE(p.id, c.post_id) AS post_id
       FROM community_reports r
       JOIN users ru ON ru.id = r.reporter_id
       LEFT JOIN athlete_profiles rap ON rap.user_id = ru.id
       LEFT JOIN coach_profiles rcp ON rcp.user_id = ru.id
       LEFT JOIN community_posts p ON r.target_type = 'post' AND p.id = r.target_id
       LEFT JOIN community_comments c ON r.target_type = 'comment' AND c.id = r.target_id
       LEFT JOIN users au ON au.id = COALESCE(p.author_id, c.author_id)
       LEFT JOIN athlete_profiles aap ON aap.user_id = au.id
       LEFT JOIN coach_profiles acp ON acp.user_id = au.id
      WHERE r.status = $1
      ORDER BY r.created_at ASC`,
    [status]
  );
  return r.rows.map((row) => ({
    id: row.id,
    target_type: row.target_type,
    target_id: row.target_id,
    reason: row.reason,
    note: row.note,
    status: row.status,
    created_at: new Date(row.created_at).toISOString(),
    age_hours: Math.round(Number(row.age_hours) * 10) / 10,
    reporter: { id: row.reporter_id, name: row.reporter_name },
    content:
      row.author_id === null
        ? null
        : {
            body: row.body ?? '',
            author_id: row.author_id,
            author_name: row.author_name ?? 'Usuario',
            hidden: row.hidden ?? false,
            media: row.media ?? [],
            post_id: row.post_id!,
          },
  }));
}

export async function muteUser(
  userId: string,
  days: number | null
): Promise<void> {
  const r = await pool.query(
    `UPDATE users SET community_muted_until = CASE WHEN $2::int IS NULL THEN NULL
                                                   ELSE now() + make_interval(days => $2::int) END
      WHERE id = $1`,
    [userId, days]
  );
  if (!r.rowCount) throw new CommunityError(404, 'user_not_found');
}

export async function resolveReport(
  reportId: string,
  adminId: string,
  input: { action: 'hide' | 'dismiss' | 'mute'; mute_days?: number }
): Promise<void> {
  const r = await pool.query<{
    target_type: TargetType;
    target_id: string;
    status: string;
  }>(
    `SELECT target_type, target_id, status FROM community_reports WHERE id = $1`,
    [reportId]
  );
  const rep = r.rows[0];
  if (!rep) throw new CommunityError(404, 'report_not_found');

  if (input.action === 'dismiss') {
    await pool.query(
      `UPDATE community_reports SET status = 'dismissed', resolved_by = $2, resolved_at = now() WHERE id = $1`,
      [reportId, adminId]
    );
    return;
  }

  if (input.action === 'hide') {
    if (rep.target_type === 'post')
      await setPostHidden(rep.target_id, true, adminId).catch(() => undefined);
    else await hideComment(rep.target_id).catch(() => undefined);
  } else {
    if (!input.mute_days) throw new CommunityError(400, 'mute_days_required');
    const table =
      rep.target_type === 'post' ? 'community_posts' : 'community_comments';
    const a = await pool.query<{ author_id: string }>(
      `SELECT author_id FROM ${table} WHERE id = $1`,
      [rep.target_id]
    );
    if (!a.rows[0]) throw new CommunityError(404, 'target_not_found');
    await muteUser(a.rows[0].author_id, input.mute_days);
  }

  // This report plus every other open report on the same content.
  await pool.query(
    `UPDATE community_reports
        SET status = 'actioned', resolved_by = $3, resolved_at = now()
      WHERE (id = $4 OR status = 'open') AND target_type = $1 AND target_id = $2`,
    [rep.target_type, rep.target_id, adminId, reportId]
  );
}

export async function openReportCount(): Promise<number> {
  const r = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM community_reports WHERE status = 'open'`
  );
  return r.rows[0].n;
}
