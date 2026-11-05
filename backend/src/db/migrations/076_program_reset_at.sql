-- "Me cambié de gimnasio" rewinds current_week to 1 but keeps the session/set
-- history. Without a cycle boundary, the old cycle's week-N logs counted as
-- already done: pending days came back empty after day 1 and every finished
-- session closed (and advanced) another week. program_reset_at marks where the
-- current cycle starts; per-week queries ignore logs from before it.
ALTER TABLE athlete_program_state
  ADD COLUMN IF NOT EXISTS program_reset_at TIMESTAMPTZ;

-- Backfill athletes who already reset, from the alert the reset fires.
UPDATE athlete_program_state s
   SET program_reset_at = a.last_reset
  FROM (SELECT athlete_id, MAX(created_at) AS last_reset
          FROM coach_alerts WHERE type = 'program_reset'
         GROUP BY athlete_id) a
 WHERE a.athlete_id = s.athlete_id
   AND s.program_reset_at IS NULL;
