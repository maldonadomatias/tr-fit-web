-- Time-bound athlete memberships + manual payment ledger.
-- Orthogonal to users.status (approval gate). paid_until is authoritative;
-- memberships.status is a cron-derived cache for dashboard/notifications.

CREATE TABLE IF NOT EXISTS memberships (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'expired'
                CHECK (status IN ('active', 'expiring', 'expired', 'cancelled')),
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_until  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_memberships_paid_until ON memberships(paid_until);
CREATE INDEX IF NOT EXISTS idx_memberships_status ON memberships(status);

CREATE TABLE IF NOT EXISTS payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paid_at       DATE NOT NULL,
  amount        NUMERIC(12,2) NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'ARS',
  method        TEXT NOT NULL DEFAULT 'transfer'
                  CHECK (method IN ('transfer', 'cash', 'mercadopago', 'other')),
  reference     TEXT,
  covers_until  TIMESTAMPTZ NOT NULL,
  recorded_by   UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id, created_at DESC);

-- Backfill: existing approved athletes keep access (infinity = always active)
-- so nobody is locked out on deploy. Admins move them to real dates over time.
INSERT INTO memberships (user_id, status, started_at, paid_until)
SELECT id, 'active', now(), 'infinity'::timestamptz
FROM users
WHERE role = 'athlete' AND status = 'approved'
ON CONFLICT (user_id) DO NOTHING;
