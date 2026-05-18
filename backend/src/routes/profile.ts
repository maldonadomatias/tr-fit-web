import { Router } from 'express';
import { z } from 'zod';
import pool from '../db/connect.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { measurementPayload, notificationPrefsPayload } from '../domain/schemas.js';
import { createMeasurement, listMeasurements } from '../services/measurement.service.js';
import {
  listUserUnits,
  setUserUnit,
  DEFAULT_UNIT_BY_EQUIPMENT,
  EquipmentUnitsError,
} from '../services/equipment-units.service.js';

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

router.get('/notification-prefs', requireAuth, requireRole('athlete'), async (req, res) => {
  const r = await pool.query<{ notification_prefs: Record<string, boolean> }>(
    `SELECT notification_prefs FROM users WHERE id = $1`,
    [req.user!.id],
  );
  if (!r.rows[0]) return res.status(404).json({ error: 'not_found' });
  res.json({ notification_prefs: r.rows[0].notification_prefs });
});

router.patch('/notification-prefs', requireAuth, requireRole('athlete'), async (req, res) => {
  const parsed = notificationPrefsPayload.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_payload', issues: parsed.error.issues });
  }
  const r = await pool.query<{ notification_prefs: Record<string, boolean> }>(
    `UPDATE users SET notification_prefs = notification_prefs || $1::jsonb
      WHERE id = $2 RETURNING notification_prefs`,
    [JSON.stringify(parsed.data), req.user!.id],
  );
  return res.json({ notification_prefs: r.rows[0].notification_prefs });
});

const setEquipmentUnitPayload = z.object({
  equipment: z.string().min(1),
  unit: z.enum(['kg', 'ladrillos']),
});

router.get(
  '/equipment-units',
  requireAuth,
  requireRole('athlete'),
  async (req, res) => {
    const rows = await listUserUnits(req.user!.id);
    const merged: Record<string, 'kg' | 'ladrillos'> = { ...DEFAULT_UNIT_BY_EQUIPMENT };
    for (const r of rows) merged[r.equipment] = r.unit;
    res.json(
      Object.entries(merged).map(([equipment, unit]) => ({ equipment, unit })),
    );
  },
);

router.put(
  '/equipment-units',
  requireAuth,
  requireRole('athlete'),
  async (req, res) => {
    const parsed = setEquipmentUnitPayload.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_payload', issues: parsed.error.issues });
    }
    try {
      await setUserUnit(req.user!.id, parsed.data.equipment, parsed.data.unit);
      return res.json({ ok: true });
    } catch (e) {
      if (e instanceof EquipmentUnitsError) {
        return res.status(400).json({ error: e.reason });
      }
      throw e;
    }
  },
);

export default router;
