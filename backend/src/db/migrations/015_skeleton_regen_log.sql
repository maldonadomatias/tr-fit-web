-- 015 — Plan tier gating: backfill legacy + skeleton_regen_log

UPDATE athlete_profiles SET plan_interest = 'basico'
  WHERE plan_interest IS NULL;

CREATE TABLE skeleton_regen_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT now(),
  result text NOT NULL CHECK (result IN ('approved_gen','rate_limited','tier_blocked'))
);
CREATE INDEX idx_regen_athlete_date
  ON skeleton_regen_log(athlete_id, requested_at DESC);
