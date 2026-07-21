-- 057 — Store the athlete fee before onboarding creates athlete_profiles.
-- NUMERIC without precision intentionally has no application-level upper bound.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS monthly_fee_ars NUMERIC;

UPDATE users u
   SET monthly_fee_ars = ap.monthly_fee_ars
  FROM athlete_profiles ap
 WHERE ap.user_id = u.id
   AND u.monthly_fee_ars IS NULL;

ALTER TABLE users
  ADD CONSTRAINT users_monthly_fee_ars_nonnegative
  CHECK (monthly_fee_ars IS NULL OR monthly_fee_ars >= 0);
