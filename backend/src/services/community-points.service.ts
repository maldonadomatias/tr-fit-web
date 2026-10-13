import pool from '../db/connect.js';
import {
  AUTHOR_NAME_SQL,
  visibleAuthorsClause,
  type Viewer,
} from './community.service.js';

/** Single source of truth for community points. The app reads these from the API. */
export const POINTS = {
  post: 10,
  post_photo_bonus: 5,
  comment: 4,
  reaction: 1,
  rsvp: 3,
  reaction_received: 2,
  comment_received: 3,
} as const;

/** Max scoring actions per user per Buenos Aires day. Extra actions still happen, they just don't score. */
export const DAILY_CAPS = { post: 3, comment: 10, reaction: 20 } as const;

export const LEADERBOARD_SIZE = 5;
const TZ = 'America/Argentina/Buenos_Aires';

export interface LeaderboardEntry {
  rank: number;
  points: number;
  user: { id: string; name: string; avatar_url: string | null };
}
export interface Leaderboard {
  month: string;
  points: typeof POINTS;
  caps: typeof DAILY_CAPS;
  top: LeaderboardEntry[];
  me: { rank: number | null; points: number };
}

const LIVE = (p: string) =>
  `${p}.deleted_at IS NULL AND ${p}.hidden_at IS NULL`;

// ponytail: computed on every request over the whole month. Fine for one coach's
// community; move to a materialized view / ledger table if it gets slow or points become redeemable.
const LEADERBOARD_SQL = `
WITH acts AS (
  SELECT p.author_id AS user_id, 'post' AS action, p.created_at,
         ${POINTS.post} + CASE WHEN EXISTS (
           SELECT 1 FROM community_post_media m WHERE m.post_id = p.id
         ) THEN ${POINTS.post_photo_bonus} ELSE 0 END AS pts
    FROM community_posts p
   WHERE p.kind = 'post' AND ${LIVE('p')}
  UNION ALL
  SELECT c.author_id, 'comment', c.created_at, ${POINTS.comment}
    FROM community_comments c JOIN community_posts p ON p.id = c.post_id
   WHERE ${LIVE('c')} AND ${LIVE('p')} AND c.author_id <> p.author_id
  UNION ALL
  SELECT l.user_id, 'reaction', l.created_at, ${POINTS.reaction}
    FROM community_likes l JOIN community_posts p ON p.id = l.post_id
   WHERE ${LIVE('p')} AND l.user_id <> p.author_id
  UNION ALL
  SELECT r.user_id, 'rsvp', r.created_at, ${POINTS.rsvp}
    FROM community_event_rsvps r JOIN community_posts p ON p.id = r.post_id
   WHERE ${LIVE('p')}
  UNION ALL
  SELECT p.author_id, 'reaction_received', l.created_at, ${POINTS.reaction_received}
    FROM community_likes l JOIN community_posts p ON p.id = l.post_id
   WHERE p.kind = 'post' AND ${LIVE('p')} AND l.user_id <> p.author_id
  UNION ALL
  SELECT author_id, 'comment_received', created_at, ${POINTS.comment_received} FROM (
    SELECT DISTINCT ON (c.post_id, c.author_id) p.author_id, c.created_at
      FROM community_comments c JOIN community_posts p ON p.id = c.post_id
     WHERE p.kind = 'post' AND ${LIVE('c')} AND ${LIVE('p')} AND c.author_id <> p.author_id
     ORDER BY c.post_id, c.author_id, c.created_at
  ) first_comment
),
capped AS (
  SELECT user_id, action, pts,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, action, (created_at AT TIME ZONE $1::text)::date
           ORDER BY created_at
         ) AS n
    FROM acts
   WHERE created_at >= date_trunc('month', $2::timestamptz AT TIME ZONE $1::text) AT TIME ZONE $1::text
     AND created_at <= $2::timestamptz
),
ranked AS (
  SELECT t.user_id, t.points, RANK() OVER (ORDER BY t.points DESC)::int AS rank
    FROM (
      SELECT user_id, SUM(pts)::int AS points FROM capped
       WHERE n <= CASE action
                    WHEN 'post' THEN ${DAILY_CAPS.post}
                    WHEN 'comment' THEN ${DAILY_CAPS.comment}
                    WHEN 'reaction' THEN ${DAILY_CAPS.reaction}
                    ELSE n END
       GROUP BY user_id
    ) t
    JOIN users u ON u.id = t.user_id
   WHERE u.role = 'athlete' AND u.status = 'approved'
     AND NOT COALESCE(u.community_muted_until > now(), false)
)
SELECT r.user_id AS id, ${AUTHOR_NAME_SQL('u', 'ap', 'cp')} AS name, ap.avatar_url,
       r.points, r.rank
  FROM ranked r
  JOIN users u ON u.id = r.user_id
  LEFT JOIN athlete_profiles ap ON ap.user_id = u.id
  LEFT JOIN coach_profiles cp ON cp.user_id = u.id
 WHERE r.user_id = $3 OR ${visibleAuthorsClause('r.user_id', '$3')}
 ORDER BY r.rank, name, r.user_id`;

export async function getLeaderboard(
  viewer: Viewer,
  now: Date = new Date()
): Promise<Leaderboard> {
  const { rows } = await pool.query<{
    id: string;
    name: string;
    avatar_url: string | null;
    points: number;
    rank: number;
  }>(LEADERBOARD_SQL, [TZ, now.toISOString(), viewer.id]);

  const mine = rows.find((r) => r.id === viewer.id);
  return {
    month: now.toLocaleDateString('en-CA', { timeZone: TZ }).slice(0, 7),
    points: POINTS,
    caps: DAILY_CAPS,
    top: rows.slice(0, LEADERBOARD_SIZE).map((r) => ({
      rank: r.rank,
      points: r.points,
      user: { id: r.id, name: r.name, avatar_url: r.avatar_url },
    })),
    me: mine
      ? { rank: mine.rank, points: mine.points }
      : { rank: null, points: 0 },
  };
}
