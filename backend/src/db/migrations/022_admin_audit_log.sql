CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL,
  actor       TEXT NOT NULL,
  target      TEXT,
  target_id   UUID,
  meta        JSONB,
  severity    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created
  ON admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target
  ON admin_audit_log (target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_type
  ON admin_audit_log (type);
