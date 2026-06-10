-- 032 — Notificaciones y alertas de cuota (membership).

-- 1. Permitir los nuevos tipos en el log de notificaciones.
ALTER TABLE notification_log DROP CONSTRAINT IF EXISTS notification_log_type_check;
ALTER TABLE notification_log ADD CONSTRAINT notification_log_type_check
  CHECK (type IN (
    'session_reminder','session_missed','week_start',
    'skeleton_approved','sos_resolved','rm_test_week',
    'membership_expiring','membership_expired'
  ));

-- 2. Default de prefs para usuarios nuevos.
ALTER TABLE users ALTER COLUMN notification_prefs SET DEFAULT '{
  "session_reminder": true,
  "session_missed": true,
  "week_start": true,
  "skeleton_approved": true,
  "sos_resolved": true,
  "rm_test_week": true,
  "membership_expiring": true,
  "membership_expired": true
}'::jsonb;

-- 3. Backfill: usuarios existentes opt-in a las nuevas notif de cuota.
UPDATE users SET notification_prefs = notification_prefs
  || '{"membership_expiring": true, "membership_expired": true}'::jsonb
  WHERE NOT (notification_prefs ? 'membership_expiring');

-- 4. Permitir los nuevos tipos de coach_alert (usado en una task posterior).
ALTER TABLE coach_alerts DROP CONSTRAINT IF EXISTS coach_alerts_type_check;
ALTER TABLE coach_alerts ADD CONSTRAINT coach_alerts_type_check
  CHECK (type IN (
    'sos_pain','sos_machine','rpe_flag','rm_skipped','rm_week_starting',
    'membership_expiring','membership_overdue'
  ));
