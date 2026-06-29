-- Profile picture for athletes. Stores the public Firebase Storage download URL
-- (token-based, see avatar.service.ts). NULL = no picture, app falls back to initials.
ALTER TABLE athlete_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
