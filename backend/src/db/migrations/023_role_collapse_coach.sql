-- Collapse the `coach` role into `admin` and introduce `superadmin`.
-- Single client deployment: there is at most one coach user; promote them
-- in place so coach_profiles and coach_alerts rows continue to refer to a
-- valid user with role='admin'.

UPDATE users SET role = 'admin' WHERE role = 'coach';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('athlete', 'admin', 'superadmin'));
