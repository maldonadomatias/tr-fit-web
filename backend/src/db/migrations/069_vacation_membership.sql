-- Vacation hold: access stays blocked (same gate as paused) but paid_until is a
-- real expiry the coach picks, so the athlete sorts with every other vencimiento.
-- The charge is "mantenimiento de datos", not the monthly cuota. Coming back is
-- a normal payment, which reactivates access.
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_status_check;
ALTER TABLE memberships ADD CONSTRAINT memberships_status_check
  CHECK (status IN ('active', 'expiring', 'expired', 'cancelled', 'paused', 'vacation'));

ALTER TABLE payments ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'membership';
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_kind_check;
ALTER TABLE payments ADD CONSTRAINT payments_kind_check
  CHECK (kind IN ('membership', 'vacation'));

-- Today's maintenance price. Editable from Datos de pago and from the athlete's
-- "Pago por vacaciones" section. A single charge can still use another amount.
ALTER TABLE billing_settings
  ADD COLUMN IF NOT EXISTS vacation_fee_ars NUMERIC(12,2) NOT NULL DEFAULT 10000;
