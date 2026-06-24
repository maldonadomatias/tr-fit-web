-- 042 — Per-drop logging for dropset / superserie accessories.
-- A dropset series (reps like "10x10x10") is run as several "drops" at
-- DESCENDING weights inside ONE series — e.g. 3-2-1 ladrillos × 10/10/10 reps.
-- The app now logs one set_log row PER DROP so all three weights are recorded.
--
-- set_logs already keys uniqueness on client_id (not set_index), so multiple
-- rows can share a set_index (= the series number). drop_index tells them
-- apart: 1 = first/heaviest drop, 2, 3, …  NULL = a normal single-weight set
-- (every existing row stays NULL → behaviour unchanged).
--
-- Only the heaviest drop (drop_index = 1, or NULL for normal sets) seeds the
-- athlete's suggested weight — enforced in session.service, not here.

ALTER TABLE set_logs ADD COLUMN IF NOT EXISTS drop_index INT;
