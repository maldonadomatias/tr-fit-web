-- 043 — Platform fee billed by the developer (superadmin) to the coach (admin).
-- Distinct from billing_settings (athlete-facing payment instructions).

CREATE TABLE IF NOT EXISTS platform_fee_config (
  id                         INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  base_fee_ars               NUMERIC(12,2) NOT NULL,
  reference_usd              NUMERIC(12,2) NOT NULL,
  current_usd                NUMERIC(12,2) NOT NULL,
  price_per_athlete_ars      NUMERIC(12,2) NOT NULL,
  revenue_share_pct          NUMERIC(5,2)  NOT NULL,
  adjustment_interval_months INT           NOT NULL DEFAULT 3,
  next_adjustment_date       DATE          NOT NULL,
  updated_at                 TIMESTAMPTZ   NOT NULL DEFAULT now()
);

INSERT INTO platform_fee_config
  (id, base_fee_ars, reference_usd, current_usd, price_per_athlete_ars,
   revenue_share_pct, adjustment_interval_months, next_adjustment_date)
VALUES
  (1, 105000, 1420, 1500, 25000, 4, 3, '2026-10-01')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS platform_fee_history (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period                DATE NOT NULL UNIQUE,
  base_fee_ars          NUMERIC(12,2) NOT NULL,
  active_athletes       INT NOT NULL,
  price_per_athlete_ars NUMERIC(12,2) NOT NULL,
  gross_revenue_ars     NUMERIC(14,2) NOT NULL,
  revenue_share_pct     NUMERIC(5,2)  NOT NULL,
  revenue_share_ars     NUMERIC(14,2) NOT NULL,
  total_ars             NUMERIC(14,2) NOT NULL,
  usd_at_snapshot       NUMERIC(12,2) NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
