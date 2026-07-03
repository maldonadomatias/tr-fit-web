-- Membership freeze (injury/vacation): the clock stops while paused and the
-- remaining paid days are credited back on resume (paid_until shifts by the
-- paused duration). A paused membership denies login/refresh access.
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_status_check;
ALTER TABLE memberships ADD CONSTRAINT memberships_status_check
  CHECK (status IN ('active', 'expiring', 'expired', 'cancelled', 'paused'));

ALTER TABLE memberships ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;
