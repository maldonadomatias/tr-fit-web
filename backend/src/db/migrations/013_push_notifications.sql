-- 013 — Push notifications: tokens, log, user prefs, timezone

CREATE TABLE push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  platform text NOT NULL CHECK (platform IN ('ios','android','web')),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_push_tokens_user ON push_tokens(user_id);

CREATE TABLE notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'session_reminder','session_missed','week_start',
    'skeleton_approved','sos_resolved','rm_test_week'
  )),
  sent_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb,
  delivery_status text NOT NULL DEFAULT 'sent'
    CHECK (delivery_status IN ('sent','failed','token_invalid'))
);
CREATE INDEX idx_notif_log_user_type_date ON notification_log(user_id, type, sent_at DESC);

ALTER TABLE users
  ADD COLUMN timezone text NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  ADD COLUMN notification_prefs jsonb NOT NULL DEFAULT '{
    "session_reminder": true,
    "session_missed": true,
    "week_start": true,
    "skeleton_approved": true,
    "sos_resolved": true,
    "rm_test_week": true
  }'::jsonb;
