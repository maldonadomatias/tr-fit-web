-- 066 — Emoji reactions. community_likes becomes the reactions table: one
-- reaction per user per post (existing PK), fixed emoji set. Existing likes
-- become ❤️ through the column default.
ALTER TABLE community_likes
  ADD COLUMN IF NOT EXISTS emoji TEXT NOT NULL DEFAULT '❤️'
  CHECK (emoji IN ('❤️', '🔥', '💪', '👏', '😂', '😮'));
