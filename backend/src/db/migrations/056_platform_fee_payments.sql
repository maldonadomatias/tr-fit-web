-- 056 — Monthly payment records for the TR-FIT platform fee.

CREATE TABLE IF NOT EXISTS platform_fee_payments (
  period      DATE PRIMARY KEY,
  total_ars   NUMERIC(14,2) NOT NULL CHECK (total_ars >= 0),
  paid_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_fee_payments_recorded_by
  ON platform_fee_payments (recorded_by);
