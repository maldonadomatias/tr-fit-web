-- 070 — One optional photo per comment. A comment needs text or a photo.
ALTER TABLE community_comments DROP CONSTRAINT IF EXISTS community_comments_body_check;
ALTER TABLE community_comments
  ADD CONSTRAINT community_comments_body_check CHECK (char_length(body) <= 500);

CREATE TABLE IF NOT EXISTS community_comment_media (
  comment_id    UUID PRIMARY KEY REFERENCES community_comments(id) ON DELETE CASCADE,
  storage_path  TEXT NOT NULL,
  thumb_path    TEXT NOT NULL,
  url           TEXT NOT NULL,
  thumb_url     TEXT NOT NULL,
  width         INT NOT NULL,
  height        INT NOT NULL
);
