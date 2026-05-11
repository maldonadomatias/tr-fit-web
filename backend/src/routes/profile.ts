import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { measurementPayload } from '../domain/schemas.js';
import { createMeasurement, listMeasurements } from '../services/measurement.service.js';

const router = Router();

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
