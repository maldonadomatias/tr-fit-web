import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/role.js';
import {
  listExercises,
  getExercise,
  createExercise,
  updateExercise,
  archiveExercise,
  restoreExercise,
  ExerciseError,
} from '../services/admin-exercise.service.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const EquipmentEnum = z.enum([
  'barra', 'mancuerna', 'maquina', 'polea', 'smith',
  'bw', 'pesa_rusa', 'elastico', 'disco',
]);
const PatternEnum = z.enum([
  'squat', 'hinge', 'push_h', 'push_v', 'pull_h', 'pull_v',
  'isolation', 'core', 'cardio',
]);
const LevelEnum = z.enum(['principiante', 'intermedio', 'avanzado']);

const listQuery = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  muscle_group: z.string().trim().min(1).max(60).optional(),
  equipment: EquipmentEnum.optional(),
  movement_pattern: PatternEnum.optional(),
  archived: z.enum(['true', 'false', 'all']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const ModalityEnum = z.enum(['reps', 'tiempo', 'distancia']);

const createBody = z.object({
  name: z.string().trim().min(1).max(120),
  muscle_group: z.string().trim().min(1).max(60),
  equipment: EquipmentEnum,
  movement_pattern: PatternEnum,
  is_principal: z.boolean(),
  is_unilateral: z.boolean(),
  level_min: LevelEnum,
  contraindicated_for: z.array(z.string().trim().min(1)),
  default_increment_kg: z.number().min(0).max(99.99),
  alternatives_ids: z.array(z.number().int().positive()),
  video_url: z.string().url().nullable(),
  illustration_url: z.string().url().nullable(),
  modality: ModalityEnum.default('reps'),
  default_target: z.string().trim().max(60).nullable().default(null),
  rep_cycle_threshold: z.number().int().min(1).max(50).default(12),
});

const updateBody = createBody.partial();

function mapError(err: unknown, res: Response): Response | void {
  if (err instanceof ExerciseError) {
    if (err.code === 'not_found') return res.status(404).json({ error: 'not_found' });
    if (err.code === 'name_taken') return res.status(409).json({ error: 'name_taken' });
  }
  throw err;
}

router.get('/', async (req: Request, res: Response) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_query', issues: parsed.error.issues });
  }
  const result = await listExercises(parsed.data);
  res.json(result);
});

router.get('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  try {
    const exercise = await getExercise(id);
    res.json({ exercise });
  } catch (err) {
    mapError(err, res);
  }
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = createBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_payload', issues: parsed.error.issues });
  }
  try {
    const exercise = await createExercise(parsed.data);
    res.status(201).json({ exercise });
  } catch (err) {
    mapError(err, res);
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  const parsed = updateBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_payload', issues: parsed.error.issues });
  }
  try {
    const exercise = await updateExercise(id, parsed.data);
    res.json({ exercise });
  } catch (err) {
    mapError(err, res);
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  try {
    await archiveExercise(id);
    res.json({ archived: true });
  } catch (err) {
    mapError(err, res);
  }
});

router.post('/:id/restore', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  try {
    const exercise = await restoreExercise(id);
    res.json({ exercise });
  } catch (err) {
    mapError(err, res);
  }
});

export default router;
