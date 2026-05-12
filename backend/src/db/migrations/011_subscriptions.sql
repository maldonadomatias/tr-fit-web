CREATE TABLE subscriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier                TEXT NOT NULL CHECK (tier IN ('basico', 'full', 'premium')),
  mp_preapproval_id   TEXT NOT NULL UNIQUE,
  mp_plan_id          TEXT NOT NULL,
  status              TEXT NOT NULL CHECK (status IN
                        ('pending', 'authorized', 'paused', 'cancelled')),
  current_period_end  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscriptions_athlete ON subscriptions(athlete_id);

CREATE TABLE mp_webhook_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    TEXT UNIQUE,
  payload     JSONB NOT NULL,
  processed   BOOLEAN NOT NULL DEFAULT false,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
