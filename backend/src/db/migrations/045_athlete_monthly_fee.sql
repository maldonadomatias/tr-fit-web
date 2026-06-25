-- 045 — Per-athlete monthly fee (cuota). Drives the platform 4% revenue share.
ALTER TABLE athlete_profiles
  ADD COLUMN IF NOT EXISTS monthly_fee_ars NUMERIC(10,2) NOT NULL DEFAULT 25000;
