-- Quarterly and annual promo prices, edited from Datos de pago and from the
-- athlete's Membresía tab (same shape as the vacation maintenance price).
-- Null until the coach saves one. A single charge can still use another amount.
-- Registering the promo is a real payment: access stays on (or comes back)
-- and paid_until moves 3 calendar months (trimestral) or 12 (anual).
ALTER TABLE billing_settings
  ADD COLUMN IF NOT EXISTS quarterly_promo_ars NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS annual_promo_ars NUMERIC(12,2);

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_kind_check;
ALTER TABLE payments ADD CONSTRAINT payments_kind_check
  CHECK (kind IN ('membership', 'vacation', 'quarterly', 'annual'));
