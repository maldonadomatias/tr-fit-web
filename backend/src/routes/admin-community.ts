import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/role.js';
import {
  handle,
  runUpload,
  parseMediaFromRequest,
  sendCommunityError,
} from './community.js';
import { createPost, type Viewer } from '../services/community.service.js';
import {
  listAdminPosts,
  setPinned,
  setPostHidden,
  hideComment,
  listRsvps,
  listReports,
  resolveReport,
  muteUser,
  openReportCount,
  notifyAllAthletes,
} from '../services/community-moderation.service.js';
import { MAX_IMAGE_BYTES } from '../services/community-media.service.js';
import {
  createAd,
  listAds,
  archiveAd,
  adMetrics,
} from '../services/community-ads.service.js';
import { communitySummary } from '../services/community-summary.service.js';
import logger from '../utils/logger.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const uuid = z.string().uuid();
const viewerOf = (req: {
  user?: { id: string; role: Viewer['role'] };
}): Viewer => ({
  id: req.user!.id,
  role: req.user!.role,
});

const adminPostFields = z
  .object({
    kind: z.enum(['announcement', 'event']),
    body: z.string().max(2000).default(''),
    category: z.enum(['general', 'meals', 'training']).default('general'),
    event_location: z.string().max(200).optional(),
    event_starts_at: z.string().datetime().optional(),
    pin: z
      .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
      .optional()
      .transform((v) => v === true || v === 'true' || v === '1'),
  })
  .refine((d) => d.kind !== 'event' || !!d.event_starts_at, {
    message: 'event_starts_at required',
  });

router.post('/posts', async (req, res) => {
  if (!(await runUpload(req, res))) return;
  try {
    const parsed = adminPostFields.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: 'invalid_payload' });
    const media = parseMediaFromRequest(req);
    const post = await createPost(viewerOf(req), { ...parsed.data, media });
    const preview = post.body.slice(0, 120);
    void notifyAllAthletes(
      post.kind === 'event' ? 'community_event' : 'community_announcement',
      {
        postId: post.id,
        preview,
      }
    ).catch((e) => logger.error({ err: e }, 'community broadcast failed'));
    res.status(201).json(post);
  } catch (e) {
    if (sendCommunityError(res, e)) return;
    logger.error({ err: e }, 'admin community post create failed');
    res.status(500).json({ error: 'upload_failed' });
  }
});

router.get(
  '/posts',
  handle(async (req, res) => {
    const cursor =
      typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    res.json(
      await listAdminPosts(viewerOf(req), {
        cursor,
        includeHidden: req.query.include_hidden === '1',
      })
    );
  })
);

router.patch(
  '/posts/:id/pin',
  handle(async (req, res) => {
    const parsed = z.object({ pinned: z.boolean() }).safeParse(req.body);
    if (!uuid.safeParse(req.params.id).success || !parsed.success)
      return res.status(400).json({ error: 'invalid_payload' });
    await setPinned(req.params.id, parsed.data.pinned);
    res.status(204).end();
  })
);

for (const [path, hidden] of [
  ['hide', true],
  ['unhide', false],
] as const) {
  router.post(
    `/posts/:id/${path}`,
    handle(async (req, res) => {
      if (!uuid.safeParse(req.params.id).success)
        return res.status(404).json({ error: 'post_not_found' });
      await setPostHidden(req.params.id, hidden, req.user!.id);
      res.status(204).end();
    })
  );
}

router.post(
  '/comments/:id/hide',
  handle(async (req, res) => {
    if (!uuid.safeParse(req.params.id).success)
      return res.status(404).json({ error: 'comment_not_found' });
    await hideComment(req.params.id);
    res.status(204).end();
  })
);

router.get(
  '/posts/:id/rsvps',
  handle(async (req, res) => {
    if (!uuid.safeParse(req.params.id).success)
      return res.status(404).json({ error: 'post_not_found' });
    res.json(await listRsvps(req.params.id));
  })
);

router.get(
  '/reports',
  handle(async (req, res) => {
    const status = z
      .enum(['open', 'actioned', 'dismissed'])
      .catch('open')
      .parse(req.query.status);
    res.json(await listReports(status));
  })
);

router.get(
  '/reports/count',
  handle(async (_req, res) => {
    res.json({ open: await openReportCount() });
  })
);

router.post(
  '/reports/:id/resolve',
  handle(async (req, res) => {
    const parsed = z
      .object({
        action: z.enum(['hide', 'dismiss', 'mute']),
        mute_days: z.number().int().min(1).max(365).optional(),
      })
      .refine((d) => d.action !== 'mute' || d.mute_days !== undefined)
      .safeParse(req.body);
    if (!uuid.safeParse(req.params.id).success || !parsed.success)
      return res.status(400).json({ error: 'invalid_payload' });
    await resolveReport(req.params.id, req.user!.id, parsed.data);
    res.status(204).end();
  })
);

router.post(
  '/users/:id/mute',
  handle(async (req, res) => {
    const parsed = z
      .object({ days: z.number().int().min(1).max(365).nullable() })
      .safeParse(req.body);
    if (!uuid.safeParse(req.params.id).success || !parsed.success)
      return res.status(400).json({ error: 'invalid_payload' });
    await muteUser(req.params.id, parsed.data.days);
    res.status(204).end();
  })
);

const adUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
}).single('image');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const adFields = z.object({
  brand_name: z.string().trim().min(1).max(120),
  body: z.string().max(280).default(''),
  cta_label: z.string().trim().min(1).max(40),
  cta_url: z
    .string()
    .url()
    .refine((u) => /^https?:\/\//.test(u)),
  monthly_fee_ars: z.coerce.number().nonnegative(),
  starts_on: isoDate,
  ends_on: isoDate,
});

router.get(
  '/ads',
  handle(async (_req, res) => {
    res.json(await listAds());
  })
);

router.post('/ads', (req, res, next) => {
  adUpload(req, res, (err: unknown) => {
    if (err) return res.status(400).json({ error: 'upload_failed' });
    const parsed = adFields.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: 'invalid_payload' });
    if (!req.file) return res.status(400).json({ error: 'no_file' });
    const file = req.file;
    createAd(
      {
        ...parsed.data,
        image: {
          buffer: file.buffer,
          mimetype: file.mimetype,
          size: file.size,
        },
      },
      req.user!.id
    )
      .then((ad) => res.status(201).json(ad))
      .catch((e) => {
        if (!sendCommunityError(res, e)) next(e);
      });
  });
});

router.post(
  '/ads/:id/archive',
  handle(async (req, res) => {
    if (!uuid.safeParse(req.params.id).success)
      return res.status(404).json({ error: 'ad_not_found' });
    await archiveAd(req.params.id);
    res.status(204).end();
  })
);

router.get(
  '/ads/:id/metrics',
  handle(async (req, res) => {
    if (!uuid.safeParse(req.params.id).success)
      return res.status(404).json({ error: 'ad_not_found' });
    const q = z
      .object({ from: isoDate.optional(), to: isoDate.optional() })
      .safeParse(req.query);
    if (!q.success) return res.status(400).json({ error: 'invalid_payload' });
    res.json(await adMetrics(req.params.id, q.data.from, q.data.to));
  })
);

router.get(
  '/summary',
  handle(async (_req, res) => {
    res.json(await communitySummary());
  })
);

export default router;
