-- Approval gate for new users. Existing users default to 'approved'
-- so the migration is non-breaking; signups will switch to 'pending'.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved'
  CHECK (status IN ('pending', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
