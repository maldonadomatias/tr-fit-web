CREATE TABLE community_ads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name       TEXT NOT NULL,
  body             TEXT NOT NULL DEFAULT '' CHECK (char_length(body) <= 280),
  image_path       TEXT NOT NULL,
  image_url        TEXT NOT NULL,
  cta_label        TEXT NOT NULL,
  cta_url          TEXT NOT NULL,
  monthly_fee_ars  NUMERIC(12,2) NOT NULL CHECK (monthly_fee_ars >= 0),
  starts_on        DATE NOT NULL,
  ends_on          DATE NOT NULL CHECK (ends_on >= starts_on),
  archived_at      TIMESTAMPTZ,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE community_ad_events (
  ad_id    UUID NOT NULL REFERENCES community_ads(id) ON DELETE CASCADE,
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day      DATE NOT NULL,
  kind     TEXT NOT NULL CHECK (kind IN ('view', 'click')),
  PRIMARY KEY (ad_id, user_id, day, kind)
);
CREATE INDEX idx_community_ad_events_ad_day ON community_ad_events (ad_id, day);

ALTER TABLE platform_fee_config
  ADD COLUMN IF NOT EXISTS community_fee_ars          NUMERIC(12,2) NOT NULL DEFAULT 30000,
  ADD COLUMN IF NOT EXISTS community_fallback_fee_ars NUMERIC(12,2) NOT NULL DEFAULT 40000,
  ADD COLUMN IF NOT EXISTS community_revision_threshold_ars NUMERIC(12,2) NOT NULL DEFAULT 50000,
  ADD COLUMN IF NOT EXISTS ad_share_pct               NUMERIC(5,2)  NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS community_launched_on      DATE,
  ADD COLUMN IF NOT EXISTS community_revision_applied_at TIMESTAMPTZ;

ALTER TABLE platform_fee_history
  ADD COLUMN IF NOT EXISTS community_fee_ars NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ad_revenue_ars    NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ad_share_ars      NUMERIC(14,2) NOT NULL DEFAULT 0;
