-- Capture athlete contact data before onboarding creates athlete_profiles.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE users
  ADD CONSTRAINT users_first_name_valid
    CHECK (first_name IS NULL OR (length(trim(first_name)) BETWEEN 1 AND 100)),
  ADD CONSTRAINT users_last_name_valid
    CHECK (last_name IS NULL OR (length(trim(last_name)) BETWEEN 1 AND 100)),
  ADD CONSTRAINT users_phone_valid
    CHECK (phone IS NULL OR phone ~ '^\+\d{10,15}$');

-- Existing completed profiles become available through the same account-level
-- contact fields. Keep the full legacy name intact rather than guessing where
-- a compound first name or surname should be split.
UPDATE users u
   SET first_name = ap.name,
       phone = ap.phone
  FROM athlete_profiles ap
 WHERE ap.user_id = u.id
   AND u.first_name IS NULL;
