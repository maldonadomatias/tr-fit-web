-- 072 — "Me gusta" on comments. One like per user per comment; only the
-- comment author can list who liked it (same rule as post reactions).
CREATE TABLE IF NOT EXISTS community_comment_likes (
  comment_id  UUID NOT NULL REFERENCES community_comments(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);
