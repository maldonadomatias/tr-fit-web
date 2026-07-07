-- 055 — Optional coach note on an RM test. Lets the coach record WHY an RM was
-- manually edited (e.g. "lesión hombro", "gripe — bajar RM temporal") when they
-- lower a student's RM during injury/illness. Nullable, no behaviour change to
-- the weight engine, which only reads value_kg.
ALTER TABLE rm_tests
  ADD COLUMN IF NOT EXISTS coach_note TEXT;
