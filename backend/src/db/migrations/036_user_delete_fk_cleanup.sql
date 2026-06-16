-- 036_user_delete_fk_cleanup.sql
-- Deleting a user failed with FK violations because several tables reference
-- users(id) without an ON DELETE action (defaults to NO ACTION/RESTRICT).
-- progression_runs was the first blocker; coach_alerts.coach_id and the
-- nullable "actor" columns would block deletes of coaches/admins too.
--
-- Policy:
--   * NOT NULL owning rows (the athlete's own runs, alerts for a coach) cascade.
--   * Nullable "who did this" columns are nulled out so audit rows survive.

-- progression_runs.athlete_id (NOT NULL) -> cascade
ALTER TABLE progression_runs
  DROP CONSTRAINT IF EXISTS progression_runs_athlete_id_fkey,
  ADD CONSTRAINT progression_runs_athlete_id_fkey
    FOREIGN KEY (athlete_id) REFERENCES users(id) ON DELETE CASCADE;

-- coach_alerts.coach_id (NOT NULL) -> cascade
ALTER TABLE coach_alerts
  DROP CONSTRAINT IF EXISTS coach_alerts_coach_id_fkey,
  ADD CONSTRAINT coach_alerts_coach_id_fkey
    FOREIGN KEY (coach_id) REFERENCES users(id) ON DELETE CASCADE;

-- Nullable actor columns -> set null on delete
ALTER TABLE athlete_profiles
  DROP CONSTRAINT IF EXISTS athlete_profiles_coach_id_fkey,
  ADD CONSTRAINT athlete_profiles_coach_id_fkey
    FOREIGN KEY (coach_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE athlete_skeletons
  DROP CONSTRAINT IF EXISTS athlete_skeletons_reviewed_by_fkey,
  ADD CONSTRAINT athlete_skeletons_reviewed_by_fkey
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE coach_alerts
  DROP CONSTRAINT IF EXISTS coach_alerts_resolved_by_fkey,
  ADD CONSTRAINT coach_alerts_resolved_by_fkey
    FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE weekly_overrides
  DROP CONSTRAINT IF EXISTS weekly_overrides_created_by_fkey,
  ADD CONSTRAINT weekly_overrides_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_recorded_by_fkey,
  ADD CONSTRAINT payments_recorded_by_fkey
    FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL;
