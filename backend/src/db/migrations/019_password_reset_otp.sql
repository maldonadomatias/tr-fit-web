-- Convert password_resets from link-based (sha256(token)) to OTP-based (bcrypt(6-digit-code))
ALTER TABLE password_resets RENAME COLUMN token_hash TO code_hash;
ALTER TABLE password_resets ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
-- Invalidate any in-flight link-based rows on deploy (column semantics changed)
UPDATE password_resets SET used_at = NOW() WHERE used_at IS NULL;
