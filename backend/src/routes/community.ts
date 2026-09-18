import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import {
  communityPostLimiter,
  communityCommentLimiter,
  communityReportLimiter,
  communityAdEventLimiter,
} from '../middleware/rate-limit.js';
import {
  CommunityError,
  isAdminRole,
  isCommunityEnabled,
  getFeed,
  newCount,
  getPost,
  createPost,
  deletePost,
  setLike,
  listComments,
  createComment,
  deleteComment,
  setRsvp,
  listBlocks,
  setBlock,
  acceptTerms,
  markSeen,
  type Viewer,
} from '../services/community.service.js';
import {
  CommunityMediaError,
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
  type MediaInput,
} from '../services/community-media.service.js';
import { createReport } from '../services/community-moderation.service.js';
import { AdError, recordAdEvent } from '../services/community-ads.service.js';
import logger from '../utils/logger.js';

const router = Router();

export async function requireCommunityEnabled(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (req.user && isAdminRole(req.user.role)) return next();
    if (!(await isCommunityEnabled())) {
      res.status(404).json({ error: 'community_disabled' });
      return;
    }
    next();
  } catch (e) {
    next(e);
  }
}

/** Maps domain errors to HTTP. Returns false for unknown errors (caller rethrows / 500s). */
export function sendCommunityError(res: Response, e: unknown): boolean {
  if (e instanceof CommunityError) {
    res.status(e.status).json({ error: e.code });
    return true;
  }
  if (e instanceof CommunityMediaError) {
    res.status(400).json({ error: e.code });
    return true;
  }
  if (e instanceof AdError) {
    res.status(e.status).json({ error: e.code });
    return true;
  }
  return false;
}

/** Wrap an async handler: domain errors → 4xx, anything else → next(e). */
export function handle(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch((e) => {
      if (!sendCommunityError(res, e)) next(e);
    });
  };
}

export const communityUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_IMAGES * 2 },
}).fields([
  { name: 'images', maxCount: MAX_IMAGES },
  { name: 'thumbs', maxCount: MAX_IMAGES },
]);

/** Run multer inline so its errors become a clean 400 (same approach as the avatar route). */
export function runUpload(req: Request, res: Response): Promise<boolean> {
  return new Promise((resolve) => {
    communityUpload(req, res, (err: unknown) => {
      if (err) {
        const code =
          err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
            ? 'image_too_large'
            : err instanceof multer.MulterError &&
                (err.code === 'LIMIT_FILE_COUNT' ||
                  err.code === 'LIMIT_UNEXPECTED_FILE')
              ? 'too_many_images'
              : 'upload_failed';
        res.status(400).json({ error: code });
        return resolve(false);
      }
      resolve(true);
    });
  });
}

const asArray = (v: unknown): string[] =>
  v === undefined ? [] : Array.isArray(v) ? v.map(String) : [String(v)];

/** Pairs images[i] with thumbs[i] and widths[i]/heights[i]. Throws CommunityMediaError('thumbs_mismatch'). */
export function parseMediaFromRequest(req: Request): MediaInput[] {
  const files = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
  const images = files.images ?? [];
  const thumbs = files.thumbs ?? [];
  const widths = asArray(req.body.widths ?? req.body['widths[]']).map(Number);
  const heights = asArray(req.body.heights ?? req.body['heights[]']).map(
    Number
  );
  if (
    thumbs.length !== images.length ||
    widths.length !== images.length ||
    heights.length !== images.length
  ) {
    throw new CommunityMediaError('thumbs_mismatch');
  }
  return images.map((img, i) => ({
    image: { buffer: img.buffer, mimetype: img.mimetype, size: img.size },
    thumb: {
      buffer: thumbs[i].buffer,
      mimetype: thumbs[i].mimetype,
      size: thumbs[i].size,
    },
    width: widths[i],
    height: heights[i],
  }));
}

const viewerOf = (req: Request): Viewer => ({
  id: req.user!.id,
  role: req.user!.role,
});
const uuid = z.string().uuid();
const categoryEnum = z.enum(['general', 'meals', 'training']);

router.use(requireAuth, requireCommunityEnabled);

router.get(
  '/feed',
  handle(async (req, res) => {
    const q = z
      .object({
        cursor: z.string().max(200).optional(),
        category: categoryEnum.optional(),
      })
      .safeParse(req.query);
    if (!q.success) return res.status(400).json({ error: 'invalid_payload' });
    res.json(await getFeed(viewerOf(req), q.data));
  })
);

router.get(
  '/feed/new-count',
  handle(async (req, res) => {
    const since =
      typeof req.query.since === 'string' ? req.query.since : undefined;
    res.json({ count: await newCount(viewerOf(req), since) });
  })
);

const postFields = z.object({
  body: z.string().max(2000).default(''),
  category: categoryEnum.default('general'),
});

router.post('/posts', communityPostLimiter, async (req, res) => {
  if (!(await runUpload(req, res))) return;
  try {
    const parsed = postFields.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: 'invalid_payload' });
    const media = parseMediaFromRequest(req);
    const post = await createPost(viewerOf(req), {
      kind: 'post',
      ...parsed.data,
      media,
    });
    res.status(201).json(post);
  } catch (e) {
    if (sendCommunityError(res, e)) return;
    logger.error({ err: e }, 'community post create failed');
    res.status(500).json({ error: 'upload_failed' });
  }
});

router.get(
  '/posts/:id',
  handle(async (req, res) => {
    if (!uuid.safeParse(req.params.id).success)
      return res.status(404).json({ error: 'post_not_found' });
    res.json(await getPost(viewerOf(req), req.params.id));
  })
);

router.delete(
  '/posts/:id',
  handle(async (req, res) => {
    if (!uuid.safeParse(req.params.id).success)
      return res.status(404).json({ error: 'post_not_found' });
    await deletePost(viewerOf(req), req.params.id);
    res.status(204).end();
  })
);

for (const [method, liked] of [
  ['post', true],
  ['delete', false],
] as const) {
  router[method](
    '/posts/:id/like',
    handle(async (req, res) => {
      if (!uuid.safeParse(req.params.id).success)
        return res.status(404).json({ error: 'post_not_found' });
      await setLike(viewerOf(req), req.params.id, liked);
      res.status(204).end();
    })
  );
  router[method](
    '/posts/:id/rsvp',
    handle(async (req, res) => {
      if (!uuid.safeParse(req.params.id).success)
        return res.status(404).json({ error: 'post_not_found' });
      await setRsvp(viewerOf(req), req.params.id, liked);
      res.status(204).end();
    })
  );
}

router.get(
  '/posts/:id/comments',
  handle(async (req, res) => {
    if (!uuid.safeParse(req.params.id).success)
      return res.status(404).json({ error: 'post_not_found' });
    const cursor =
      typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    res.json(await listComments(viewerOf(req), req.params.id, cursor));
  })
);

router.post(
  '/posts/:id/comments',
  communityCommentLimiter,
  handle(async (req, res) => {
    if (!uuid.safeParse(req.params.id).success)
      return res.status(404).json({ error: 'post_not_found' });
    const parsed = z
      .object({ body: z.string().trim().min(1).max(500) })
      .safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: 'invalid_payload' });
    res
      .status(201)
      .json(
        await createComment(viewerOf(req), req.params.id, parsed.data.body)
      );
  })
);

router.delete(
  '/comments/:id',
  handle(async (req, res) => {
    if (!uuid.safeParse(req.params.id).success)
      return res.status(404).json({ error: 'comment_not_found' });
    await deleteComment(viewerOf(req), req.params.id);
    res.status(204).end();
  })
);

router.post(
  '/reports',
  communityReportLimiter,
  handle(async (req, res) => {
    const parsed = z
      .object({
        target_type: z.enum(['post', 'comment']),
        target_id: z.string().uuid(),
        reason: z.enum(['offensive', 'spam', 'inappropriate', 'other']),
        note: z.string().max(500).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: 'invalid_payload' });
    const { created, id } = await createReport(req.user!.id, parsed.data);
    res.status(created ? 201 : 200).json({ id });
  })
);

router.get(
  '/blocks',
  handle(async (req, res) => {
    res.json(await listBlocks(req.user!.id));
  })
);

for (const [method, blocked] of [
  ['post', true],
  ['delete', false],
] as const) {
  router[method](
    '/blocks/:userId',
    handle(async (req, res) => {
      if (!uuid.safeParse(req.params.userId).success)
        return res.status(404).json({ error: 'user_not_found' });
      await setBlock(req.user!.id, req.params.userId, blocked);
      res.status(204).end();
    })
  );
}

router.post(
  '/terms/accept',
  handle(async (req, res) => {
    await acceptTerms(req.user!.id);
    res.status(204).end();
  })
);

router.post(
  '/seen',
  handle(async (req, res) => {
    await markSeen(req.user!.id);
    res.status(204).end();
  })
);

router.post(
  '/ads/:id/events',
  communityAdEventLimiter,
  handle(async (req, res) => {
    const parsed = z
      .object({ kind: z.enum(['view', 'click']) })
      .safeParse(req.body);
    if (!uuid.safeParse(req.params.id).success)
      return res.status(404).json({ error: 'ad_not_found' });
    if (!parsed.success)
      return res.status(400).json({ error: 'invalid_payload' });
    await recordAdEvent(req.params.id, req.user!.id, parsed.data.kind);
    res.status(204).end();
  })
);

export default router;
