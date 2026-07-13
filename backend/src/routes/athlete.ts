import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import {
  uploadAthleteAvatar,
  ALLOWED_AVATAR_MIME,
} from '../services/avatar.service.js';
import {
  rmPayload,
  amrapPayload,
  profileUpdatePayload,
  ageFromBirthDate,
} from '../domain/schemas.js';
import pool from '../db/connect.js';
import {
  buildTodaySession,
  computeNextPendingDay,
  TodayBlockedError,
} from '../services/engine.service.js';
import {
  findActiveByAthlete,
  listSlots,
} from '../services/skeleton.service.js';
import { recordRm, recordAmrap } from '../services/rm.service.js';
import { getUserTier } from '../services/tier.service.js';
import {
  enqueueRegenJob,
  PendingReviewExistsError,
} from '../services/skeleton-regen.service.js';
import { buildDashboard } from '../services/dashboard.service.js';
import { buildPlan } from '../services/plan.service.js';
import { buildAthleteStats } from '../services/athlete-stats.service.js';
import {
  excludeExercise,
  reactivateExercise,
  listExclusions,
} from '../services/exclusions.service.js';
import { resetProgramForGymChange } from '../services/program-reset.service.js';

const router = Router();
router.use(requireAuth, requireRole('athlete'));

// Profile picture upload — single in-memory image, 5 MB cap.
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
}).single('avatar');

/**
 * @deprecated The mobile app no longer calls this endpoint — all features are
 * unlocked client-side and server-side tier gating was removed. No known caller
 * remains (the admin frontend reads subscription_tier from the admin API, not
 * this route). Kept temporarily for backward compatibility; safe to remove once
 * access logs confirm zero traffic. See docs for the payment-reconciliation plan.
 */
router.get('/me/tier', async (req, res) => {
  const tier = await getUserTier(req.user!.id);
  res.json({ plan_interest: tier });
});

router.get('/me/stats', async (req, res) => {
  const stats = await buildAthleteStats(req.user!.id);
  res.json(stats);
});

router.post('/skeleton/regenerate', async (req, res) => {
  // Enqueue a background job; generation runs in the worker, not the request.
  try {
    const { jobId } = await enqueueRegenJob(req.user!.id);
    res.status(202).json({ jobId, status: 'queued' });
  } catch (e) {
    if (e instanceof PendingReviewExistsError) {
      return res.status(409).json({
        message:
          'Ya tenés una rutina en revisión. Esperá a que tu coach la apruebe.',
      });
    }
    throw e;
  }
});

router.get('/me', async (req, res) => {
  const userId = req.user!.id;
  const profileR = await pool.query(
    `SELECT * FROM athlete_profiles WHERE user_id = $1`,
    [userId]
  );
  const stateR = await pool.query(
    `SELECT * FROM athlete_program_state WHERE athlete_id = $1`,
    [userId]
  );
  const profile = profileR.rows[0] ?? null;
  // node-postgres parses DATE columns into a JS Date at server-local midnight;
  // res.json would serialize that as a full ISO timestamp (timezone-shifted).
  // The app expects a plain YYYY-MM-DD, so rebuild it from local date parts.
  if (profile && profile.birth_date instanceof Date) {
    const bd: Date = profile.birth_date;
    profile.birth_date = [
      bd.getFullYear(),
      String(bd.getMonth() + 1).padStart(2, '0'),
      String(bd.getDate()).padStart(2, '0'),
    ].join('-');
  }
  const state = stateR.rows[0] ?? null;
  const skeleton = await findActiveByAthlete(userId);

  const stateR2 = await pool.query<{
    active: boolean;
    pending: boolean;
    failed: boolean;
  }>(
    `SELECT
       EXISTS(SELECT 1 FROM skeleton_regen_jobs
               WHERE athlete_id = $1 AND status IN ('queued','running')) AS active,
       EXISTS(SELECT 1 FROM athlete_skeletons
               WHERE athlete_id = $1 AND status = 'pending_review') AS pending,
       (SELECT status FROM skeleton_regen_jobs
          WHERE athlete_id = $1
          ORDER BY created_at DESC LIMIT 1) = 'failed' AS failed`,
    [userId]
  );
  const rs = stateR2.rows[0];
  const regenState = rs.active
    ? 'generating'
    : rs.pending
      ? 'pending_review'
      : rs.failed
        ? 'failed'
        : 'idle';

  let blockedReason: string | null = null;
  if (!skeleton.skeleton || skeleton.status !== 'approved')
    blockedReason = 'awaiting_review';
  if (state?.rm_test_blocking) blockedReason = 'rm_test_required';

  res.json({
    profile,
    programState: state,
    skeletonStatus: skeleton.status,
    regenState,
    blockedReason,
  });
});

router.patch('/me', async (req, res) => {
  const parsed = profileUpdatePayload.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: 'invalid_payload' });
  const userId = req.user!.id;

  // birth_date is the source of truth for age: whenever it's set, derive and
  // write `age` too so legacy consumers of the column stay coherent (the
  // schema already guarantees the derived age is in range).
  if (parsed.data.birth_date != null) {
    parsed.data.age = ageFromBirthDate(parsed.data.birth_date)!;
  }

  // Column names come from the schema's whitelist, never from raw input.
  const cols = Object.keys(parsed.data) as Array<keyof typeof parsed.data>;
  const sets: string[] = [];
  const values: unknown[] = [];
  let daysParam = 0;
  for (const col of cols) {
    values.push(parsed.data[col]);
    sets.push(`${col} = $${values.length}`);
    if (col === 'days_per_week') daysParam = values.length;
  }
  // Legacy clients may still change only the frequency. Null concrete weekdays
  // in that case so the DB cardinality check stays valid. New clients submit
  // days_per_week + days_specific atomically and preserve the exact schedule. The
  // RHS `days_per_week` here is the pre-update value (Postgres evaluates every SET
  // expression against the old row), so an unchanged value preserves days_specific.
  if (daysParam > 0 && parsed.data.days_specific == null) {
    sets.push(
      `days_specific = CASE WHEN $${daysParam} = days_per_week THEN days_specific ELSE NULL END`
    );
  }

  values.push(userId);
  const r = await pool.query(
    `UPDATE athlete_profiles SET ${sets.join(', ')} WHERE user_id = $${values.length}`,
    values
  );
  if (r.rowCount === 0)
    return res.status(404).json({ error: 'profile_not_found' });
  res.json({ ok: true });
});

router.post('/me/avatar', (req, res) => {
  // multer runs inline so its errors (e.g. file too large) become a clean 400
  // instead of relying on async-throw propagation (this app has no async wrapper).
  avatarUpload(req, res, async (err: unknown) => {
    if (err) return res.status(400).json({ error: 'upload_failed' });
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'no_file' });
    if (!ALLOWED_AVATAR_MIME.has(file.mimetype)) {
      return res.status(400).json({ error: 'invalid_type' });
    }
    try {
      const url = await uploadAthleteAvatar(
        req.user!.id,
        file.buffer,
        file.mimetype
      );
      res.json({ avatar_url: url });
    } catch (e) {
      if (e instanceof Error && e.message === 'profile_not_found') {
        return res.status(404).json({ error: 'profile_not_found' });
      }
      res.status(500).json({ error: 'avatar_upload_failed' });
    }
  });
});

router.get('/today', async (req, res) => {
  const userId = req.user!.id;
  const dayOfWeek = await computeNextPendingDay(userId);
  try {
    const items = await buildTodaySession(userId, dayOfWeek);
    res.json({ dayOfWeek, items });
  } catch (e) {
    if (e instanceof TodayBlockedError) {
      res.status(403).json({ error: 'blocked', reason: e.reason });
      return;
    }
    throw e;
  }
});

router.get('/skeleton/active', async (req, res) => {
  const userId = req.user!.id;
  const r = await findActiveByAthlete(userId);
  if (!r.skeleton)
    return res.json({ skeleton: null, slots: [], status: r.status });
  const slots = await listSlots(r.skeleton.id);
  res.json({
    skeleton: r.skeleton,
    slots,
    status: r.skeleton.status,
    rejectionFeedback: r.skeleton.rejection_feedback,
  });
});

router.post('/rm', async (req, res) => {
  const parsed = rmPayload.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: 'invalid_payload' });
  const out = await recordRm({
    athleteId: req.user!.id,
    exerciseId: parsed.data.exercise_id,
    valueKg: parsed.data.value_kg,
    week: parsed.data.week,
  });
  res.status(201).json(out);
});

router.post('/amrap', async (req, res) => {
  const parsed = amrapPayload.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: 'invalid_payload' });
  const out = await recordAmrap({
    athleteId: req.user!.id,
    exerciseId: parsed.data.exercise_id,
    weightUsed: parsed.data.weight_used,
    reps: parsed.data.reps,
  });
  res.status(201).json(out);
});

router.get('/dashboard', async (req, res) => {
  const payload = await buildDashboard(req.user!.id);
  res.json(payload);
});

router.get('/plan', async (req, res) => {
  const payload = await buildPlan(req.user!.id);
  res.json(payload);
});

router.get('/exclusions', async (req, res) => {
  const rows = await listExclusions(req.user!.id);
  res.json(rows);
});

router.post('/exclusions', async (req, res) => {
  const exerciseId = Number((req.body ?? {}).exercise_id);
  if (!Number.isInteger(exerciseId) || exerciseId <= 0) {
    return res.status(400).json({ error: 'exercise_id required' });
  }
  const sessionLogId =
    typeof (req.body ?? {}).session_log_id === 'string'
      ? (req.body as { session_log_id?: string }).session_log_id
      : undefined;
  const rawExclude = (req.body ?? {}).exclude_ids;
  const routineExcludeIds = Array.isArray(rawExclude)
    ? rawExclude
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n > 0)
    : [];
  const { replacement } = await excludeExercise(
    req.user!.id,
    exerciseId,
    sessionLogId,
    routineExcludeIds
  );
  res.json({
    replacement: replacement
      ? {
          id: replacement.id,
          name: replacement.name,
          muscle_group: replacement.muscle_group,
          equipment: replacement.equipment,
        }
      : null,
  });
});

router.delete('/exclusions/:exerciseId', async (req, res) => {
  const exerciseId = Number(req.params.exerciseId);
  if (!Number.isInteger(exerciseId) || exerciseId <= 0) {
    return res.status(400).json({ error: 'invalid exerciseId' });
  }
  await reactivateExercise(req.user!.id, exerciseId);
  res.json({ ok: true });
});

router.post('/program/reset', async (req, res) => {
  await resetProgramForGymChange(req.user!.id);
  res.json({ ok: true });
});

export default router;
