# Comunidad — Part A: backend core (posts, comments, moderation) Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.
> **auto-build host:** Claude plans+reviews; Grok implements via headless CLI.
> <!-- auto-build plan · 2026-09-18T00:00Z · source: claude+writing-plans · part A of 3 -->

**Goal:** Ship the backend of the Comunidad wall: migrations 063/064, posts with photos, likes, comments, RSVP, blocks, terms, seen, reports, admin moderation and push — everything in the spec except ads/platform-fee (Part B) and the admin panel (Part C).

**Architecture:** Extension of the existing Express backend. New services `community.service.ts` (wall), `community-media.service.ts` (Firebase Storage uploads with rollback), `community-moderation.service.ts` (reports/hide/mute). Two routers: `routes/community.ts` mounted at `/api/community`, `routes/admin-community.ts` at `/api/admin/community`. Raw SQL via `pool` (pg), zod validation, multer memory storage — same patterns as `routes/athlete.ts` avatar upload.

**Tech Stack:** Node 20, Express 4, TypeScript (ESM, `.js` import suffixes), pg, zod, multer, express-rate-limit, firebase-admin, Jest + supertest (ESM, `jest.unstable_mockModule`).

**Spec:** `docs/superpowers/specs/2026-09-18-comunidad-design.md` (read it — this plan implements sections "Modelo de datos", "API → /community", "API → /admin/community" except ads/summary, "Reglas transversales", "Servicios", "Manejo de errores").

## Global Constraints

- Do not open PRs, push, or commit. Skip every "commit" step.
- Minimal diffs; no drive-by refactors of unrelated code.
- ESM: every relative import ends in `.js` (e.g. `import pool from '../db/connect.js'`).
- Error responses: `res.status(code).json({ error: '<short_english_code>' })`.
- All `/community` endpoints require `requireAuth`; roles `athlete`, `admin`, `superadmin` allowed.
- If `platform_fee_config.community_launched_on IS NULL`, every `/community` endpoint returns `404 { error: 'community_disabled' }` for role `athlete`; admins/superadmins pass.
- Upload limits: JPEG/PNG/WebP only; ≤2 MB per image; ≤200 KB per thumb; ≤4 images; thumbs count == images count.
- Storage paths: `community/{postId}/{position}.jpg` and `community/{postId}/{position}_thumb.jpg`.
- Per-user rate limits: 10 posts/hour, 60 comments/hour, 20 reports/day (ads events 300/h is Part B).
- Hidden and deleted posts/comments are NEVER returned by `/community`.
- Blocks filter in both directions (I blocked them OR they blocked me) in feed, detail, comments and new-count.
- Admins/superadmins are exempt from the `terms_required` and `muted` checks (they are the moderators).
- Post `kind` `announcement`/`event` only via admin endpoints; `/community/posts` always creates `kind='post'`.

## Test environment (IMPORTANT)

Integration tests need Postgres. A throwaway test DB is already running:

```bash
cd backend
export TEST_DATABASE_URL="$TEST_DATABASE_URL"
npm test -- tests/integration/community-posts.test.ts
```

After creating new migration files, apply them to the test DB once:

```bash
cd backend && DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate
```

**NEVER run `npm run db:migrate` or any script without an explicit `DATABASE_URL=...localhost:5434...` prefix** — `backend/.env` points at PRODUCTION.

Type-check: `cd backend && npx tsc --noEmit`.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `backend/src/db/migrations/063_community.sql` | Create | Community tables + user columns + notification types |
| `backend/src/db/migrations/064_community_ads.sql` | Create | Ads tables + platform fee columns (verbatim from spec; Part B uses them, Part A needs `community_launched_on`) |
| `backend/tests/integration/helpers/test-db.ts` | Modify | Trigger migrate when `community_ads` missing; reset community config columns |
| `backend/src/domain/types.ts` | Modify | Add 4 community `NotificationType`s |
| `backend/src/services/notification-templates.ts` | Modify | 4 templates |
| `backend/src/services/notification.service.ts` | Modify | Dedup windows (0h) for new types |
| `backend/src/domain/schemas.ts` | Modify | `notificationPrefsPayload` accepts community keys |
| `backend/src/services/storage.service.ts` | Modify | `deleteFromStorage(path)` |
| `backend/src/services/community-media.service.ts` | Create | Validate + upload with rollback + delete |
| `backend/src/services/community.service.ts` | Create | Wall, posts, likes, comments, RSVP, blocks, terms, seen, flags |
| `backend/src/services/community-moderation.service.ts` | Create | Reports, hide/unhide, mute, pin, admin wall, rsvps |
| `backend/src/middleware/rate-limit.ts` | Modify | Community per-user limiters |
| `backend/src/routes/community.ts` | Create | `/community` HTTP |
| `backend/src/routes/admin-community.ts` | Create | `/admin/community` HTTP |
| `backend/src/routes/index.ts` | Modify | Mount routers |
| `backend/src/routes/athlete.ts` | Modify | `/me` adds `community_enabled`, `community_terms_accepted`, `community_unseen` |
| `backend/src/services/auth.service.ts`, `backend/src/services/admin.service.ts` | Modify | Delete community Storage objects before deleting a user |
| `backend/tests/unit/community-media.service.test.ts` | Create | Upload/rollback unit tests |
| `backend/tests/integration/community-helpers.ts` | Create | Shared test helpers (firebase mock must be set up in each test file) |
| `backend/tests/integration/community-posts.test.ts` | Create | Posts/likes/comments/rsvp/terms/muted/role tests |
| `backend/tests/integration/community-feed.test.ts` | Create | Feed cursor, pinned, blocks, new-count |
| `backend/tests/integration/community-moderation.test.ts` | Create | Reports, hide, mute, pin limit, admin posts |

---

### Task 1: Migrations 063 + 064 and test-db wiring

**Files:**
- Create: `backend/src/db/migrations/063_community.sql`
- Create: `backend/src/db/migrations/064_community_ads.sql`
- Modify: `backend/tests/integration/helpers/test-db.ts`
- Test: `backend/tests/integration/migration-063.test.ts`

**Interfaces:**
- Produces: tables `community_posts`, `community_post_media`, `community_likes`, `community_comments`, `community_event_rsvps`, `community_reports`, `community_blocks`, `community_ads`, `community_ad_events`; columns `users.community_terms_accepted_at`, `users.community_muted_until`, `users.community_seen_at`; `platform_fee_config.community_*`, `ad_share_pct`; `platform_fee_history.community_fee_ars`, `ad_revenue_ars`, `ad_share_ars`. Notification types `community_announcement`, `community_event`, `community_comment`, `community_report` allowed in `notification_log`.

- [ ] **Step 1: Write the failing test** — `backend/tests/integration/migration-063.test.ts`

```ts
import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import pool from '../../src/db/connect.js';

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

describe('migration 063/064 community', () => {
  it('creates community tables', async () => {
    const r = await pool.query<{ t: string | null }>(
      `SELECT to_regclass(x) AS t FROM unnest(ARRAY[
        'public.community_posts','public.community_post_media','public.community_likes',
        'public.community_comments','public.community_event_rsvps','public.community_reports',
        'public.community_blocks','public.community_ads','public.community_ad_events'
      ]) AS x`,
    );
    expect(r.rows.every((row) => row.t !== null)).toBe(true);
  });

  it('rejects an event without starts_at', async () => {
    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role) VALUES ('m@t.local','x','admin') RETURNING id`,
    );
    await expect(
      pool.query(
        `INSERT INTO community_posts (author_id, kind, body) VALUES ($1, 'event', 'x')`,
        [u.rows[0].id],
      ),
    ).rejects.toThrow();
  });

  it('defaults new users to community push prefs on', async () => {
    const u = await pool.query<{ notification_prefs: Record<string, boolean> }>(
      `INSERT INTO users (email, password_hash, role) VALUES ('n@t.local','x','athlete')
       RETURNING notification_prefs`,
    );
    expect(u.rows[0].notification_prefs.community_comment).toBe(true);
    expect(u.rows[0].notification_prefs.community_announcement).toBe(true);
  });

  it('module starts disabled', async () => {
    const r = await pool.query(`SELECT community_launched_on FROM platform_fee_config WHERE id = 1`);
    expect(r.rows[0].community_launched_on).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && TEST_DATABASE_URL="$TEST_DATABASE_URL" npm test -- tests/integration/migration-063.test.ts`
Expected: FAIL (tables missing).

- [ ] **Step 3: Create `backend/src/db/migrations/063_community.sql`**

Copy the `063_community.sql` block from the spec **verbatim**, then append:

```sql
-- Community push types.
ALTER TABLE notification_log DROP CONSTRAINT IF EXISTS notification_log_type_check;
ALTER TABLE notification_log ADD CONSTRAINT notification_log_type_check
  CHECK (type IN (
    'session_reminder','session_missed','week_start',
    'skeleton_approved','sos_resolved','rm_test_week',
    'membership_expiring','membership_expired',
    'community_announcement','community_event','community_comment','community_report'
  ));

ALTER TABLE users ALTER COLUMN notification_prefs SET DEFAULT '{
  "session_reminder": true,
  "session_missed": true,
  "week_start": true,
  "skeleton_approved": true,
  "sos_resolved": true,
  "rm_test_week": true,
  "membership_expiring": true,
  "membership_expired": true,
  "community_announcement": true,
  "community_event": true,
  "community_comment": true,
  "community_report": true
}'::jsonb;

UPDATE users SET notification_prefs = notification_prefs
  || '{"community_announcement": true, "community_event": true,
       "community_comment": true, "community_report": true}'::jsonb
  WHERE NOT (notification_prefs ? 'community_comment');
```

- [ ] **Step 4: Create `backend/src/db/migrations/064_community_ads.sql`**

Copy the `064_community_ads.sql` block from the spec **verbatim**. No additions.

- [ ] **Step 5: Wire test-db**

In `backend/tests/integration/helpers/test-db.ts`, `ensureMigrated()`: add `to_regclass('public.community_ads') AS ca` to the SELECT list and `|| !r.rows[0].ca` to the condition that runs `npm run db:migrate`.

In `resetDatabase()`, extend the `platform_fee_config` upsert so community columns reset too. Replace the INSERT…ON CONFLICT statement with:

```ts
  await pool.query(`
    INSERT INTO platform_fee_config
      (id, base_fee_ars, reference_usd, current_usd, price_per_athlete_ars,
       revenue_share_pct, adjustment_interval_months, next_adjustment_date, phase,
       community_fee_ars, community_fallback_fee_ars, community_revision_threshold_ars,
       ad_share_pct, community_launched_on, community_revision_applied_at)
    VALUES (1, 105000, 1420, 1500, 25000, 4, 3, '2026-10-01', 'production',
            30000, 40000, 50000, 15, NULL, NULL)
    ON CONFLICT (id) DO UPDATE SET
      base_fee_ars = EXCLUDED.base_fee_ars,
      reference_usd = EXCLUDED.reference_usd,
      current_usd = EXCLUDED.current_usd,
      price_per_athlete_ars = EXCLUDED.price_per_athlete_ars,
      revenue_share_pct = EXCLUDED.revenue_share_pct,
      adjustment_interval_months = EXCLUDED.adjustment_interval_months,
      next_adjustment_date = EXCLUDED.next_adjustment_date,
      phase = EXCLUDED.phase,
      community_fee_ars = EXCLUDED.community_fee_ars,
      community_fallback_fee_ars = EXCLUDED.community_fallback_fee_ars,
      community_revision_threshold_ars = EXCLUDED.community_revision_threshold_ars,
      ad_share_pct = EXCLUDED.ad_share_pct,
      community_launched_on = NULL,
      community_revision_applied_at = NULL,
      updated_at = now();
  `);
```

(Community tables are cleared automatically by the existing `TRUNCATE ... users ... CASCADE`, because they all reference `users`.)

- [ ] **Step 6: Apply migrations to the test DB and run the test**

Run: `cd backend && DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate`
Run: `cd backend && TEST_DATABASE_URL="$TEST_DATABASE_URL" npm test -- tests/integration/migration-063.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit** — skip (Global Constraints).

---

### Task 2: Community notification types

**Files:**
- Modify: `backend/src/domain/types.ts` (the `NotificationType` union, ~line 256)
- Modify: `backend/src/services/notification-templates.ts`
- Modify: `backend/src/services/notification.service.ts` (`DEDUP_WINDOW_HOURS`)
- Modify: `backend/src/domain/schemas.ts` (`notificationPrefsPayload`, ~line 479)
- Test: `backend/tests/unit/notification-templates.test.ts` (extend existing file)

**Interfaces:**
- Produces: `NotificationType` includes `'community_announcement' | 'community_event' | 'community_comment' | 'community_report'`. Template vars: announcement `{ postId, preview }`, event `{ postId, preview }`, comment `{ postId, commenter }`, report `{ reportId, reason }`.

- [ ] **Step 1: Write failing test** — append to `backend/tests/unit/notification-templates.test.ts`:

```ts
describe('community templates', () => {
  it('renders community templates', () => {
    expect(TEMPLATES.community_announcement({ postId: 'p1', preview: 'Hola' }).body).toBe('Hola');
    expect(TEMPLATES.community_event({ postId: 'p1', preview: 'Asado' }).title).toBe('Nuevo evento');
    expect(TEMPLATES.community_comment({ postId: 'p1', commenter: 'Ana' }).body).toContain('Ana');
    expect(TEMPLATES.community_report({ reportId: 'r1', reason: 'spam' }).title).toBe('Nueva denuncia');
    expect(TEMPLATES.community_comment({ postId: 'p1', commenter: 'Ana' }).route).toBe('/(app)/community');
  });
});
```

(Check the top of the file: if `TEMPLATES` is not already imported, add `import { TEMPLATES } from '../../src/services/notification-templates.js';`.)

- [ ] **Step 2: Run** `cd backend && npm test -- tests/unit/notification-templates.test.ts` → FAIL (type/undefined).

- [ ] **Step 3: Implement**

`types.ts` — extend the union:

```ts
  | 'membership_expired'
  | 'community_announcement'
  | 'community_event'
  | 'community_comment'
  | 'community_report';
```

`notification-templates.ts` — add to `TEMPLATES`:

```ts
  community_announcement: ({ preview }) => ({
    title: 'Aviso de tu coach',
    body: preview || 'Hay un aviso nuevo en la comunidad',
    route: '/(app)/community',
  }),
  community_event: ({ preview }) => ({
    title: 'Nuevo evento',
    body: preview || 'Hay un evento nuevo en la comunidad',
    route: '/(app)/community',
  }),
  community_comment: ({ commenter }) => ({
    title: 'Nuevo comentario',
    body: commenter ? `${commenter} comentó tu publicación` : 'Comentaron tu publicación',
    route: '/(app)/community',
  }),
  community_report: ({ reason }) => ({
    title: 'Nueva denuncia',
    body: reason ? `Denuncia por ${reason} en la comunidad` : 'Hay una denuncia nueva en la comunidad',
    route: '/(app)/community',
  }),
```

`notification.service.ts` — add to `DEDUP_WINDOW_HOURS` (0 = never dedup; each comment/announcement is distinct):

```ts
  community_announcement: 0,
  community_event: 0,
  community_comment: 0,
  community_report: 0,
```

`schemas.ts` — add to `notificationPrefsPayload` object:

```ts
    community_announcement: z.boolean().optional(),
    community_event: z.boolean().optional(),
    community_comment: z.boolean().optional(),
```

- [ ] **Step 4: Run** `cd backend && npm test -- tests/unit/notification-templates.test.ts && npx tsc --noEmit` → PASS, no type errors.

---

### Task 3: Storage delete + community media service

**Files:**
- Modify: `backend/src/services/storage.service.ts`
- Create: `backend/src/services/community-media.service.ts`
- Test: `backend/tests/unit/community-media.service.test.ts`

**Interfaces:**
- Produces:
  - `deleteFromStorage(objectPath: string): Promise<void>` — never throws; logs `logger.warn({ storage_path }, ...)` on failure.
  - `interface UploadImage { buffer: Buffer; mimetype: string; size: number }`
  - `interface MediaInput { image: UploadImage; thumb: UploadImage; width: number; height: number }`
  - `interface StoredMedia { storage_path: string; thumb_path: string; url: string; thumb_url: string; width: number; height: number; position: number }`
  - `class CommunityMediaError extends Error { code: string }` — codes `too_many_images`, `thumbs_mismatch`, `invalid_type`, `image_too_large`, `thumb_too_large`, `invalid_dimensions`.
  - `validateMedia(items: MediaInput[]): void` (throws `CommunityMediaError`)
  - `uploadPostMedia(postId: string, items: MediaInput[]): Promise<StoredMedia[]>` — uploads sequentially; on any failure deletes everything already uploaded and rethrows.
  - `deleteMediaObjects(paths: string[]): Promise<void>`
  - `deleteUserCommunityMedia(userId: string): Promise<void>` — deletes Storage objects of every post authored by the user.
  - `ALLOWED_IMAGE_MIME`, `MAX_IMAGE_BYTES = 2 * 1024 * 1024`, `MAX_THUMB_BYTES = 200 * 1024`, `MAX_IMAGES = 4`.

- [ ] **Step 1: Write failing test** — `backend/tests/unit/community-media.service.test.ts`

```ts
import { jest } from '@jest/globals';

process.env.DATABASE_URL ??= "$TEST_DATABASE_URL";

const saved: string[] = [];
const deleted: string[] = [];
let failOnPath: string | null = null;

const fakeBucket = {
  name: 'test-bucket',
  file(path: string) {
    return {
      async save() {
        if (path === failOnPath) throw new Error('boom');
        saved.push(path);
      },
      async delete() {
        deleted.push(path);
      },
    };
  },
};
jest.unstable_mockModule('../../src/config/firebase.js', () => ({
  getStorageBucket: () => fakeBucket,
}));
jest.unstable_mockModule('../../src/db/connect.js', () => ({
  default: { query: async () => ({ rows: [], rowCount: 0 }) },
}));

const { validateMedia, uploadPostMedia, CommunityMediaError } = await import(
  '../../src/services/community-media.service.js'
);

const img = (size = 1000, mimetype = 'image/jpeg') => ({ buffer: Buffer.alloc(size), mimetype, size });
const item = () => ({ image: img(), thumb: img(100), width: 800, height: 600 });

beforeEach(() => {
  saved.length = 0;
  deleted.length = 0;
  failOnPath = null;
});

describe('validateMedia', () => {
  it('rejects more than 4 images', () => {
    expect(() => validateMedia([item(), item(), item(), item(), item()])).toThrow(CommunityMediaError);
  });
  it('rejects gif', () => {
    expect(() => validateMedia([{ ...item(), image: img(10, 'image/gif') }])).toThrow('invalid_type');
  });
  it('rejects image > 2MB and thumb > 200KB', () => {
    expect(() => validateMedia([{ ...item(), image: img(2 * 1024 * 1024 + 1) }])).toThrow('image_too_large');
    expect(() => validateMedia([{ ...item(), thumb: img(200 * 1024 + 1) }])).toThrow('thumb_too_large');
  });
  it('rejects non-positive dimensions', () => {
    expect(() => validateMedia([{ ...item(), width: 0 }])).toThrow('invalid_dimensions');
  });
});

describe('uploadPostMedia', () => {
  it('uploads image + thumb per position', async () => {
    const out = await uploadPostMedia('p1', [item(), item()]);
    expect(saved).toEqual([
      'community/p1/0.jpg', 'community/p1/0_thumb.jpg',
      'community/p1/1.jpg', 'community/p1/1_thumb.jpg',
    ]);
    expect(out[1]).toMatchObject({ position: 1, storage_path: 'community/p1/1.jpg', width: 800 });
  });

  it('rolls back uploaded objects when the third image fails', async () => {
    failOnPath = 'community/p1/2.jpg';
    await expect(uploadPostMedia('p1', [item(), item(), item()])).rejects.toThrow('boom');
    expect(deleted.sort()).toEqual([...saved].sort());
    expect(saved).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run** `cd backend && npm test -- tests/unit/community-media.service.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

Append to `backend/src/services/storage.service.ts`:

```ts
import logger from '../utils/logger.js';

/** Best-effort delete: a missing object or network error is logged, never thrown. */
export async function deleteFromStorage(objectPath: string): Promise<void> {
  try {
    await getStorageBucket().file(objectPath).delete();
  } catch (e) {
    logger.warn({ err: e, storage_path: objectPath }, 'storage delete failed');
  }
}
```

(Put the `logger` import at the top of the file with the other imports.)

Create `backend/src/services/community-media.service.ts`:

```ts
import pool from '../db/connect.js';
import { uploadBufferToStorage, deleteFromStorage } from './storage.service.js';

export const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_THUMB_BYTES = 200 * 1024;
export const MAX_IMAGES = 4;

export interface UploadImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export interface MediaInput {
  image: UploadImage;
  thumb: UploadImage;
  width: number;
  height: number;
}

export interface StoredMedia {
  storage_path: string;
  thumb_path: string;
  url: string;
  thumb_url: string;
  width: number;
  height: number;
  position: number;
}

export class CommunityMediaError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export function validateMedia(items: MediaInput[]): void {
  if (items.length > MAX_IMAGES) throw new CommunityMediaError('too_many_images');
  for (const it of items) {
    if (!ALLOWED_IMAGE_MIME.has(it.image.mimetype) || !ALLOWED_IMAGE_MIME.has(it.thumb.mimetype)) {
      throw new CommunityMediaError('invalid_type');
    }
    if (it.image.size > MAX_IMAGE_BYTES) throw new CommunityMediaError('image_too_large');
    if (it.thumb.size > MAX_THUMB_BYTES) throw new CommunityMediaError('thumb_too_large');
    if (!Number.isInteger(it.width) || !Number.isInteger(it.height) || it.width <= 0 || it.height <= 0) {
      throw new CommunityMediaError('invalid_dimensions');
    }
  }
}

export async function deleteMediaObjects(paths: string[]): Promise<void> {
  await Promise.all(paths.map((p) => deleteFromStorage(p)));
}

/** Upload every image + thumb; on any failure delete what was already uploaded and rethrow. */
export async function uploadPostMedia(postId: string, items: MediaInput[]): Promise<StoredMedia[]> {
  const uploaded: string[] = [];
  const out: StoredMedia[] = [];
  try {
    for (const [position, it] of items.entries()) {
      const storage_path = `community/${postId}/${position}.jpg`;
      const thumb_path = `community/${postId}/${position}_thumb.jpg`;
      const url = await uploadBufferToStorage(storage_path, it.image.buffer, it.image.mimetype);
      uploaded.push(storage_path);
      const thumb_url = await uploadBufferToStorage(thumb_path, it.thumb.buffer, it.thumb.mimetype);
      uploaded.push(thumb_path);
      out.push({ storage_path, thumb_path, url, thumb_url, width: it.width, height: it.height, position });
    }
    return out;
  } catch (e) {
    await deleteMediaObjects(uploaded);
    throw e;
  }
}

/** Called before a user row is deleted: FK cascade removes rows, not Storage objects. */
export async function deleteUserCommunityMedia(userId: string): Promise<void> {
  const r = await pool.query<{ storage_path: string; thumb_path: string }>(
    `SELECT m.storage_path, m.thumb_path
       FROM community_post_media m
       JOIN community_posts p ON p.id = m.post_id
      WHERE p.author_id = $1`,
    [userId],
  );
  await deleteMediaObjects(r.rows.flatMap((row) => [row.storage_path, row.thumb_path]));
}
```

- [ ] **Step 4: Run** `cd backend && npm test -- tests/unit/community-media.service.test.ts && npx tsc --noEmit` → PASS.

- [ ] **Step 5: Wire user deletion.** In `backend/src/services/auth.service.ts` `deleteAccount`, right after `await deleteAvatarObject(user.avatar_url);` add:

```ts
  await deleteUserCommunityMedia(userId);
```

In `backend/src/services/admin.service.ts`, in the function containing `DELETE FROM users WHERE id = $1` (~line 280), add `await deleteUserCommunityMedia(id);` immediately before that DELETE. Import in both files: `import { deleteUserCommunityMedia } from './community-media.service.js';`

Check the existing unit tests that mock modules for these services still pass: `cd backend && npm test -- tests/unit/delete-account.service.test.ts`. If that test mocks `../../src/db/connect.js` with a fake pool whose `query` returns rows shaped for other queries, `deleteUserCommunityMedia` will receive them — if it breaks, add `jest.unstable_mockModule('../../src/services/community-media.service.js', () => ({ deleteUserCommunityMedia: async () => {} }))` to that test file **before** its dynamic imports.

---

### Task 4: Community service — wall core

**Files:**
- Create: `backend/src/services/community.service.ts`
- Create: `backend/tests/integration/community-helpers.ts`
- Test: `backend/tests/integration/community-posts.test.ts`, `backend/tests/integration/community-feed.test.ts` (written in Task 5 against HTTP)

**Interfaces:**
- Consumes: `uploadPostMedia`, `validateMedia`, `deleteMediaObjects`, `MediaInput`, `CommunityMediaError` (Task 3); `notifyUser` from `notification.service.js`.
- Produces (all exported from `community.service.ts`):

```ts
export type Role = 'athlete' | 'admin' | 'superadmin';
export interface Viewer { id: string; role: Role }
export type PostKind = 'post' | 'announcement' | 'event';
export type Category = 'general' | 'meals' | 'training';
export interface PostDTO {
  type: 'post';
  id: string; kind: PostKind; category: Category; body: string; created_at: string; pinned: boolean;
  author: { id: string; name: string; avatar_url: string | null; is_coach: boolean };
  media: Array<{ url: string; thumb_url: string; width: number; height: number }>;
  like_count: number; comment_count: number; liked_by_me: boolean;
  event?: { location: string | null; starts_at: string; rsvp_count: number; going: boolean };
  can_delete: boolean;
  hidden_at?: string | null; // only present in admin listings
}
export interface CommentDTO {
  id: string; post_id: string; body: string; created_at: string;
  author: { id: string; name: string; avatar_url: string | null; is_coach: boolean };
  can_delete: boolean;
}
export class CommunityError extends Error { constructor(public status: number, public code: string) }
export const isAdminRole: (role: Role) => boolean;
export function visibleAuthorsClause(authorCol: string, viewerParam: string): string;
export function encodeCursor(ts: string, id: string): string;
export function decodeCursor(cursor: string): { ts: string; id: string } | null;
export async function isCommunityEnabled(): Promise<boolean>;
export async function selectPosts(viewer: Viewer, opts: {
  where: string[]; params: unknown[]; orderBy: string; limit: number; admin?: boolean;
}): Promise<Array<PostDTO & { cursor_ts: string }>>;
export async function getFeed(viewer: Viewer, opts: { cursor?: string; category?: Category }):
  Promise<{ pinned: PostDTO[]; items: PostDTO[]; next_cursor: string | null }>;
export async function newCount(viewer: Viewer, sinceId: string | undefined): Promise<number>;
export async function getPost(viewer: Viewer, postId: string): Promise<PostDTO>; // 404 post_not_found
export async function createPost(viewer: Viewer, input: {
  kind: PostKind; category: Category; body: string; media: MediaInput[];
  event_location?: string | null; event_starts_at?: string | null; pin?: boolean;
}): Promise<PostDTO>;
export async function deletePost(viewer: Viewer, postId: string): Promise<void>;
export async function setLike(viewer: Viewer, postId: string, liked: boolean): Promise<void>;
export async function listComments(viewer: Viewer, postId: string, cursor?: string):
  Promise<{ items: CommentDTO[]; next_cursor: string | null }>;
export async function createComment(viewer: Viewer, postId: string, body: string): Promise<CommentDTO>;
export async function deleteComment(viewer: Viewer, commentId: string): Promise<void>;
export async function setRsvp(viewer: Viewer, postId: string, going: boolean): Promise<void>;
export async function listBlocks(userId: string): Promise<Array<{ id: string; name: string; avatar_url: string | null }>>;
export async function setBlock(userId: string, blockedId: string, blocked: boolean): Promise<void>;
export async function acceptTerms(userId: string): Promise<void>;
export async function markSeen(userId: string): Promise<void>;
export async function communityFlags(userId: string): Promise<{
  community_enabled: boolean; community_terms_accepted: boolean; community_unseen: boolean;
}>;
export async function assertCanParticipate(viewer: Viewer): Promise<void>; // 403 terms_required / muted
export const FEED_PAGE_SIZE = 20;
export const COMMENTS_PAGE_SIZE = 30;
export const MAX_PINNED = 3;
```

Error codes used (status, code): `(404,'post_not_found')`, `(404,'comment_not_found')`, `(403,'forbidden')`, `(403,'terms_required')`, `(403,'muted')`, `(400,'empty_post')`, `(400,'not_an_event')`, `(400,'invalid_cursor')`, `(400,'cannot_block_self')`, `(404,'user_not_found')`, `(409,'pin_limit')`.

- [ ] **Step 1: Create `backend/src/services/community.service.ts`**

```ts
import { randomUUID } from 'node:crypto';
import pool from '../db/connect.js';
import logger from '../utils/logger.js';
import { notifyUser } from './notification.service.js';
import {
  uploadPostMedia,
  validateMedia,
  deleteMediaObjects,
  type MediaInput,
} from './community-media.service.js';

export type Role = 'athlete' | 'admin' | 'superadmin';
export interface Viewer {
  id: string;
  role: Role;
}
export type PostKind = 'post' | 'announcement' | 'event';
export type Category = 'general' | 'meals' | 'training';

export interface AuthorDTO {
  id: string;
  name: string;
  avatar_url: string | null;
  is_coach: boolean;
}

export interface PostDTO {
  type: 'post';
  id: string;
  kind: PostKind;
  category: Category;
  body: string;
  created_at: string;
  pinned: boolean;
  author: AuthorDTO;
  media: Array<{ url: string; thumb_url: string; width: number; height: number }>;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  event?: { location: string | null; starts_at: string; rsvp_count: number; going: boolean };
  can_delete: boolean;
  hidden_at?: string | null;
}

export interface CommentDTO {
  id: string;
  post_id: string;
  body: string;
  created_at: string;
  author: AuthorDTO;
  can_delete: boolean;
}

export class CommunityError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

export const FEED_PAGE_SIZE = 20;
export const COMMENTS_PAGE_SIZE = 30;
export const MAX_PINNED = 3;

export const isAdminRole = (role: Role): boolean => role === 'admin' || role === 'superadmin';

/** Display name: signup name, else athlete/coach profile name. `u` = users alias prefix. */
export const AUTHOR_NAME_SQL = (u: string, ap: string, cp: string) =>
  `COALESCE(NULLIF(TRIM(CONCAT(${u}.first_name, ' ', ${u}.last_name)), ''), ${ap}.name, ${cp}.name, 'Usuario')`;

/**
 * The single block filter: excludes authors I blocked and authors who blocked me.
 * `authorCol` is the SQL column holding the author id, `viewerParam` the placeholder ($n).
 */
export function visibleAuthorsClause(authorCol: string, viewerParam: string): string {
  return `NOT EXISTS (
    SELECT 1 FROM community_blocks b
     WHERE (b.blocker_id = ${viewerParam} AND b.blocked_id = ${authorCol})
        OR (b.blocker_id = ${authorCol} AND b.blocked_id = ${viewerParam}))`;
}

/** Opaque keyset cursor over (created_at, id). ts keeps microseconds as text. */
export function encodeCursor(ts: string, id: string): string {
  return Buffer.from(`${ts}|${id}`).toString('base64url');
}

export function decodeCursor(cursor: string): { ts: string; id: string } | null {
  try {
    const [ts, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    if (!ts || !id || Number.isNaN(Date.parse(ts))) return null;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    return { ts, id };
  } catch {
    return null;
  }
}

const CURSOR_TS_SQL = (col: string) =>
  `to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

export async function isCommunityEnabled(): Promise<boolean> {
  const r = await pool.query<{ on: boolean }>(
    `SELECT community_launched_on IS NOT NULL AS on FROM platform_fee_config WHERE id = 1`,
  );
  return r.rows[0]?.on ?? false;
}

interface PostRow {
  id: string;
  kind: PostKind;
  category: Category;
  body: string;
  created_at: Date;
  cursor_ts: string;
  pinned_at: Date | null;
  hidden_at: Date | null;
  event_location: string | null;
  event_starts_at: Date | null;
  author_id: string;
  author_name: string;
  author_avatar: string | null;
  author_role: Role;
  media: Array<{ url: string; thumb_url: string; width: number; height: number }>;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  rsvp_count: number;
  going: boolean;
}

function toPostDTO(row: PostRow, viewer: Viewer, admin: boolean): PostDTO & { cursor_ts: string } {
  const dto: PostDTO & { cursor_ts: string } = {
    type: 'post',
    id: row.id,
    kind: row.kind,
    category: row.category,
    body: row.body,
    created_at: new Date(row.created_at).toISOString(),
    pinned: row.pinned_at !== null,
    author: {
      id: row.author_id,
      name: row.author_name,
      avatar_url: row.author_avatar,
      is_coach: isAdminRole(row.author_role),
    },
    media: row.media ?? [],
    like_count: Number(row.like_count),
    comment_count: Number(row.comment_count),
    liked_by_me: row.liked_by_me,
    can_delete: row.author_id === viewer.id || isAdminRole(viewer.role),
    cursor_ts: row.cursor_ts,
  };
  if (row.kind === 'event' && row.event_starts_at) {
    dto.event = {
      location: row.event_location,
      starts_at: new Date(row.event_starts_at).toISOString(),
      rsvp_count: Number(row.rsvp_count),
      going: row.going,
    };
  }
  if (admin) dto.hidden_at = row.hidden_at ? new Date(row.hidden_at).toISOString() : null;
  return dto;
}

/**
 * Shared post SELECT. `$1` is always the viewer id; callers append their own params
 * starting at $2 and pass extra WHERE fragments. Deleted posts are always excluded.
 */
export async function selectPosts(
  viewer: Viewer,
  opts: { where: string[]; params: unknown[]; orderBy: string; limit: number; admin?: boolean },
): Promise<Array<PostDTO & { cursor_ts: string }>> {
  const where = ['p.deleted_at IS NULL', ...opts.where];
  const r = await pool.query<PostRow>(
    `SELECT p.id, p.kind, p.category, p.body, p.created_at, ${CURSOR_TS_SQL('p.created_at')} AS cursor_ts,
            p.pinned_at, p.hidden_at, p.event_location, p.event_starts_at,
            p.author_id, ${AUTHOR_NAME_SQL('u', 'ap', 'cp')} AS author_name,
            ap.avatar_url AS author_avatar, u.role AS author_role,
            COALESCE((SELECT json_agg(json_build_object('url', m.url, 'thumb_url', m.thumb_url,
                                                       'width', m.width, 'height', m.height)
                                      ORDER BY m.position)
                        FROM community_post_media m WHERE m.post_id = p.id), '[]'::json) AS media,
            (SELECT count(*) FROM community_likes l WHERE l.post_id = p.id)::int AS like_count,
            (SELECT count(*) FROM community_comments c
              WHERE c.post_id = p.id AND c.deleted_at IS NULL AND c.hidden_at IS NULL)::int AS comment_count,
            EXISTS (SELECT 1 FROM community_likes l WHERE l.post_id = p.id AND l.user_id = $1) AS liked_by_me,
            (SELECT count(*) FROM community_event_rsvps r WHERE r.post_id = p.id)::int AS rsvp_count,
            EXISTS (SELECT 1 FROM community_event_rsvps r WHERE r.post_id = p.id AND r.user_id = $1) AS going
       FROM community_posts p
       JOIN users u ON u.id = p.author_id
       LEFT JOIN athlete_profiles ap ON ap.user_id = u.id
       LEFT JOIN coach_profiles cp ON cp.user_id = u.id
      WHERE ${where.join(' AND ')}
      ORDER BY ${opts.orderBy}
      LIMIT ${opts.limit}`,
    [viewer.id, ...opts.params],
  );
  return r.rows.map((row) => toPostDTO(row, viewer, opts.admin ?? false));
}

const strip = ({ cursor_ts: _c, ...rest }: PostDTO & { cursor_ts: string }): PostDTO => rest;

/** Visible-to-viewer filter used by every /community read. */
const VISIBLE = ['p.hidden_at IS NULL', visibleAuthorsClause('p.author_id', '$1')];

export async function getFeed(
  viewer: Viewer,
  opts: { cursor?: string; category?: Category },
): Promise<{ pinned: PostDTO[]; items: PostDTO[]; next_cursor: string | null }> {
  // $1 is the viewer inside selectPosts, so our params start at $2.
  const where = [...VISIBLE, 'p.pinned_at IS NULL'];
  const params: unknown[] = [];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length + 1}`;
  };
  if (opts.category) where.push(`p.category = ${add(opts.category)}`);
  let pinned: PostDTO[] = [];
  if (opts.cursor) {
    const c = decodeCursor(opts.cursor);
    if (!c) throw new CommunityError(400, 'invalid_cursor');
    where.push(`(p.created_at, p.id) < (${add(c.ts)}::timestamptz, ${add(c.id)}::uuid)`);
  } else {
    const pinWhere = [...VISIBLE, 'p.pinned_at IS NOT NULL'];
    const pinParams: unknown[] = [];
    if (opts.category) {
      pinParams.push(opts.category);
      pinWhere.push(`p.category = $2`);
    }
    pinned = (
      await selectPosts(viewer, { where: pinWhere, params: pinParams, orderBy: 'p.pinned_at DESC', limit: MAX_PINNED })
    ).map(strip);
  }
  const rows = await selectPosts(viewer, {
    where,
    params,
    orderBy: 'p.created_at DESC, p.id DESC',
    limit: FEED_PAGE_SIZE,
  });
  const last = rows[rows.length - 1];
  return {
    pinned,
    items: rows.map(strip),
    next_cursor: rows.length === FEED_PAGE_SIZE && last ? encodeCursor(last.cursor_ts, last.id) : null,
  };
}
```

Continue the file:

```ts
export async function newCount(viewer: Viewer, sinceId: string | undefined): Promise<number> {
  if (!sinceId || !/^[0-9a-f-]{36}$/i.test(sinceId)) return 0;
  const r = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM community_posts p, community_posts s
      WHERE s.id = $2
        AND p.deleted_at IS NULL AND ${VISIBLE.join(' AND ')}
        AND (p.created_at, p.id) > (s.created_at, s.id)`,
    [viewer.id, sinceId],
  );
  return r.rows[0]?.n ?? 0;
}

export async function getPost(viewer: Viewer, postId: string): Promise<PostDTO> {
  const rows = await selectPosts(viewer, {
    where: [...VISIBLE, 'p.id = $2'],
    params: [postId],
    orderBy: 'p.created_at DESC',
    limit: 1,
  });
  if (!rows[0]) throw new CommunityError(404, 'post_not_found');
  return strip(rows[0]);
}

export async function assertCanParticipate(viewer: Viewer): Promise<void> {
  if (isAdminRole(viewer.role)) return;
  const r = await pool.query<{ terms: boolean; muted: boolean }>(
    `SELECT community_terms_accepted_at IS NOT NULL AS terms,
            COALESCE(community_muted_until > now(), false) AS muted
       FROM users WHERE id = $1`,
    [viewer.id],
  );
  const u = r.rows[0];
  if (!u?.terms) throw new CommunityError(403, 'terms_required');
  if (u.muted) throw new CommunityError(403, 'muted');
}

async function countPinned(): Promise<number> {
  const r = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM community_posts
      WHERE pinned_at IS NOT NULL AND deleted_at IS NULL AND hidden_at IS NULL`,
  );
  return r.rows[0].n;
}

export async function createPost(
  viewer: Viewer,
  input: {
    kind: PostKind;
    category: Category;
    body: string;
    media: MediaInput[];
    event_location?: string | null;
    event_starts_at?: string | null;
    pin?: boolean;
  },
): Promise<PostDTO> {
  if (input.kind !== 'post' && !isAdminRole(viewer.role)) throw new CommunityError(403, 'forbidden');
  await assertCanParticipate(viewer);
  const body = input.body.trim();
  if (!body && input.media.length === 0) throw new CommunityError(400, 'empty_post');
  validateMedia(input.media);
  if (input.pin && (await countPinned()) >= MAX_PINNED) throw new CommunityError(409, 'pin_limit');

  const postId = randomUUID();
  const stored = await uploadPostMedia(postId, input.media);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO community_posts
         (id, author_id, kind, category, body, event_location, event_starts_at, pinned_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $8::boolean THEN now() END)`,
      [
        postId,
        viewer.id,
        input.kind,
        input.category,
        body,
        input.kind === 'event' ? (input.event_location ?? null) : null,
        input.kind === 'event' ? (input.event_starts_at ?? null) : null,
        input.pin ?? false,
      ],
    );
    for (const m of stored) {
      await client.query(
        `INSERT INTO community_post_media
           (post_id, storage_path, thumb_path, url, thumb_url, width, height, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [postId, m.storage_path, m.thumb_path, m.url, m.thumb_url, m.width, m.height, m.position],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    await deleteMediaObjects(stored.flatMap((m) => [m.storage_path, m.thumb_path]));
    throw e;
  } finally {
    client.release();
  }
  return getPost(viewer, postId);
}

export async function deletePost(viewer: Viewer, postId: string): Promise<void> {
  const r = await pool.query<{ author_id: string }>(
    `SELECT author_id FROM community_posts WHERE id = $1 AND deleted_at IS NULL`,
    [postId],
  );
  const post = r.rows[0];
  if (!post) throw new CommunityError(404, 'post_not_found');
  if (post.author_id !== viewer.id && !isAdminRole(viewer.role)) throw new CommunityError(403, 'forbidden');
  await pool.query(`UPDATE community_posts SET deleted_at = now(), pinned_at = NULL WHERE id = $1`, [postId]);
  const media = await pool.query<{ storage_path: string; thumb_path: string }>(
    `SELECT storage_path, thumb_path FROM community_post_media WHERE post_id = $1`,
    [postId],
  );
  await deleteMediaObjects(media.rows.flatMap((m) => [m.storage_path, m.thumb_path]));
}

/** 404 unless the post exists, is not deleted/hidden and its author is not blocked either way. */
async function assertVisiblePost(viewer: Viewer, postId: string): Promise<{ author_id: string; kind: PostKind }> {
  const r = await pool.query<{ author_id: string; kind: PostKind }>(
    `SELECT p.author_id, p.kind FROM community_posts p
      WHERE p.id = $2 AND p.deleted_at IS NULL AND ${VISIBLE.join(' AND ')}`,
    [viewer.id, postId],
  );
  if (!r.rows[0]) throw new CommunityError(404, 'post_not_found');
  return r.rows[0];
}

export async function setLike(viewer: Viewer, postId: string, liked: boolean): Promise<void> {
  await assertVisiblePost(viewer, postId);
  if (liked) {
    await pool.query(
      `INSERT INTO community_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [postId, viewer.id],
    );
  } else {
    await pool.query(`DELETE FROM community_likes WHERE post_id = $1 AND user_id = $2`, [postId, viewer.id]);
  }
}

interface CommentRow {
  id: string;
  post_id: string;
  body: string;
  created_at: Date;
  cursor_ts: string;
  author_id: string;
  author_name: string;
  author_avatar: string | null;
  author_role: Role;
}

const COMMENT_SELECT = `
  SELECT c.id, c.post_id, c.body, c.created_at, ${CURSOR_TS_SQL('c.created_at')} AS cursor_ts,
         c.author_id, ${AUTHOR_NAME_SQL('u', 'ap', 'cp')} AS author_name,
         ap.avatar_url AS author_avatar, u.role AS author_role
    FROM community_comments c
    JOIN users u ON u.id = c.author_id
    LEFT JOIN athlete_profiles ap ON ap.user_id = u.id
    LEFT JOIN coach_profiles cp ON cp.user_id = u.id`;

function toCommentDTO(row: CommentRow, viewer: Viewer): CommentDTO {
  return {
    id: row.id,
    post_id: row.post_id,
    body: row.body,
    created_at: new Date(row.created_at).toISOString(),
    author: {
      id: row.author_id,
      name: row.author_name,
      avatar_url: row.author_avatar,
      is_coach: isAdminRole(row.author_role),
    },
    can_delete: row.author_id === viewer.id || isAdminRole(viewer.role),
  };
}

export async function listComments(
  viewer: Viewer,
  postId: string,
  cursor?: string,
): Promise<{ items: CommentDTO[]; next_cursor: string | null }> {
  await assertVisiblePost(viewer, postId);
  const params: unknown[] = [viewer.id, postId];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const where = [
    'c.post_id = $2',
    'c.deleted_at IS NULL',
    'c.hidden_at IS NULL',
    visibleAuthorsClause('c.author_id', '$1'),
  ];
  if (cursor) {
    const c = decodeCursor(cursor);
    if (!c) throw new CommunityError(400, 'invalid_cursor');
    where.push(`(c.created_at, c.id) > (${add(c.ts)}::timestamptz, ${add(c.id)}::uuid)`);
  }
  const r = await pool.query<CommentRow>(
    `${COMMENT_SELECT} WHERE ${where.join(' AND ')}
      ORDER BY c.created_at ASC, c.id ASC LIMIT ${COMMENTS_PAGE_SIZE}`,
    params,
  );
  const last = r.rows[r.rows.length - 1];
  return {
    items: r.rows.map((row) => toCommentDTO(row, viewer)),
    next_cursor: r.rows.length === COMMENTS_PAGE_SIZE && last ? encodeCursor(last.cursor_ts, last.id) : null,
  };
}

export async function createComment(viewer: Viewer, postId: string, body: string): Promise<CommentDTO> {
  await assertCanParticipate(viewer);
  const post = await assertVisiblePost(viewer, postId);
  const ins = await pool.query<{ id: string }>(
    `INSERT INTO community_comments (post_id, author_id, body) VALUES ($1, $2, $3) RETURNING id`,
    [postId, viewer.id, body.trim()],
  );
  const r = await pool.query<CommentRow>(`${COMMENT_SELECT} WHERE c.id = $1`, [ins.rows[0].id]);
  const dto = toCommentDTO(r.rows[0], viewer);
  if (post.author_id !== viewer.id) {
    void notifyUser(post.author_id, 'community_comment', { postId, commenter: dto.author.name }).catch((e) =>
      logger.error({ err: e }, 'community comment push failed'),
    );
  }
  return dto;
}

export async function deleteComment(viewer: Viewer, commentId: string): Promise<void> {
  const r = await pool.query<{ author_id: string }>(
    `SELECT author_id FROM community_comments WHERE id = $1 AND deleted_at IS NULL`,
    [commentId],
  );
  const c = r.rows[0];
  if (!c) throw new CommunityError(404, 'comment_not_found');
  if (c.author_id !== viewer.id && !isAdminRole(viewer.role)) throw new CommunityError(403, 'forbidden');
  await pool.query(`UPDATE community_comments SET deleted_at = now() WHERE id = $1`, [commentId]);
}

export async function setRsvp(viewer: Viewer, postId: string, going: boolean): Promise<void> {
  const post = await assertVisiblePost(viewer, postId);
  if (post.kind !== 'event') throw new CommunityError(400, 'not_an_event');
  if (going) {
    await pool.query(
      `INSERT INTO community_event_rsvps (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [postId, viewer.id],
    );
  } else {
    await pool.query(`DELETE FROM community_event_rsvps WHERE post_id = $1 AND user_id = $2`, [postId, viewer.id]);
  }
}

export async function listBlocks(
  userId: string,
): Promise<Array<{ id: string; name: string; avatar_url: string | null }>> {
  const r = await pool.query<{ id: string; name: string; avatar_url: string | null }>(
    `SELECT u.id, ${AUTHOR_NAME_SQL('u', 'ap', 'cp')} AS name, ap.avatar_url
       FROM community_blocks b
       JOIN users u ON u.id = b.blocked_id
       LEFT JOIN athlete_profiles ap ON ap.user_id = u.id
       LEFT JOIN coach_profiles cp ON cp.user_id = u.id
      WHERE b.blocker_id = $1
      ORDER BY b.created_at DESC`,
    [userId],
  );
  return r.rows;
}

export async function setBlock(userId: string, blockedId: string, blocked: boolean): Promise<void> {
  if (userId === blockedId) throw new CommunityError(400, 'cannot_block_self');
  if (!blocked) {
    await pool.query(`DELETE FROM community_blocks WHERE blocker_id = $1 AND blocked_id = $2`, [userId, blockedId]);
    return;
  }
  const exists = await pool.query(`SELECT 1 FROM users WHERE id = $1`, [blockedId]);
  if (!exists.rowCount) throw new CommunityError(404, 'user_not_found');
  await pool.query(
    `INSERT INTO community_blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, blockedId],
  );
}

export async function acceptTerms(userId: string): Promise<void> {
  await pool.query(
    `UPDATE users SET community_terms_accepted_at = COALESCE(community_terms_accepted_at, now()) WHERE id = $1`,
    [userId],
  );
}

export async function markSeen(userId: string): Promise<void> {
  await pool.query(`UPDATE users SET community_seen_at = now() WHERE id = $1`, [userId]);
}

export async function communityFlags(userId: string): Promise<{
  community_enabled: boolean;
  community_terms_accepted: boolean;
  community_unseen: boolean;
}> {
  const r = await pool.query<{ enabled: boolean; terms: boolean; unseen: boolean }>(
    `SELECT (SELECT community_launched_on IS NOT NULL FROM platform_fee_config WHERE id = 1) AS enabled,
            u.community_terms_accepted_at IS NOT NULL AS terms,
            EXISTS (
              SELECT 1 FROM community_comments c
                JOIN community_posts p ON p.id = c.post_id
               WHERE p.author_id = u.id AND p.deleted_at IS NULL
                 AND c.author_id <> u.id AND c.deleted_at IS NULL AND c.hidden_at IS NULL
                 AND c.created_at > COALESCE(u.community_seen_at, '-infinity'::timestamptz)
            ) AS unseen
       FROM users u WHERE u.id = $1`,
    [userId],
  );
  const row = r.rows[0];
  return {
    community_enabled: row?.enabled ?? false,
    community_terms_accepted: row?.terms ?? false,
    community_unseen: row?.unseen ?? false,
  };
}
```

In `selectPosts`/`getFeed`, remember: extra `params` passed to `selectPosts` become `$2…` because `$1` is the viewer. In `getFeed`, the `add` helper must therefore return `$${params.length + 1}` (params does NOT include the viewer there). In `listComments` the viewer IS inside `params`, so `add` returns `$${params.length}`. Double-check both.

- [ ] **Step 2: Type-check** `cd backend && npx tsc --noEmit` → no errors.

(Behavior is tested through HTTP in Task 5.)

---

### Task 5: `/community` router + rate limits + mount + `/athlete/me` flags

**Files:**
- Modify: `backend/src/middleware/rate-limit.ts`
- Create: `backend/src/routes/community.ts`
- Modify: `backend/src/routes/index.ts`
- Modify: `backend/src/routes/athlete.ts` (`GET /me`)
- Create: `backend/tests/integration/community-helpers.ts`
- Test: `backend/tests/integration/community-posts.test.ts`, `backend/tests/integration/community-feed.test.ts`

**Interfaces:**
- Consumes: everything from Task 4; `CommunityMediaError` from Task 3.
- Produces: `communityPostLimiter`, `communityCommentLimiter`, `communityReportLimiter`, `userKeyedLimiter(prefix, windowMs, max)` in `rate-limit.ts`; `requireCommunityEnabled` middleware exported from `routes/community.ts`; `sendCommunityError(res, e): boolean` exported from `routes/community.ts` (returns true if it handled `CommunityError`/`CommunityMediaError`); `communityUpload` multer middleware + `parseMediaFromRequest(req): MediaInput[]` exported from `routes/community.ts` (reused by admin router).
- `POST /community/reports` is implemented in Task 6 (moderation) but mounted in this router — leave a spot for it.

- [ ] **Step 1: Rate limiters** — append to `backend/src/middleware/rate-limit.ts`:

```ts
/** Per-user limiter (falls back to IP when unauthenticated). Wrapped with skipInTests. */
export function userKeyedLimiter(prefix: string, windowMs: number, max: number): RequestHandler {
  return skipInTests(
    rateLimit({
      windowMs,
      max,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req: Request) =>
        req.user?.id ? `${prefix}:${req.user.id}` : `${prefix}:${ipKeyGenerator(req.ip ?? '')}`,
      handler: json429,
    }),
  );
}

export const communityPostLimiter = userKeyedLimiter('community-post', 60 * 60 * 1000, 10);
export const communityCommentLimiter = userKeyedLimiter('community-comment', 60 * 60 * 1000, 60);
export const communityReportLimiter = userKeyedLimiter('community-report', 24 * 60 * 60 * 1000, 20);
```

(`skipInTests` is declared at the bottom of the file; function declarations hoist, but `const` limiters calling it at module load are fine because `skipInTests` is a `function` declaration.)

- [ ] **Step 2: Test helpers** — `backend/tests/integration/community-helpers.ts`:

```ts
import pool from '../../src/db/connect.js';
import { signToken } from '../../src/middleware/auth.js';

export async function makeUser(role: 'athlete' | 'admin' | 'superadmin', name = 'User'): Promise<{ id: string; token: string }> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role, first_name, last_name, community_terms_accepted_at)
     VALUES ($1, 'x', $2, $3, 'Test', now()) RETURNING id`,
    [`c-${Date.now()}-${Math.random()}@t.local`, role, name],
  );
  return { id: rows[0].id, token: signToken({ id: rows[0].id, role }) };
}

export async function enableCommunity(): Promise<void> {
  await pool.query(`UPDATE platform_fee_config SET community_launched_on = '2026-09-01' WHERE id = 1`);
}

/** Insert a post directly (bypasses HTTP). createdAt lets tests control ordering. */
export async function insertPost(
  authorId: string,
  opts: { body?: string; kind?: 'post' | 'announcement' | 'event'; category?: string; createdAt?: string; pinned?: boolean; hidden?: boolean } = {},
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO community_posts (author_id, kind, category, body, created_at, pinned_at, hidden_at, event_starts_at)
     VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()),
             CASE WHEN $6::boolean THEN now() END, CASE WHEN $7::boolean THEN now() END,
             CASE WHEN $2 = 'event' THEN now() + interval '7 days' END)
     RETURNING id`,
    [authorId, opts.kind ?? 'post', opts.category ?? 'general', opts.body ?? 'hola', opts.createdAt ?? null, opts.pinned ?? false, opts.hidden ?? false],
  );
  return rows[0].id;
}

export const tinyJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9]);
```

Firebase must be mocked in each integration test file **before** importing the app (ESM). Every community integration test file starts with:

```ts
import { jest } from '@jest/globals';

export const storageOps: { saved: string[]; deleted: string[]; failOn: string | null } = { saved: [], deleted: [], failOn: null };
jest.unstable_mockModule('../../src/config/firebase.js', () => ({
  getStorageBucket: () => ({
    name: 'test-bucket',
    file: (path: string) => ({
      save: async () => {
        if (storageOps.failOn && path.endsWith(storageOps.failOn)) throw new Error('boom');
        storageOps.saved.push(path);
      },
      delete: async () => {
        storageOps.deleted.push(path);
      },
    }),
  }),
  getFirebaseApp: () => ({}),
}));
jest.unstable_mockModule('../../src/services/push.service.js', () => ({
  sendPush: async () => 'sent',
}));

const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const pool = (await import('../../src/db/connect.js')).default;
const request = (await import('supertest')).default;
const app = (await import('../../src/app.js')).default;
const { makeUser, enableCommunity, insertPost, tinyJpeg } = await import('./community-helpers.js');

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => {
  await resetDatabase();
  storageOps.saved.length = 0;
  storageOps.deleted.length = 0;
  storageOps.failOn = null;
});
afterAll(async () => { await closePool(); });
```

(Check `src/services/push.service.ts` export names before mocking it; if it exports more than `sendPush` and those are imported elsewhere at app load, add them to the mock as no-op functions. If mocking breaks app import, drop the push mock — `notifyUser` returns early when the user has no push tokens anyway.)

- [ ] **Step 3: Write failing tests** — `backend/tests/integration/community-posts.test.ts` (header above, then):

```ts
describe('/api/community posts', () => {
  it('athlete gets 404 community_disabled while module is off; admin passes', async () => {
    const a = await makeUser('athlete');
    const adm = await makeUser('admin');
    const r1 = await request(app).get('/api/community/feed').set('Authorization', `Bearer ${a.token}`);
    expect(r1.status).toBe(404);
    expect(r1.body.error).toBe('community_disabled');
    const r2 = await request(app).get('/api/community/feed').set('Authorization', `Bearer ${adm.token}`);
    expect(r2.status).toBe(200);
  });

  it('creates a text post and returns the post shape', async () => {
    await enableCommunity();
    const a = await makeUser('athlete', 'Ana');
    const r = await request(app)
      .post('/api/community/posts')
      .set('Authorization', `Bearer ${a.token}`)
      .field('body', 'Hola gente')
      .field('category', 'training');
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      type: 'post', kind: 'post', category: 'training', body: 'Hola gente',
      author: { id: a.id, is_coach: false }, like_count: 0, comment_count: 0,
      liked_by_me: false, can_delete: true, media: [],
    });
  });

  it('creates a post with 2 photos', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    const r = await request(app)
      .post('/api/community/posts')
      .set('Authorization', `Bearer ${a.token}`)
      .field('body', '')
      .field('widths', '800').field('widths', '640')
      .field('heights', '600').field('heights', '480')
      .attach('images', tinyJpeg, { filename: 'a.jpg', contentType: 'image/jpeg' })
      .attach('images', tinyJpeg, { filename: 'b.jpg', contentType: 'image/jpeg' })
      .attach('thumbs', tinyJpeg, { filename: 'a_t.jpg', contentType: 'image/jpeg' })
      .attach('thumbs', tinyJpeg, { filename: 'b_t.jpg', contentType: 'image/jpeg' });
    expect(r.status).toBe(201);
    expect(r.body.media).toHaveLength(2);
    expect(r.body.media[1]).toMatchObject({ width: 640, height: 480 });
    expect(storageOps.saved).toHaveLength(4);
  });

  it('rolls back when the third photo fails: no post, no objects left', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    let req = request(app).post('/api/community/posts').set('Authorization', `Bearer ${a.token}`).field('body', 'x');
    for (let i = 0; i < 3; i++) {
      req = req.field('widths', '10').field('heights', '10')
        .attach('images', tinyJpeg, { filename: `${i}.jpg`, contentType: 'image/jpeg' })
        .attach('thumbs', tinyJpeg, { filename: `${i}t.jpg`, contentType: 'image/jpeg' });
    }
    storageOps.failOn = '/2.jpg'; // postId is random: fail on any path ending in /2.jpg
    const r = await req;
    expect(r.status).toBe(500);
    expect(r.body.error).toBe('upload_failed');
    const n = await pool.query(`SELECT count(*)::int AS n FROM community_posts`);
    expect(n.rows[0].n).toBe(0);
    expect([...storageOps.deleted].sort()).toEqual([...storageOps.saved].sort());
  });

  it('rejects empty post, missing terms and muted user', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    const e = await request(app).post('/api/community/posts').set('Authorization', `Bearer ${a.token}`).field('body', '  ');
    expect(e.status).toBe(400);
    expect(e.body.error).toBe('empty_post');

    await pool.query(`UPDATE users SET community_terms_accepted_at = NULL WHERE id = $1`, [a.id]);
    const t = await request(app).post('/api/community/posts').set('Authorization', `Bearer ${a.token}`).field('body', 'x');
    expect(t.status).toBe(403);
    expect(t.body.error).toBe('terms_required');
    const tc = await request(app).post(`/api/community/posts/${await insertPost(a.id)}/comments`)
      .set('Authorization', `Bearer ${a.token}`).send({ body: 'hola' });
    expect(tc.body.error).toBe('terms_required');

    await request(app).post('/api/community/terms/accept').set('Authorization', `Bearer ${a.token}`).expect(204);
    await pool.query(`UPDATE users SET community_muted_until = now() + interval '1 day' WHERE id = $1`, [a.id]);
    const m = await request(app).post('/api/community/posts').set('Authorization', `Bearer ${a.token}`).field('body', 'x');
    expect(m.status).toBe(403);
    expect(m.body.error).toBe('muted');
  });

  it('athlete cannot create announcement or event (kind is ignored / forbidden)', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    const r = await request(app).post('/api/admin/community/posts').set('Authorization', `Bearer ${a.token}`)
      .field('kind', 'announcement').field('body', 'x');
    expect(r.status).toBe(403);
    const r2 = await request(app).post('/api/community/posts').set('Authorization', `Bearer ${a.token}`)
      .field('kind', 'event').field('body', 'x');
    expect(r2.status).toBe(201);
    expect(r2.body.kind).toBe('post');
  });

  it('likes are idempotent', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    const p = await insertPost(a.id);
    const auth = { Authorization: `Bearer ${a.token}` };
    await request(app).post(`/api/community/posts/${p}/like`).set(auth).expect(204);
    await request(app).post(`/api/community/posts/${p}/like`).set(auth).expect(204);
    let d = await request(app).get(`/api/community/posts/${p}`).set(auth);
    expect(d.body).toMatchObject({ like_count: 1, liked_by_me: true });
    await request(app).delete(`/api/community/posts/${p}/like`).set(auth).expect(204);
    d = await request(app).get(`/api/community/posts/${p}`).set(auth);
    expect(d.body.like_count).toBe(0);
  });

  it('comments: create, list chronologically, author delete, other user forbidden', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    const b = await makeUser('athlete');
    const p = await insertPost(a.id);
    const c1 = await request(app).post(`/api/community/posts/${p}/comments`).set('Authorization', `Bearer ${b.token}`).send({ body: 'uno' });
    expect(c1.status).toBe(201);
    await request(app).post(`/api/community/posts/${p}/comments`).set('Authorization', `Bearer ${a.token}`).send({ body: 'dos' });
    const list = await request(app).get(`/api/community/posts/${p}/comments`).set('Authorization', `Bearer ${a.token}`);
    expect(list.body.items.map((c: { body: string }) => c.body)).toEqual(['uno', 'dos']);
    const del = await request(app).delete(`/api/community/comments/${c1.body.id}`).set('Authorization', `Bearer ${a.token}`);
    expect(del.status).toBe(403);
    await request(app).delete(`/api/community/comments/${c1.body.id}`).set('Authorization', `Bearer ${b.token}`).expect(204);
    const d = await request(app).get(`/api/community/posts/${p}`).set('Authorization', `Bearer ${a.token}`);
    expect(d.body.comment_count).toBe(1);
  });

  it('rejects comment longer than 500 chars', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    const p = await insertPost(a.id);
    const r = await request(app).post(`/api/community/posts/${p}/comments`).set('Authorization', `Bearer ${a.token}`).send({ body: 'x'.repeat(501) });
    expect(r.status).toBe(400);
  });

  it('rsvp only on events', async () => {
    await enableCommunity();
    const adm = await makeUser('admin');
    const a = await makeUser('athlete');
    const post = await insertPost(adm.id);
    const ev = await insertPost(adm.id, { kind: 'event' });
    const bad = await request(app).post(`/api/community/posts/${post}/rsvp`).set('Authorization', `Bearer ${a.token}`);
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('not_an_event');
    await request(app).post(`/api/community/posts/${ev}/rsvp`).set('Authorization', `Bearer ${a.token}`).expect(204);
    const d = await request(app).get(`/api/community/posts/${ev}`).set('Authorization', `Bearer ${a.token}`);
    expect(d.body.event).toMatchObject({ rsvp_count: 1, going: true });
  });

  it('delete post: author sets deleted_at and removes storage objects', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    const p = await insertPost(a.id);
    await pool.query(
      `INSERT INTO community_post_media (post_id, storage_path, thumb_path, url, thumb_url, width, height, position)
       VALUES ($1, 'community/x/0.jpg', 'community/x/0_thumb.jpg', 'u', 't', 1, 1, 0)`, [p]);
    await request(app).delete(`/api/community/posts/${p}`).set('Authorization', `Bearer ${a.token}`).expect(204);
    expect(storageOps.deleted.sort()).toEqual(['community/x/0.jpg', 'community/x/0_thumb.jpg']);
    const d = await request(app).get(`/api/community/posts/${p}`).set('Authorization', `Bearer ${a.token}`);
    expect(d.status).toBe(404);
  });

  it('/athlete/me exposes community flags', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    const b = await makeUser('athlete');
    const p = await insertPost(a.id);
    await request(app).post(`/api/community/posts/${p}/comments`).set('Authorization', `Bearer ${b.token}`).send({ body: 'hey' });
    const me = await request(app).get('/api/athlete/me').set('Authorization', `Bearer ${a.token}`);
    expect(me.body).toMatchObject({ community_enabled: true, community_terms_accepted: true, community_unseen: true });
    await request(app).post('/api/community/seen').set('Authorization', `Bearer ${a.token}`).expect(204);
    const me2 = await request(app).get('/api/athlete/me').set('Authorization', `Bearer ${a.token}`);
    expect(me2.body.community_unseen).toBe(false);
  });
});
```

`backend/tests/integration/community-feed.test.ts` (same header):

```ts
describe('/api/community/feed', () => {
  it('paginates 20 per page with an opaque cursor, newest first', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    for (let i = 0; i < 25; i++) {
      await insertPost(a.id, { body: `p${i}`, createdAt: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString() });
    }
    const auth = { Authorization: `Bearer ${a.token}` };
    const p1 = await request(app).get('/api/community/feed').set(auth);
    expect(p1.body.items).toHaveLength(20);
    expect(p1.body.items[0].body).toBe('p24');
    expect(p1.body.next_cursor).toEqual(expect.any(String));
    const p2 = await request(app).get(`/api/community/feed?cursor=${p1.body.next_cursor}`).set(auth);
    expect(p2.body.items.map((x: { body: string }) => x.body)).toEqual(['p4', 'p3', 'p2', 'p1', 'p0']);
    expect(p2.body.next_cursor).toBeNull();
    expect(p2.body.pinned).toEqual([]);
  });

  it('filters by category together with a cursor', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    for (let i = 0; i < 22; i++) {
      await insertPost(a.id, { body: `m${i}`, category: 'meals', createdAt: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString() });
      await insertPost(a.id, { body: `t${i}`, category: 'training', createdAt: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString() });
    }
    const auth = { Authorization: `Bearer ${a.token}` };
    const p1 = await request(app).get('/api/community/feed?category=meals').set(auth);
    const p2 = await request(app).get(`/api/community/feed?category=meals&cursor=${p1.body.next_cursor}`).set(auth);
    expect([...p1.body.items, ...p2.body.items].every((x: { category: string }) => x.category === 'meals')).toBe(true);
    expect(p1.body.items.length + p2.body.items.length).toBe(22);
  });

  it('first page lists up to 3 pinned separately; hidden and deleted never appear', async () => {
    await enableCommunity();
    const adm = await makeUser('admin');
    const a = await makeUser('athlete');
    await insertPost(adm.id, { body: 'pin', pinned: true });
    await insertPost(a.id, { body: 'hidden', hidden: true });
    const d = await insertPost(a.id, { body: 'deleted' });
    await pool.query(`UPDATE community_posts SET deleted_at = now() WHERE id = $1`, [d]);
    await insertPost(a.id, { body: 'normal' });
    const r = await request(app).get('/api/community/feed').set('Authorization', `Bearer ${a.token}`);
    expect(r.body.pinned.map((x: { body: string }) => x.body)).toEqual(['pin']);
    expect(r.body.items.map((x: { body: string }) => x.body)).toEqual(['normal']);
  });

  it('blocks filter both directions in feed, detail, comments and new-count', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    const b = await makeUser('athlete');
    const c = await makeUser('athlete');
    const anchor = await insertPost(c.id, { createdAt: '2026-09-01T00:00:00Z' });
    const pb = await insertPost(b.id, { body: 'from b', createdAt: '2026-09-02T00:00:00Z' });
    await pool.query(`INSERT INTO community_comments (post_id, author_id, body) VALUES ($1, $2, 'b comment')`, [anchor, b.id]);
    await request(app).post(`/api/community/blocks/${b.id}`).set('Authorization', `Bearer ${a.token}`).expect(204);

    for (const viewer of [a, b]) {
      const auth = { Authorization: `Bearer ${viewer.token}` };
      const other = viewer === a ? b : a;
      const otherPost = viewer === a ? pb : await insertPost(a.id, { body: 'from a', createdAt: '2026-09-03T00:00:00Z' });
      const feed = await request(app).get('/api/community/feed').set(auth);
      expect(feed.body.items.some((x: { author: { id: string } }) => x.author.id === other.id)).toBe(false);
      const det = await request(app).get(`/api/community/posts/${otherPost}`).set(auth);
      expect(det.status).toBe(404);
      const nc = await request(app).get(`/api/community/feed/new-count?since=${anchor}`).set(auth);
      expect(nc.body.count).toBe(0);
    }
    const comments = await request(app).get(`/api/community/posts/${anchor}/comments`).set('Authorization', `Bearer ${a.token}`);
    expect(comments.body.items).toHaveLength(0);

    const blocks = await request(app).get('/api/community/blocks').set('Authorization', `Bearer ${a.token}`);
    expect(blocks.body.map((x: { id: string }) => x.id)).toEqual([b.id]);
    await request(app).delete(`/api/community/blocks/${b.id}`).set('Authorization', `Bearer ${a.token}`).expect(204);
    const det = await request(app).get(`/api/community/posts/${pb}`).set('Authorization', `Bearer ${a.token}`);
    expect(det.status).toBe(200);
  });

  it('new-count counts visible newer posts', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    const first = await insertPost(a.id, { createdAt: '2026-09-01T00:00:00Z' });
    await insertPost(a.id, { createdAt: '2026-09-02T00:00:00Z' });
    await insertPost(a.id, { createdAt: '2026-09-03T00:00:00Z', hidden: true });
    const r = await request(app).get(`/api/community/feed/new-count?since=${first}`).set('Authorization', `Bearer ${a.token}`);
    expect(r.body).toEqual({ count: 1 });
  });

  it('rejects a garbage cursor with 400 invalid_cursor', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    const r = await request(app).get('/api/community/feed?cursor=zzz').set('Authorization', `Bearer ${a.token}`);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('invalid_cursor');
  });
});
```

(The new-count loop inserts an "a" post created 2026-09-03 while viewer is b; newer than the anchor but authored by a, who blocked b → must count 0. For viewer a, b's post is newer than anchor and blocked → 0. Keep as written.)

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd backend && TEST_DATABASE_URL="$TEST_DATABASE_URL" npm test -- tests/integration/community-posts.test.ts tests/integration/community-feed.test.ts`
Expected: FAIL (404 route not found).

- [ ] **Step 5: Implement `backend/src/routes/community.ts`**

```ts
import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import {
  communityPostLimiter,
  communityCommentLimiter,
  communityReportLimiter,
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
import { CommunityMediaError, MAX_IMAGE_BYTES, MAX_IMAGES, type MediaInput } from '../services/community-media.service.js';
import { createReport } from '../services/community-moderation.service.js';
import logger from '../utils/logger.js';

const router = Router();

export async function requireCommunityEnabled(req: Request, res: Response, next: NextFunction): Promise<void> {
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
            : err instanceof multer.MulterError && (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE')
              ? 'too_many_images'
              : 'upload_failed';
        res.status(400).json({ error: code });
        return resolve(false);
      }
      resolve(true);
    });
  });
}

const asArray = (v: unknown): string[] => (v === undefined ? [] : Array.isArray(v) ? v.map(String) : [String(v)]);

/** Pairs images[i] with thumbs[i] and widths[i]/heights[i]. Throws CommunityMediaError('thumbs_mismatch'). */
export function parseMediaFromRequest(req: Request): MediaInput[] {
  const files = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
  const images = files.images ?? [];
  const thumbs = files.thumbs ?? [];
  const widths = asArray(req.body.widths ?? req.body['widths[]']).map(Number);
  const heights = asArray(req.body.heights ?? req.body['heights[]']).map(Number);
  if (thumbs.length !== images.length || widths.length !== images.length || heights.length !== images.length) {
    throw new CommunityMediaError('thumbs_mismatch');
  }
  return images.map((img, i) => ({
    image: { buffer: img.buffer, mimetype: img.mimetype, size: img.size },
    thumb: { buffer: thumbs[i].buffer, mimetype: thumbs[i].mimetype, size: thumbs[i].size },
    width: widths[i],
    height: heights[i],
  }));
}

const viewerOf = (req: Request): Viewer => ({ id: req.user!.id, role: req.user!.role });
const uuid = z.string().uuid();
const categoryEnum = z.enum(['general', 'meals', 'training']);

router.use(requireAuth, requireCommunityEnabled);

router.get(
  '/feed',
  handle(async (req, res) => {
    const q = z
      .object({ cursor: z.string().max(200).optional(), category: categoryEnum.optional() })
      .safeParse(req.query);
    if (!q.success) return res.status(400).json({ error: 'invalid_payload' });
    res.json(await getFeed(viewerOf(req), q.data));
  }),
);

router.get(
  '/feed/new-count',
  handle(async (req, res) => {
    const since = typeof req.query.since === 'string' ? req.query.since : undefined;
    res.json({ count: await newCount(viewerOf(req), since) });
  }),
);

const postFields = z.object({
  body: z.string().max(2000).default(''),
  category: categoryEnum.default('general'),
});

router.post('/posts', communityPostLimiter, async (req, res, next) => {
  if (!(await runUpload(req, res))) return;
  try {
    const parsed = postFields.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
    const media = parseMediaFromRequest(req);
    const post = await createPost(viewerOf(req), { kind: 'post', ...parsed.data, media });
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
    if (!uuid.safeParse(req.params.id).success) return res.status(404).json({ error: 'post_not_found' });
    res.json(await getPost(viewerOf(req), req.params.id));
  }),
);

router.delete(
  '/posts/:id',
  handle(async (req, res) => {
    if (!uuid.safeParse(req.params.id).success) return res.status(404).json({ error: 'post_not_found' });
    await deletePost(viewerOf(req), req.params.id);
    res.status(204).end();
  }),
);

for (const [method, liked] of [['post', true], ['delete', false]] as const) {
  router[method](
    '/posts/:id/like',
    handle(async (req, res) => {
      if (!uuid.safeParse(req.params.id).success) return res.status(404).json({ error: 'post_not_found' });
      await setLike(viewerOf(req), req.params.id, liked);
      res.status(204).end();
    }),
  );
  router[method](
    '/posts/:id/rsvp',
    handle(async (req, res) => {
      if (!uuid.safeParse(req.params.id).success) return res.status(404).json({ error: 'post_not_found' });
      await setRsvp(viewerOf(req), req.params.id, liked);
      res.status(204).end();
    }),
  );
}

router.get(
  '/posts/:id/comments',
  handle(async (req, res) => {
    if (!uuid.safeParse(req.params.id).success) return res.status(404).json({ error: 'post_not_found' });
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    res.json(await listComments(viewerOf(req), req.params.id, cursor));
  }),
);

router.post(
  '/posts/:id/comments',
  communityCommentLimiter,
  handle(async (req, res) => {
    if (!uuid.safeParse(req.params.id).success) return res.status(404).json({ error: 'post_not_found' });
    const parsed = z.object({ body: z.string().trim().min(1).max(500) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
    res.status(201).json(await createComment(viewerOf(req), req.params.id, parsed.data.body));
  }),
);

router.delete(
  '/comments/:id',
  handle(async (req, res) => {
    if (!uuid.safeParse(req.params.id).success) return res.status(404).json({ error: 'comment_not_found' });
    await deleteComment(viewerOf(req), req.params.id);
    res.status(204).end();
  }),
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
    if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
    const { created, id } = await createReport(req.user!.id, parsed.data);
    res.status(created ? 201 : 200).json({ id });
  }),
);

router.get(
  '/blocks',
  handle(async (req, res) => {
    res.json(await listBlocks(req.user!.id));
  }),
);

for (const [method, blocked] of [['post', true], ['delete', false]] as const) {
  router[method](
    '/blocks/:userId',
    handle(async (req, res) => {
      if (!uuid.safeParse(req.params.userId).success) return res.status(404).json({ error: 'user_not_found' });
      await setBlock(req.user!.id, req.params.userId, blocked);
      res.status(204).end();
    }),
  );
}

router.post(
  '/terms/accept',
  handle(async (req, res) => {
    await acceptTerms(req.user!.id);
    res.status(204).end();
  }),
);

router.post(
  '/seen',
  handle(async (req, res) => {
    await markSeen(req.user!.id);
    res.status(204).end();
  }),
);

export default router;
```

Note: `requireCommunityEnabled` runs before `communityPostLimiter`; that's intended. `router.use(requireAuth, requireCommunityEnabled)` must be registered **before** the route definitions (it is).

The `createReport` import comes from Task 6. To keep this task compiling before Task 6, create `backend/src/services/community-moderation.service.ts` now with the `createReport` function from Task 6 Step 3 (copy it now; Task 6 adds the rest).

- [ ] **Step 6: Mount routers** in `backend/src/routes/index.ts`:

```ts
import community from './community.js';
import adminCommunity from './admin-community.js';
...
router.use('/community', community);
router.use('/admin/community', adminCommunity);
```

Place `router.use('/admin/community', adminCommunity);` **before** `router.use('/admin', admin);`. If `admin-community.ts` doesn't exist yet, create it as a stub now (`const router = Router(); export default router;`) and fill it in Task 6.

- [ ] **Step 7: `/athlete/me` flags** — in `backend/src/routes/athlete.ts` `GET /me` handler, before `res.json({...})`:

```ts
  const community = await communityFlags(userId);
```

and spread it into the response: `res.json({ profile, programState: state, skeletonStatus: skeleton.status, regenState, blockedReason, ...community });`. Import `communityFlags` from `../services/community.service.js`.

- [ ] **Step 8: Run tests**

Run: `cd backend && TEST_DATABASE_URL="$TEST_DATABASE_URL" npm test -- tests/integration/community-posts.test.ts tests/integration/community-feed.test.ts`
Expected: PASS. Then `npx tsc --noEmit`.

Note: `/api/athlete/me` for a bare `makeUser('athlete')` (no athlete_profiles row) — check it doesn't crash (`findActiveByAthlete` etc.). If it 500s for users without a profile, use `createAthlete(coachId)` from `helpers/fixtures.js` in that test instead and set `first_name`/`community_terms_accepted_at` with an UPDATE.

---

### Task 6: Moderation service + `/admin/community` router

**Files:**
- Create/complete: `backend/src/services/community-moderation.service.ts`
- Create/complete: `backend/src/routes/admin-community.ts`
- Test: `backend/tests/integration/community-moderation.test.ts`

**Interfaces:**
- Consumes: `selectPosts`, `decodeCursor`, `encodeCursor`, `CommunityError`, `createPost`, `MAX_PINNED`, `AUTHOR_NAME_SQL`, `Viewer`, `FEED_PAGE_SIZE` (Task 4); `handle`, `runUpload`, `parseMediaFromRequest`, `sendCommunityError` (Task 5); `notifyUser`.
- Produces (from `community-moderation.service.ts`):

```ts
export async function createReport(reporterId: string, input: {
  target_type: 'post' | 'comment'; target_id: string;
  reason: 'offensive' | 'spam' | 'inappropriate' | 'other'; note?: string;
}): Promise<{ created: boolean; id: string }>; // 404 target_not_found
export async function listAdminPosts(viewer: Viewer, opts: { cursor?: string; includeHidden: boolean }):
  Promise<{ items: PostDTO[]; next_cursor: string | null }>;
export async function setPinned(postId: string, pinned: boolean): Promise<void>; // 409 pin_limit, 404
export async function setPostHidden(postId: string, hidden: boolean, adminId: string): Promise<void>;
export async function hideComment(commentId: string): Promise<void>;
export async function listRsvps(postId: string): Promise<Array<{ id: string; name: string; avatar_url: string | null; created_at: string }>>;
export interface ReportDTO {
  id: string; target_type: 'post' | 'comment'; target_id: string; reason: string; note: string | null;
  status: 'open' | 'actioned' | 'dismissed'; created_at: string; age_hours: number;
  reporter: { id: string; name: string };
  content: { body: string; author_id: string; author_name: string; hidden: boolean;
             media: Array<{ thumb_url: string }>; post_id: string } | null;
}
export async function listReports(status: 'open' | 'actioned' | 'dismissed'): Promise<ReportDTO[]>;
export async function resolveReport(reportId: string, adminId: string,
  input: { action: 'hide' | 'dismiss' | 'mute'; mute_days?: number }): Promise<void>;
export async function muteUser(userId: string, days: number | null): Promise<void>;
export async function openReportCount(): Promise<number>;
export async function notifyAllAthletes(type: 'community_announcement' | 'community_event', vars: Record<string, string>): Promise<void>;
```

- [ ] **Step 1: Write failing test** — `backend/tests/integration/community-moderation.test.ts` (same header as Task 5 Step 2):

```ts
describe('community moderation', () => {
  it('report: 201 first time, 200 duplicate, 404 unknown target', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    const b = await makeUser('athlete');
    const p = await insertPost(b.id);
    const auth = { Authorization: `Bearer ${a.token}` };
    const body = { target_type: 'post', target_id: p, reason: 'spam' };
    const r1 = await request(app).post('/api/community/reports').set(auth).send(body);
    expect(r1.status).toBe(201);
    const r2 = await request(app).post('/api/community/reports').set(auth).send(body);
    expect(r2.status).toBe(200);
    expect(r2.body.id).toBe(r1.body.id);
    const r3 = await request(app).post('/api/community/reports').set(auth)
      .send({ ...body, target_id: '00000000-0000-0000-0000-000000000000' });
    expect(r3.status).toBe(404);
  });

  it('admin lists open reports with embedded content and resolves by hiding (closes sibling reports)', async () => {
    await enableCommunity();
    const adm = await makeUser('admin');
    const a = await makeUser('athlete');
    const c = await makeUser('athlete');
    const b = await makeUser('athlete', 'Bad');
    const p = await insertPost(b.id, { body: 'ofensivo' });
    for (const u of [a, c]) {
      await request(app).post('/api/community/reports').set('Authorization', `Bearer ${u.token}`)
        .send({ target_type: 'post', target_id: p, reason: 'offensive' });
    }
    const list = await request(app).get('/api/admin/community/reports?status=open').set('Authorization', `Bearer ${adm.token}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);
    expect(list.body[0].content).toMatchObject({ body: 'ofensivo', author_id: b.id, hidden: false });
    expect(typeof list.body[0].age_hours).toBe('number');

    await request(app).post(`/api/admin/community/reports/${list.body[0].id}/resolve`)
      .set('Authorization', `Bearer ${adm.token}`).send({ action: 'hide' }).expect(204);
    const open = await pool.query(`SELECT count(*)::int AS n FROM community_reports WHERE status = 'open'`);
    expect(open.rows[0].n).toBe(0);
    const d = await request(app).get(`/api/community/posts/${p}`).set('Authorization', `Bearer ${a.token}`);
    expect(d.status).toBe(404);
  });

  it('resolve mute silences the author; dismiss only closes that report', async () => {
    await enableCommunity();
    const adm = await makeUser('admin');
    const a = await makeUser('athlete');
    const b = await makeUser('athlete');
    const p = await insertPost(b.id);
    const cm = await pool.query<{ id: string }>(
      `INSERT INTO community_comments (post_id, author_id, body) VALUES ($1, $2, 'mal') RETURNING id`, [p, b.id]);
    const rep = await request(app).post('/api/community/reports').set('Authorization', `Bearer ${a.token}`)
      .send({ target_type: 'comment', target_id: cm.rows[0].id, reason: 'offensive' });
    const bad = await request(app).post(`/api/admin/community/reports/${rep.body.id}/resolve`)
      .set('Authorization', `Bearer ${adm.token}`).send({ action: 'mute' });
    expect(bad.status).toBe(400); // mute_days required
    await request(app).post(`/api/admin/community/reports/${rep.body.id}/resolve`)
      .set('Authorization', `Bearer ${adm.token}`).send({ action: 'mute', mute_days: 3 }).expect(204);
    const post = await request(app).post('/api/community/posts').set('Authorization', `Bearer ${b.token}`).field('body', 'x');
    expect(post.body.error).toBe('muted');
    const st = await pool.query(`SELECT status FROM community_reports WHERE id = $1`, [rep.body.id]);
    expect(st.rows[0].status).toBe('actioned');

    await request(app).post(`/api/admin/community/users/${b.id}/mute`).set('Authorization', `Bearer ${adm.token}`)
      .send({ days: null }).expect(204);
    const post2 = await request(app).post('/api/community/posts').set('Authorization', `Bearer ${b.token}`).field('body', 'x');
    expect(post2.status).toBe(201);
  });

  it('admin hides/unhides a post and a comment; admin wall shows hidden with include_hidden=1', async () => {
    await enableCommunity();
    const adm = await makeUser('admin');
    const a = await makeUser('athlete');
    const p = await insertPost(a.id, { body: 'x' });
    const auth = { Authorization: `Bearer ${adm.token}` };
    await request(app).post(`/api/admin/community/posts/${p}/hide`).set(auth).expect(204);
    let w = await request(app).get('/api/admin/community/posts').set(auth);
    expect(w.body.items).toHaveLength(0);
    w = await request(app).get('/api/admin/community/posts?include_hidden=1').set(auth);
    expect(w.body.items[0]).toMatchObject({ id: p, hidden_at: expect.any(String) });
    await request(app).post(`/api/admin/community/posts/${p}/unhide`).set(auth).expect(204);
    const cm = await pool.query<{ id: string }>(
      `INSERT INTO community_comments (post_id, author_id, body) VALUES ($1, $2, 'c') RETURNING id`, [p, a.id]);
    await request(app).post(`/api/admin/community/comments/${cm.rows[0].id}/hide`).set(auth).expect(204);
    const list = await request(app).get(`/api/community/posts/${p}/comments`).set('Authorization', `Bearer ${a.token}`);
    expect(list.body.items).toHaveLength(0);
  });

  it('pin limit is 3', async () => {
    await enableCommunity();
    const adm = await makeUser('admin');
    const auth = { Authorization: `Bearer ${adm.token}` };
    const ids = [];
    for (let i = 0; i < 4; i++) ids.push(await insertPost(adm.id));
    for (let i = 0; i < 3; i++) {
      await request(app).patch(`/api/admin/community/posts/${ids[i]}/pin`).set(auth).send({ pinned: true }).expect(204);
    }
    const r = await request(app).patch(`/api/admin/community/posts/${ids[3]}/pin`).set(auth).send({ pinned: true });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('pin_limit');
    await request(app).patch(`/api/admin/community/posts/${ids[0]}/pin`).set(auth).send({ pinned: false }).expect(204);
    await request(app).patch(`/api/admin/community/posts/${ids[3]}/pin`).set(auth).send({ pinned: true }).expect(204);
  });

  it('admin creates an event (with pin) and lists rsvps', async () => {
    const adm = await makeUser('admin', 'Tato');
    const a = await makeUser('athlete');
    await enableCommunity();
    const auth = { Authorization: `Bearer ${adm.token}` };
    const r = await request(app).post('/api/admin/community/posts').set(auth)
      .field('kind', 'event').field('body', 'Asado').field('event_location', 'Club')
      .field('event_starts_at', '2026-10-01T20:00:00.000Z').field('pin', 'true');
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ kind: 'event', pinned: true, author: { is_coach: true },
      event: { location: 'Club', starts_at: '2026-10-01T20:00:00.000Z', rsvp_count: 0 } });
    await request(app).post(`/api/community/posts/${r.body.id}/rsvp`).set('Authorization', `Bearer ${a.token}`).expect(204);
    const rs = await request(app).get(`/api/admin/community/posts/${r.body.id}/rsvps`).set(auth);
    expect(rs.body.map((x: { id: string }) => x.id)).toEqual([a.id]);

    const noDate = await request(app).post('/api/admin/community/posts').set(auth).field('kind', 'event').field('body', 'x');
    expect(noDate.status).toBe(400);
  });

  it('admin endpoints reject athletes', async () => {
    const a = await makeUser('athlete');
    const r = await request(app).get('/api/admin/community/reports').set('Authorization', `Bearer ${a.token}`);
    expect(r.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement `backend/src/services/community-moderation.service.ts`**

```ts
import pool from '../db/connect.js';
import logger from '../utils/logger.js';
import { notifyUser } from './notification.service.js';
import {
  AUTHOR_NAME_SQL,
  CommunityError,
  FEED_PAGE_SIZE,
  MAX_PINNED,
  decodeCursor,
  encodeCursor,
  selectPosts,
  type PostDTO,
  type Viewer,
} from './community.service.js';

type TargetType = 'post' | 'comment';

async function targetExists(type: TargetType, id: string): Promise<boolean> {
  const table = type === 'post' ? 'community_posts' : 'community_comments';
  const r = await pool.query(`SELECT 1 FROM ${table} WHERE id = $1 AND deleted_at IS NULL`, [id]);
  return (r.rowCount ?? 0) > 0;
}

async function adminIds(): Promise<string[]> {
  const r = await pool.query<{ id: string }>(`SELECT id FROM users WHERE role IN ('admin', 'superadmin')`);
  return r.rows.map((row) => row.id);
}

function fireAndLog(p: Promise<void>, msg: string): void {
  void p.catch((e) => logger.error({ err: e }, msg));
}

export async function createReport(
  reporterId: string,
  input: { target_type: TargetType; target_id: string; reason: 'offensive' | 'spam' | 'inappropriate' | 'other'; note?: string },
): Promise<{ created: boolean; id: string }> {
  if (!(await targetExists(input.target_type, input.target_id))) throw new CommunityError(404, 'target_not_found');
  const ins = await pool.query<{ id: string }>(
    `INSERT INTO community_reports (reporter_id, target_type, target_id, reason, note)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (reporter_id, target_type, target_id) DO NOTHING
     RETURNING id`,
    [reporterId, input.target_type, input.target_id, input.reason, input.note ?? null],
  );
  if (ins.rows[0]) {
    const id = ins.rows[0].id;
    for (const adminId of await adminIds()) {
      fireAndLog(notifyUser(adminId, 'community_report', { reportId: id, reason: input.reason }), 'report push failed');
    }
    return { created: true, id };
  }
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM community_reports WHERE reporter_id = $1 AND target_type = $2 AND target_id = $3`,
    [reporterId, input.target_type, input.target_id],
  );
  return { created: false, id: existing.rows[0].id };
}

/** ponytail: sequential per-user push; fine for ~100 athletes, batch if the roster grows to thousands. */
export async function notifyAllAthletes(
  type: 'community_announcement' | 'community_event',
  vars: Record<string, string>,
): Promise<void> {
  const r = await pool.query<{ id: string }>(`SELECT id FROM users WHERE role = 'athlete' AND status = 'approved'`);
  for (const { id } of r.rows) fireAndLog(notifyUser(id, type, vars), 'community broadcast push failed');
}

export async function listAdminPosts(
  viewer: Viewer,
  opts: { cursor?: string; includeHidden: boolean },
): Promise<{ items: PostDTO[]; next_cursor: string | null }> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length + 1}`; // $1 is the viewer inside selectPosts
  };
  if (!opts.includeHidden) where.push('p.hidden_at IS NULL');
  if (opts.cursor) {
    const c = decodeCursor(opts.cursor);
    if (!c) throw new CommunityError(400, 'invalid_cursor');
    where.push(`(p.created_at, p.id) < (${add(c.ts)}::timestamptz, ${add(c.id)}::uuid)`);
  }
  const rows = await selectPosts(viewer, {
    where,
    params,
    orderBy: 'p.created_at DESC, p.id DESC',
    limit: FEED_PAGE_SIZE,
    admin: true,
  });
  const last = rows[rows.length - 1];
  return {
    items: rows.map(({ cursor_ts: _c, ...rest }) => rest),
    next_cursor: rows.length === FEED_PAGE_SIZE && last ? encodeCursor(last.cursor_ts, last.id) : null,
  };
}

export async function setPinned(postId: string, pinned: boolean): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize pin changes so two concurrent pins can't both pass the limit check.
    await client.query(`LOCK TABLE community_posts IN SHARE ROW EXCLUSIVE MODE`);
    const cur = await client.query<{ pinned: boolean }>(
      `SELECT pinned_at IS NOT NULL AS pinned FROM community_posts WHERE id = $1 AND deleted_at IS NULL`,
      [postId],
    );
    if (!cur.rows[0]) throw new CommunityError(404, 'post_not_found');
    if (pinned && !cur.rows[0].pinned) {
      const n = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM community_posts
          WHERE pinned_at IS NOT NULL AND deleted_at IS NULL AND hidden_at IS NULL`,
      );
      if (n.rows[0].n >= MAX_PINNED) throw new CommunityError(409, 'pin_limit');
      await client.query(`UPDATE community_posts SET pinned_at = now() WHERE id = $1`, [postId]);
    } else if (!pinned) {
      await client.query(`UPDATE community_posts SET pinned_at = NULL WHERE id = $1`, [postId]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function setPostHidden(postId: string, hidden: boolean, adminId: string): Promise<void> {
  const r = await pool.query(
    hidden
      ? `UPDATE community_posts SET hidden_at = now(), hidden_by = $2 WHERE id = $1 AND deleted_at IS NULL`
      : `UPDATE community_posts SET hidden_at = NULL, hidden_by = NULL WHERE id = $1 AND deleted_at IS NULL AND $2::uuid IS NOT NULL`,
    [postId, adminId],
  );
  if (!r.rowCount) throw new CommunityError(404, 'post_not_found');
}

export async function hideComment(commentId: string): Promise<void> {
  const r = await pool.query(`UPDATE community_comments SET hidden_at = now() WHERE id = $1 AND deleted_at IS NULL`, [
    commentId,
  ]);
  if (!r.rowCount) throw new CommunityError(404, 'comment_not_found');
}

export async function listRsvps(
  postId: string,
): Promise<Array<{ id: string; name: string; avatar_url: string | null; created_at: string }>> {
  const r = await pool.query<{ id: string; name: string; avatar_url: string | null; created_at: Date }>(
    `SELECT u.id, ${AUTHOR_NAME_SQL('u', 'ap', 'cp')} AS name, ap.avatar_url, r.created_at
       FROM community_event_rsvps r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN athlete_profiles ap ON ap.user_id = u.id
       LEFT JOIN coach_profiles cp ON cp.user_id = u.id
      WHERE r.post_id = $1
      ORDER BY r.created_at`,
    [postId],
  );
  return r.rows.map((row) => ({ ...row, created_at: new Date(row.created_at).toISOString() }));
}

export interface ReportDTO {
  id: string;
  target_type: TargetType;
  target_id: string;
  reason: string;
  note: string | null;
  status: 'open' | 'actioned' | 'dismissed';
  created_at: string;
  age_hours: number;
  reporter: { id: string; name: string };
  content: {
    body: string;
    author_id: string;
    author_name: string;
    hidden: boolean;
    media: Array<{ thumb_url: string }>;
    post_id: string;
  } | null;
}

export async function listReports(status: 'open' | 'actioned' | 'dismissed'): Promise<ReportDTO[]> {
  const r = await pool.query<{
    id: string; target_type: TargetType; target_id: string; reason: string; note: string | null;
    status: ReportDTO['status']; created_at: Date; age_hours: string;
    reporter_id: string; reporter_name: string;
    body: string | null; author_id: string | null; author_name: string | null; hidden: boolean | null;
    media: Array<{ thumb_url: string }> | null; post_id: string | null;
  }>(
    `SELECT r.id, r.target_type, r.target_id, r.reason, r.note, r.status, r.created_at,
            EXTRACT(EPOCH FROM (now() - r.created_at)) / 3600 AS age_hours,
            r.reporter_id, ${AUTHOR_NAME_SQL('ru', 'rap', 'rcp')} AS reporter_name,
            COALESCE(p.body, c.body) AS body,
            COALESCE(p.author_id, c.author_id) AS author_id,
            ${AUTHOR_NAME_SQL('au', 'aap', 'acp')} AS author_name,
            COALESCE(p.hidden_at, c.hidden_at) IS NOT NULL AS hidden,
            CASE WHEN p.id IS NOT NULL THEN
              COALESCE((SELECT json_agg(json_build_object('thumb_url', m.thumb_url) ORDER BY m.position)
                          FROM community_post_media m WHERE m.post_id = p.id), '[]'::json)
            END AS media,
            COALESCE(p.id, c.post_id) AS post_id
       FROM community_reports r
       JOIN users ru ON ru.id = r.reporter_id
       LEFT JOIN athlete_profiles rap ON rap.user_id = ru.id
       LEFT JOIN coach_profiles rcp ON rcp.user_id = ru.id
       LEFT JOIN community_posts p ON r.target_type = 'post' AND p.id = r.target_id
       LEFT JOIN community_comments c ON r.target_type = 'comment' AND c.id = r.target_id
       LEFT JOIN users au ON au.id = COALESCE(p.author_id, c.author_id)
       LEFT JOIN athlete_profiles aap ON aap.user_id = au.id
       LEFT JOIN coach_profiles acp ON acp.user_id = au.id
      WHERE r.status = $1
      ORDER BY r.created_at ASC`,
    [status],
  );
  return r.rows.map((row) => ({
    id: row.id,
    target_type: row.target_type,
    target_id: row.target_id,
    reason: row.reason,
    note: row.note,
    status: row.status,
    created_at: new Date(row.created_at).toISOString(),
    age_hours: Math.round(Number(row.age_hours) * 10) / 10,
    reporter: { id: row.reporter_id, name: row.reporter_name },
    content:
      row.author_id === null
        ? null
        : {
            body: row.body ?? '',
            author_id: row.author_id,
            author_name: row.author_name ?? 'Usuario',
            hidden: row.hidden ?? false,
            media: row.media ?? [],
            post_id: row.post_id!,
          },
  }));
}

export async function muteUser(userId: string, days: number | null): Promise<void> {
  const r = await pool.query(
    `UPDATE users SET community_muted_until = CASE WHEN $2::int IS NULL THEN NULL
                                                   ELSE now() + make_interval(days => $2::int) END
      WHERE id = $1`,
    [userId, days],
  );
  if (!r.rowCount) throw new CommunityError(404, 'user_not_found');
}

export async function resolveReport(
  reportId: string,
  adminId: string,
  input: { action: 'hide' | 'dismiss' | 'mute'; mute_days?: number },
): Promise<void> {
  const r = await pool.query<{ target_type: TargetType; target_id: string; status: string }>(
    `SELECT target_type, target_id, status FROM community_reports WHERE id = $1`,
    [reportId],
  );
  const rep = r.rows[0];
  if (!rep) throw new CommunityError(404, 'report_not_found');

  if (input.action === 'dismiss') {
    await pool.query(
      `UPDATE community_reports SET status = 'dismissed', resolved_by = $2, resolved_at = now() WHERE id = $1`,
      [reportId, adminId],
    );
    return;
  }

  if (input.action === 'hide') {
    if (rep.target_type === 'post') await setPostHidden(rep.target_id, true, adminId).catch(() => undefined);
    else await hideComment(rep.target_id).catch(() => undefined);
  } else {
    if (!input.mute_days) throw new CommunityError(400, 'mute_days_required');
    const table = rep.target_type === 'post' ? 'community_posts' : 'community_comments';
    const a = await pool.query<{ author_id: string }>(`SELECT author_id FROM ${table} WHERE id = $1`, [rep.target_id]);
    if (!a.rows[0]) throw new CommunityError(404, 'target_not_found');
    await muteUser(a.rows[0].author_id, input.mute_days);
  }

  // This report plus every other open report on the same content.
  await pool.query(
    `UPDATE community_reports
        SET status = 'actioned', resolved_by = $3, resolved_at = now()
      WHERE (id = $4 OR status = 'open') AND target_type = $1 AND target_id = $2`,
    [rep.target_type, rep.target_id, adminId, reportId],
  );
}

export async function openReportCount(): Promise<number> {
  const r = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM community_reports WHERE status = 'open'`);
  return r.rows[0].n;
}
```

(The `setPostHidden` unhide branch includes `$2::uuid IS NOT NULL` only so both branches take the same 2 params; simplify if you prefer two separate queries.)

- [ ] **Step 4: Implement `backend/src/routes/admin-community.ts`**

```ts
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/role.js';
import { handle, runUpload, parseMediaFromRequest, sendCommunityError } from './community.js';
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
import logger from '../utils/logger.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const uuid = z.string().uuid();
const viewerOf = (req: { user?: { id: string; role: Viewer['role'] } }): Viewer => ({
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
  .refine((d) => d.kind !== 'event' || !!d.event_starts_at, { message: 'event_starts_at required' });

router.post('/posts', async (req, res) => {
  if (!(await runUpload(req, res))) return;
  try {
    const parsed = adminPostFields.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
    const media = parseMediaFromRequest(req);
    const post = await createPost(viewerOf(req), { ...parsed.data, media });
    const preview = post.body.slice(0, 120);
    void notifyAllAthletes(post.kind === 'event' ? 'community_event' : 'community_announcement', {
      postId: post.id,
      preview,
    }).catch((e) => logger.error({ err: e }, 'community broadcast failed'));
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
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    res.json(await listAdminPosts(viewerOf(req), { cursor, includeHidden: req.query.include_hidden === '1' }));
  }),
);

router.patch(
  '/posts/:id/pin',
  handle(async (req, res) => {
    const parsed = z.object({ pinned: z.boolean() }).safeParse(req.body);
    if (!uuid.safeParse(req.params.id).success || !parsed.success) return res.status(400).json({ error: 'invalid_payload' });
    await setPinned(req.params.id, parsed.data.pinned);
    res.status(204).end();
  }),
);

for (const [path, hidden] of [['hide', true], ['unhide', false]] as const) {
  router.post(
    `/posts/:id/${path}`,
    handle(async (req, res) => {
      if (!uuid.safeParse(req.params.id).success) return res.status(404).json({ error: 'post_not_found' });
      await setPostHidden(req.params.id, hidden, req.user!.id);
      res.status(204).end();
    }),
  );
}

router.post(
  '/comments/:id/hide',
  handle(async (req, res) => {
    if (!uuid.safeParse(req.params.id).success) return res.status(404).json({ error: 'comment_not_found' });
    await hideComment(req.params.id);
    res.status(204).end();
  }),
);

router.get(
  '/posts/:id/rsvps',
  handle(async (req, res) => {
    if (!uuid.safeParse(req.params.id).success) return res.status(404).json({ error: 'post_not_found' });
    res.json(await listRsvps(req.params.id));
  }),
);

router.get(
  '/reports',
  handle(async (req, res) => {
    const status = z.enum(['open', 'actioned', 'dismissed']).catch('open').parse(req.query.status);
    res.json(await listReports(status));
  }),
);

router.get(
  '/reports/count',
  handle(async (_req, res) => {
    res.json({ open: await openReportCount() });
  }),
);

router.post(
  '/reports/:id/resolve',
  handle(async (req, res) => {
    const parsed = z
      .object({ action: z.enum(['hide', 'dismiss', 'mute']), mute_days: z.number().int().min(1).max(365).optional() })
      .refine((d) => d.action !== 'mute' || d.mute_days !== undefined)
      .safeParse(req.body);
    if (!uuid.safeParse(req.params.id).success || !parsed.success) return res.status(400).json({ error: 'invalid_payload' });
    await resolveReport(req.params.id, req.user!.id, parsed.data);
    res.status(204).end();
  }),
);

router.post(
  '/users/:id/mute',
  handle(async (req, res) => {
    const parsed = z.object({ days: z.number().int().min(1).max(365).nullable() }).safeParse(req.body);
    if (!uuid.safeParse(req.params.id).success || !parsed.success) return res.status(400).json({ error: 'invalid_payload' });
    await muteUser(req.params.id, parsed.data.days);
    res.status(204).end();
  }),
);

export default router;
```

`GET /reports/count` is an addition (not in spec) used by the panel sidebar badge in Part C — keep it.

- [ ] **Step 5: Run all community tests**

Run: `cd backend && TEST_DATABASE_URL="$TEST_DATABASE_URL" npm test -- tests/integration/community tests/integration/migration-063.test.ts tests/unit/community-media.service.test.ts tests/unit/notification-templates.test.ts`
Expected: PASS.

---

### Task 7: Full regression

- [ ] **Step 1:** `cd backend && npx tsc --noEmit` → 0 errors.
- [ ] **Step 2:** `cd backend && TEST_DATABASE_URL="$TEST_DATABASE_URL" npm test 2>&1 | tail -40` → all suites pass. If a pre-existing suite fails, check whether it also fails on `git stash` (baseline) before touching it; report pre-existing failures instead of "fixing" unrelated code.
- [ ] **Step 3:** `cd backend && npx prettier --check "src/**/*.ts"` — run `npx prettier --write` on the files you created/modified only.
- [ ] **Step 4:** Write a summary: files created/modified, test results, any deviations from this plan and why.
