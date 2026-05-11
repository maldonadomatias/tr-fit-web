import { Router } from 'express';
import pool from '../db/connect.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { measurementPayload } from '../domain/schemas.js';
import { createMeasurement, listMeasurements } from '../services/measurement.service.js';

const router = Router();

router.get('/status', requireAuth, requireRole('athlete'), async (req, res) => {
  const r = await pool.query(
    `SELECT 1 FROM athlete_profiles WHERE user_id = $1`,
    [req.user!.id],
  );
  res.json({ has_profile: (r.rowCount ?? 0) > 0 });
});

router.get('/measurements', requireAuth, requireRole('athlete'), async (req, res) => {
  const rows = await listMeasurements(req.user!.id);
  res.json(rows);
});

router.post('/measurements', requireAuth, requireRole('athlete'), async (req, res) => {
  const parsed = measurementPayload.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_payload', issues: parsed.error.issues });
  }
  const row = await createMeasurement(req.user!.id, parsed.data, 'manual');
  return res.status(201).json(row);
});

export default router;
