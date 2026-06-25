-- 044 — Billing phase for the platform fee.
-- 'testflight' (pre-launch): charge 50% of the base fee, no 4% revenue share.
-- 'production': full base fee + revenue share.
ALTER TABLE platform_fee_config
  ADD COLUMN IF NOT EXISTS phase TEXT NOT NULL DEFAULT 'production'
  CHECK (phase IN ('testflight', 'production'));

-- The app launches in TestFlight this month, so the live config starts there.
UPDATE platform_fee_config SET phase = 'testflight' WHERE id = 1;
