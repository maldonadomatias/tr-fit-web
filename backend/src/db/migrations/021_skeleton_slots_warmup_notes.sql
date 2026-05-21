ALTER TABLE skeleton_slots DROP CONSTRAINT IF EXISTS skeleton_slots_role_check;

ALTER TABLE skeleton_slots
  ADD CONSTRAINT skeleton_slots_role_check
  CHECK (role IN ('calentamiento', 'principal', 'accesorio'));

ALTER TABLE skeleton_slots
  ADD COLUMN IF NOT EXISTS notes TEXT;
