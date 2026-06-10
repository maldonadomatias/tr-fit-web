-- 031 — Datos de pago (transferencia) editables por admin. Single-row.
CREATE TABLE IF NOT EXISTS billing_settings (
  id         INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  alias      TEXT,
  cbu        TEXT,
  holder     TEXT,
  amount     NUMERIC(12,2),
  currency   TEXT NOT NULL DEFAULT 'ARS',
  note       TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO billing_settings (id, alias, cbu, holder, amount, currency, note)
VALUES (1, 'tato.fit', NULL, 'Tato Robles', 0, 'ARS',
        'Transferí el monto y avisá a tu coach. Te habilitamos al confirmar el pago.')
ON CONFLICT (id) DO NOTHING;
