ALTER TABLE notification_log DROP CONSTRAINT IF EXISTS notification_log_type_check;
ALTER TABLE notification_log ADD CONSTRAINT notification_log_type_check
  CHECK (type IN (
    'session_reminder','session_missed','week_start',
    'skeleton_approved','sos_resolved','rm_test_week',
    'membership_expiring','membership_expired',
    'community_announcement','community_event','community_comment','community_report',
    'community_revision'
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
  "community_report": true,
  "community_revision": true
}'::jsonb;

UPDATE users SET notification_prefs = notification_prefs || '{"community_revision": true}'::jsonb
  WHERE NOT (notification_prefs ? 'community_revision');
