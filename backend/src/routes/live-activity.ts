import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { liveActivityRegisterPayload } from '../domain/schemas.js';
import pool from '../db/connect.js';

const router = Router();

// The app calls this when it starts a rest/cardio Live Activity. We enqueue an
// end push for `endMs`; the worker fires it so the 0:00 card is dismissed even
// if the app is killed. Content-state matches the widget's {name, props} shape.
router.post('/register', requireAuth, requireRole('athlete'), async (req, res, next) => {
  const parsed = liveActivityRegisterPayload.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_payload', issues: parsed.error.issues });
  }
  const { apnsToken, activityName, endMs, props } = parsed.data;
  const contentState = { name: activityName, props: JSON.stringify(props) };
  try {
    // Replace any still-active job for this token (pause/resume restarts).
    await pool.query(
      `UPDATE live_activity_jobs
          SET status = 'done', finished_at = now()
        WHERE apns_token = $1 AND status IN ('queued','running')`,
      [apnsToken],
    );
    await pool.query(
      `INSERT INTO live_activity_jobs
         (user_id, apns_token, activity_name, content_state, end_at, next_attempt_at)
       VALUES ($1, $2, $3, $4::jsonb, to_timestamp($5 / 1000.0), to_timestamp($5 / 1000.0))`,
      [req.user!.id, apnsToken, activityName, JSON.stringify(contentState), endMs],
    );
  } catch (e) {
    // FK violation: the JWT is still valid but the user row was deleted.
    // Answer 401 so the client discards the session instead of retrying.
    if ((e as { code?: string }).code === '23503') {
      return res.status(401).json({ error: 'invalid_token' });
    }
    return next(e);
  }
  return res.status(201).json({ ok: true });
});

export default router;
