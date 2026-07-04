import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { pushRegisterPayload } from '../domain/schemas.js';
import pool from '../db/connect.js';

const router = Router();

router.post('/register', requireAuth, requireRole('athlete'), async (req, res, next) => {
  const parsed = pushRegisterPayload.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_payload', issues: parsed.error.issues });
  }
  const { token, platform } = parsed.data;
  try {
    await pool.query(
      `INSERT INTO push_tokens (user_id, token, platform)
       VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE
         SET user_id = EXCLUDED.user_id,
             platform = EXCLUDED.platform,
             last_seen_at = now()`,
      [req.user!.id, token, platform],
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

router.delete('/register', requireAuth, requireRole('athlete'), async (req, res, next) => {
  const parsed = pushRegisterPayload.pick({ token: true }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_payload' });
  }
  try {
    await pool.query(
      `DELETE FROM push_tokens WHERE token = $1 AND user_id = $2`,
      [parsed.data.token, req.user!.id],
    );
  } catch (e) {
    return next(e);
  }
  return res.status(204).end();
});

export default router;
