CREATE TABLE community_posts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL DEFAULT 'post'
                   CHECK (kind IN ('post', 'announcement', 'event')),
  category         TEXT NOT NULL DEFAULT 'general'
                   CHECK (category IN ('general', 'meals', 'training')),
  body             TEXT NOT NULL DEFAULT '' CHECK (char_length(body) <= 2000),
  audience         TEXT NOT NULL DEFAULT 'all',
  pinned_at        TIMESTAMPTZ,
  event_location   TEXT,
  event_starts_at  TIMESTAMPTZ,
  hidden_at        TIMESTAMPTZ,
  hidden_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((kind = 'event') = (event_starts_at IS NOT NULL))
);
CREATE INDEX idx_community_posts_feed
  ON community_posts (created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND hidden_at IS NULL;

CREATE TABLE community_post_media (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL DEFAULT 'image' CHECK (kind IN ('image')),
  storage_path  TEXT NOT NULL,
  thumb_path    TEXT NOT NULL,
  url           TEXT NOT NULL,
  thumb_url     TEXT NOT NULL,
  width         INT NOT NULL,
  height        INT NOT NULL,
  position      SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 3),
  UNIQUE (post_id, position)
);

CREATE TABLE community_likes (
  post_id     UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE community_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  hidden_at   TIMESTAMPTZ,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_community_comments_post ON community_comments (post_id, created_at);

CREATE TABLE community_event_rsvps (
  post_id     UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE community_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type  TEXT NOT NULL CHECK (target_type IN ('post', 'comment')),
  target_id    UUID NOT NULL,
  reason       TEXT NOT NULL CHECK (reason IN ('offensive', 'spam', 'inappropriate', 'other')),
  note         TEXT CHECK (char_length(note) <= 500),
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'actioned', 'dismissed')),
  resolved_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reporter_id, target_type, target_id)
);
CREATE INDEX idx_community_reports_status ON community_reports (status, created_at);

CREATE TABLE community_blocks (
  blocker_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS community_terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS community_muted_until       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS community_seen_at           TIMESTAMPTZ;

-- Community push types.
ALTER TABLE notification_log DROP CONSTRAINT IF EXISTS notification_log_type_check;
ALTER TABLE notification_log ADD CONSTRAINT notification_log_type_check
  CHECK (type IN (
    'session_reminder','session_missed','week_start',
    'skeleton_approved','sos_resolved','rm_test_week',
    'membership_expiring','membership_expired',
    'community_announcement','community_event','community_comment','community_report'
  ));

ALTER TABLE users ALTER COLUMN notification_prefs SET DEFAULT '{
  "session_reminder": true,
  "session_missed": true,
  "week_start": true,
  "skeleton_approved": true,
  "sos_resolved": true,
  "rm_test_week": true,
  "membership_expiring": true,
  "membership_expired": true,
  "community_announcement": true,
  "community_event": true,
  "community_comment": true,
  "community_report": true
}'::jsonb;

UPDATE users SET notification_prefs = notification_prefs
  || '{"community_announcement": true, "community_event": true,
       "community_comment": true, "community_report": true}'::jsonb
  WHERE NOT (notification_prefs ? 'community_comment');
