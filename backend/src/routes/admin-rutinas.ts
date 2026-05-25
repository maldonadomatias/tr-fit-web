import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/role.js';
import {
  adminListAthletesQuery,
  adminSlotCreatePayload,
  adminSlotPatchPayload,
  adminReorderPayload,
} from '../domain/schemas.js';
import {
  listActiveAthletes,
  getActiveRutina,
  createSlot,
  updateSlot,
  deleteSlot,
  reorderSlots,
  AdminRutinaError,
} from '../services/admin-rutina.service.js';

const router = Router();
router.use(requireAuth, requireAdmin);

function mapError(err: unknown, res: Response): Response | void {
  if (err instanceof AdminRutinaError) {
    if (err.code === 'rutina_not_active') {
      return res.status(409).json({ error: 'rutina_not_active' });
    }
    if (err.code === 'invalid_exercise') {
      return res.status(400).json({ error: 'invalid_exercise' });
    }
    if (err.code === 'not_found') {
      return res.status(404).json({ error: 'not_found' });
    }
  }
  throw err;
}

router.get('/atleta', async (req: Request, res: Response) => {
  const parsed = adminListAthletesQuery.safeParse(req.query);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'invalid_query', issues: parsed.error.issues });
  }
  const r = await listActiveAthletes(parsed.data);
  res.json(r);
});

router.get('/atleta/:athleteId', async (req: Request, res: Response) => {
  const r = await getActiveRutina(req.params.athleteId);
  if (!r) return res.status(404).json({ error: 'not_found' });
  res.json(r);
});

router.post('/atleta/:athleteId/slots', async (req: Request, res: Response) => {
  const parsed = adminSlotCreatePayload.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'invalid_payload', issues: parsed.error.issues });
  }
  try {
    const slot = await createSlot(req.params.athleteId, parsed.data);
    res.status(201).json({ slot });
  } catch (e) {
    mapError(e, res);
  }
});

router.post('/atleta/:athleteId/reorder', async (req: Request, res: Response) => {
  const parsed = adminReorderPayload.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'invalid_payload', issues: parsed.error.issues });
  }
  try {
    await reorderSlots(req.params.athleteId, parsed.data);
    res.status(204).end();
  } catch (e) {
    mapError(e, res);
  }
});

router.patch('/slots/:slotId', async (req: Request, res: Response) => {
  const parsed = adminSlotPatchPayload.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'invalid_payload', issues: parsed.error.issues });
  }
  try {
    const slot = await updateSlot(req.params.slotId, parsed.data);
    res.json({ slot });
  } catch (e) {
    mapError(e, res);
  }
});

router.delete('/slots/:slotId', async (req: Request, res: Response) => {
  try {
    await deleteSlot(req.params.slotId);
    res.status(204).end();
  } catch (e) {
    mapError(e, res);
  }
});

export default router;
