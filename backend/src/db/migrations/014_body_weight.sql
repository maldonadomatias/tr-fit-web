-- 014 — Body weight column on measurements (sub-4d charts)

ALTER TABLE athlete_measurements
  ADD COLUMN body_weight_kg numeric(5,2)
    CHECK (body_weight_kg IS NULL OR body_weight_kg BETWEEN 30 AND 300);
