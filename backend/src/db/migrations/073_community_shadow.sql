-- 073 — Shadow accounts (store review demo user): their community activity is
-- visible only to themselves.
ALTER TABLE users
  ADD COLUMN community_shadow BOOLEAN NOT NULL DEFAULT false;
