# Comunidad — Part B: ads + platform fee integration Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.
> **auto-build host:** Claude plans+reviews; Grok implements via headless CLI.
> <!-- auto-build plan · 2026-09-18 · source: claude+writing-plans · part B of 3 -->

**Goal:** Ads in the community wall (CRUD, feed interleaving, view/click events, metrics) and the commercial side of the module: community fee + 15% ad share in the monthly platform-fee snapshot, automatic 6-month revision, quarterly USD adjustment of community amounts, and the `/admin/community/summary` endpoint.

**Architecture:** New `services/community-ads.service.ts` (no import from `community.service.ts`, to avoid a cycle — `community.service.ts` imports it). Pure functions added to `services/platform-fee.math.ts`. `platform-fee.service.ts` snapshot/summary/config/adjustment extended. Revision runs inside `runPlatformFeeTick` (`workers/platform-fee-cron.ts`). Push + email to admins on revision.

**Tech Stack:** Node 20, Express 4, TypeScript ESM (`.js` suffix imports), pg, zod, multer, Jest + supertest.

**Spec:** `docs/superpowers/specs/2026-09-18-comunidad-design.md` — sections "Contexto comercial", "Reglas del modelo", `/community` `POST /ads/:id/events`, `/admin/community` ads + summary rows, "Integración con platform fee".

**Depends on Part A (already implemented in this branch):** migrations 063/064 exist; `community.service.ts` has `getFeed`, `encodeCursor`, `decodeCursor`, `PostDTO`, `CommunityError`; `routes/community.ts` exports `handle`, `sendCommunityError`, `requireCommunityEnabled`; `routes/admin-community.ts` exists; `rate-limit.ts` exports `userKeyedLimiter`; `community-media.service.ts` exports `ALLOWED_IMAGE_MIME`, `MAX_IMAGE_BYTES`; `storage.service.ts` exports `uploadBufferToStorage`, `deleteFromStorage`. Read these files before starting.

## Global Constraints

- Do not open PRs, push, or commit. Skip every "commit" step.
- Minimal diffs; don't refactor unrelated code. Keep all existing platform-fee tests green.
- Ad amount (`monthly_fee_ars`) is never editable. No PATCH endpoint for ads.
- **Ad revenue of a month** = sum of `monthly_fee_ars` of ads whose effective range overlaps the month. Effective range = `[starts_on, LEAST(ends_on, archived_on)]` where `archived_on` = `archived_at` as a Buenos Aires date (NULL → `ends_on`). No proration: one day in the month = full month. So an archived ad keeps counting in the months it was live and stops counting afterwards.
- Module off (`community_launched_on IS NULL`) ⇒ no community fee, no ad revenue, no ad share in snapshots/summary.
- Launch month counts as a full month of Comunidad.
- Revision date = `community_launched_on + 6 months` (computed, never stored).
- Revision average = sum of `ad_revenue_ars` of the **first 6** `platform_fee_history` rows with `period >= first day of launch month`, divided by **6** (missing months count as 0).
- Revision: average `<` threshold ⇒ `community_fee_ars = community_fallback_fee_ars`; `>=` ⇒ unchanged. Either way set `community_revision_applied_at = now()` once, and push + email admins/superadmins. Mail failure is logged, never rolls back the change.
- Quarterly USD adjustment scales `community_fee_ars`, `community_fallback_fee_ars`, `community_revision_threshold_ars` by the same factor as `base_fee_ars`.
- Community fee and ad share are NOT affected by the `testflight` phase (only base fee is halved).
- Dates in `America/Argentina/Buenos_Aires` for "today" and ad-event `day`.
- Ad events rate limit: 300/hour per user. Ad images: JPEG/PNG/WebP, ≤2 MB, stored at `community-ads/{adId}.jpg`.
- Feed: one active ad after every 8 posts (counted across pages, pinned excluded), rotation `ads[(k - 1) % ads.length]` for the k-th slot overall.

## Test environment (IMPORTANT)

```bash
cd backend
export TEST_DATABASE_URL="$TEST_DATABASE_URL"
npm test -- <paths>
```

New migration → apply once: `cd backend && DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate`.
**NEVER run migrate/scripts without an explicit `DATABASE_URL=...localhost:5434...` prefix — `backend/.env` points to PRODUCTION.**
Community integration tests must mock firebase exactly like `backend/tests/integration/community-posts.test.ts` (copy its header).

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `backend/src/db/migrations/065_community_revision_notification.sql` | Create | Allow `community_revision` push type |
| `backend/src/domain/types.ts`, `services/notification-templates.ts`, `services/notification.service.ts` | Modify | `community_revision` type/template/dedup |
| `backend/tests/integration/helpers/test-db.ts` | Modify | Trigger migrate if 065 missing |
| `backend/src/services/platform-fee.math.ts` | Modify | `communityRevisionDate`, `evaluateCommunityRevision`, `interleaveAds`, `computeFee` community fields |
| `backend/src/services/community-ads.service.ts` | Create | Ads CRUD, events, metrics, revenue, active ads |
| `backend/src/services/community.service.ts` | Modify | Cursor carries offset; `getFeed` interleaves ads |
| `backend/src/routes/community.ts` | Modify | `POST /ads/:id/events` |
| `backend/src/routes/admin-community.ts` | Modify | Ads admin routes + `/summary` |
| `backend/src/services/platform-fee.service.ts` | Modify | Config fields, snapshot, summary, adjustment, revision |
| `backend/src/routes/platform-fee.ts` | Modify | Config zod accepts community fields |
| `backend/src/workers/platform-fee-cron.ts` | Modify | Call revision after snapshot |
| `backend/src/services/email-templates.ts`, `services/email.service.ts` | Modify | Revision email |
| `backend/tests/unit/platform-fee-community.math.test.ts` | Create | Pure function tests |
| `backend/tests/integration/community-ads.test.ts` | Create | Ads service + HTTP + feed interleave |
| `backend/tests/integration/platform-fee-community.test.ts` | Create | Snapshot, revision, adjustment, summary, config |

---

### Task 1: Pure math

**Files:**
- Modify: `backend/src/services/platform-fee.math.ts`
- Test: `backend/tests/unit/platform-fee-community.math.test.ts`

**Interfaces — Produces:**

```ts
export function communityRevisionDate(launchedOn: string): string; // YYYY-MM-DD, +6 months
export interface RevisionInput { monthlyAdRevenues: number[]; threshold: number; fee: number; fallbackFee: number }
export interface RevisionResult { average: number; newFee: number; downgraded: boolean }
export function evaluateCommunityRevision(i: RevisionInput): RevisionResult;
export function interleaveAds<P, A>(posts: P[], ads: A[], pageOffset: number, every?: number): Array<P | A>;
// computeFee: FeeInputs gains optional communityFeeArs?, adRevenueArs?, adSharePct?;
// FeeBreakdown gains communityFeeArs, adRevenueArs, adShareArs (all 0 when not given); totalArs includes communityFeeArs + adShareArs.
```

- [ ] **Step 1: Write the failing test** — `backend/tests/unit/platform-fee-community.math.test.ts`

```ts
import {
  communityRevisionDate,
  evaluateCommunityRevision,
  interleaveAds,
  computeFee,
} from '../../src/services/platform-fee.math.js';

describe('communityRevisionDate', () => {
  it('adds 6 months', () => {
    expect(communityRevisionDate('2026-10-01')).toBe('2027-04-01');
    expect(communityRevisionDate('2026-10-15')).toBe('2027-04-15');
  });
});

describe('evaluateCommunityRevision', () => {
  const base = { threshold: 50000, fee: 30000, fallbackFee: 40000 };
  it('average exactly at threshold keeps the fee', () => {
    const r = evaluateCommunityRevision({ ...base, monthlyAdRevenues: [50000, 50000, 50000, 50000, 50000, 50000] });
    expect(r).toEqual({ average: 50000, newFee: 30000, downgraded: false });
  });
  it('zero ads downgrades to fallback', () => {
    const r = evaluateCommunityRevision({ ...base, monthlyAdRevenues: [] });
    expect(r).toEqual({ average: 0, newFee: 40000, downgraded: true });
  });
  it('one high month compensates', () => {
    const r = evaluateCommunityRevision({ ...base, monthlyAdRevenues: [300000, 0, 0, 0, 0, 0] });
    expect(r.average).toBe(50000);
    expect(r.downgraded).toBe(false);
  });
  it('divides by 6 even with fewer rows and ignores rows beyond 6', () => {
    expect(evaluateCommunityRevision({ ...base, monthlyAdRevenues: [60000] }).average).toBe(10000);
    expect(evaluateCommunityRevision({ ...base, monthlyAdRevenues: [0, 0, 0, 0, 0, 0, 999999] }).average).toBe(0);
  });
});

describe('interleaveAds', () => {
  const posts = (from: number, n: number) => Array.from({ length: n }, (_, i) => `p${from + i}`);
  it('inserts an ad after every 8 posts', () => {
    const out = interleaveAds(posts(1, 20), ['A', 'B'], 0);
    expect(out.indexOf('A')).toBe(8);
    expect(out.indexOf('B')).toBe(17);
    expect(out).toHaveLength(22);
  });
  it('continues the count and rotation across pages', () => {
    // page 2 starts after 20 posts: next slot is after global post 24 -> 3rd slot -> ads[2 % 2] = 'A'
    const out = interleaveAds(posts(21, 20), ['A', 'B'], 20);
    expect(out[4]).toBe('A');
    expect(out[13]).toBe('B');
  });
  it('no ads -> posts unchanged', () => {
    expect(interleaveAds(posts(1, 9), [], 0)).toEqual(posts(1, 9));
  });
});

describe('computeFee with community', () => {
  it('adds community fee and ad share to the total', () => {
    const f = computeFee({
      baseFeeArs: 100000, activeAthletes: 0, grossRevenueArs: 0, revenueSharePct: 4,
      communityFeeArs: 30000, adRevenueArs: 100000, adSharePct: 15,
    });
    expect(f).toMatchObject({ communityFeeArs: 30000, adRevenueArs: 100000, adShareArs: 15000, totalArs: 145000 });
  });
  it('testflight halves only the base', () => {
    const f = computeFee({
      baseFeeArs: 100000, activeAthletes: 0, grossRevenueArs: 0, revenueSharePct: 4, testflight: true,
      communityFeeArs: 30000, adRevenueArs: 0, adSharePct: 15,
    });
    expect(f.totalArs).toBe(80000);
  });
  it('defaults community fields to 0', () => {
    const f = computeFee({ baseFeeArs: 100, activeAthletes: 0, grossRevenueArs: 0, revenueSharePct: 4 });
    expect(f).toMatchObject({ communityFeeArs: 0, adRevenueArs: 0, adShareArs: 0, totalArs: 100 });
  });
});
```

- [ ] **Step 2: Run** `cd backend && npm test -- tests/unit/platform-fee-community.math.test.ts` → FAIL.

- [ ] **Step 3: Implement** in `platform-fee.math.ts`:

Extend interfaces and `computeFee`:

```ts
export interface FeeInputs {
  baseFeeArs: number;
  activeAthletes: number;
  grossRevenueArs: number;
  revenueSharePct: number;
  testflight?: boolean;
  communityFeeArs?: number;
  adRevenueArs?: number;
  adSharePct?: number;
}

export interface FeeBreakdown {
  baseFeeArs: number;
  activeAthletes: number;
  grossRevenueArs: number;
  revenueSharePct: number;
  revenueShareArs: number;
  communityFeeArs: number;
  adRevenueArs: number;
  adShareArs: number;
  totalArs: number;
}

export function computeFee(i: FeeInputs): FeeBreakdown {
  const testflight = i.testflight ?? false;
  const baseFeeArs = round2(testflight ? i.baseFeeArs * 0.5 : i.baseFeeArs);
  const grossRevenueArs = round2(i.grossRevenueArs);
  const revenueShareArs = testflight ? 0 : round2((grossRevenueArs * i.revenueSharePct) / 100);
  const communityFeeArs = round2(i.communityFeeArs ?? 0);
  const adRevenueArs = round2(i.adRevenueArs ?? 0);
  const adShareArs = round2((adRevenueArs * (i.adSharePct ?? 0)) / 100);
  const totalArs = round2(baseFeeArs + revenueShareArs + communityFeeArs + adShareArs);
  return {
    baseFeeArs,
    activeAthletes: i.activeAthletes,
    grossRevenueArs,
    revenueSharePct: i.revenueSharePct,
    revenueShareArs,
    communityFeeArs,
    adRevenueArs,
    adShareArs,
    totalArs,
  };
}
```

Append:

```ts
export function communityRevisionDate(launchedOn: string): string {
  return addMonthsISO(launchedOn.slice(0, 10), 6);
}

export interface RevisionInput {
  monthlyAdRevenues: number[];
  threshold: number;
  fee: number;
  fallbackFee: number;
}

export interface RevisionResult {
  average: number;
  newFee: number;
  downgraded: boolean;
}

/** Average of the first 6 months since launch (missing months = 0), always divided by 6. */
export function evaluateCommunityRevision(i: RevisionInput): RevisionResult {
  const sum = i.monthlyAdRevenues.slice(0, 6).reduce((a, b) => a + b, 0);
  const average = round2(sum / 6);
  const downgraded = average < i.threshold;
  return { average, newFee: downgraded ? i.fallbackFee : i.fee, downgraded };
}

/**
 * Insert one ad after every `every` posts. `pageOffset` = posts already served on
 * previous pages, so slots and rotation continue across pages.
 */
export function interleaveAds<P, A>(posts: P[], ads: A[], pageOffset: number, every = 8): Array<P | A> {
  if (ads.length === 0) return [...posts];
  const out: Array<P | A> = [];
  posts.forEach((p, i) => {
    out.push(p);
    const n = pageOffset + i + 1;
    if (n % every === 0) out.push(ads[(n / every - 1) % ads.length]);
  });
  return out;
}
```

`addMonthsISO` already exists in the file — check it handles day overflow (e.g. `2026-08-31` + 6 → JS Date rolls to `2027-03-03`). That's acceptable; do not change it.

- [ ] **Step 4: Run** → PASS. Also `npm test -- tests/integration/platform-fee-service.test.ts` (with TEST_DATABASE_URL) → still PASS (new breakdown fields are additive).

---

### Task 2: Migration 065 + `community_revision` notification

**Files:**
- Create: `backend/src/db/migrations/065_community_revision_notification.sql`
- Modify: `backend/src/domain/types.ts`, `backend/src/services/notification-templates.ts`, `backend/src/services/notification.service.ts`, `backend/tests/integration/helpers/test-db.ts`
- Test: extend `backend/tests/unit/notification-templates.test.ts`

- [ ] **Step 1: Failing test** — append to `backend/tests/unit/notification-templates.test.ts`:

```ts
describe('community_revision template', () => {
  it('reports the result', () => {
    const t = TEMPLATES.community_revision({ average: '42000', newFee: '40000', downgraded: 'true' });
    expect(t.title).toBe('Revisión de Comunidad aplicada');
    expect(t.body).toContain('40000');
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

`065_community_revision_notification.sql`:

```sql
ALTER TABLE notification_log DROP CONSTRAINT IF EXISTS notification_log_type_check;
ALTER TABLE notification_log ADD CONSTRAINT notification_log_type_check
  CHECK (type IN (
    'session_reminder','session_missed','week_start',
    'skeleton_approved','sos_resolved','rm_test_week',
    'membership_expiring','membership_expired',
    'community_announcement','community_event','community_comment','community_report',
    'community_revision'
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
  "community_report": true,
  "community_revision": true
}'::jsonb;

UPDATE users SET notification_prefs = notification_prefs || '{"community_revision": true}'::jsonb
  WHERE NOT (notification_prefs ? 'community_revision');
```

`types.ts`: add `| 'community_revision'` to `NotificationType`.
`notification.service.ts`: `community_revision: 0,` in `DEDUP_WINDOW_HOURS`.
`notification-templates.ts`:

```ts
  community_revision: ({ average, newFee, downgraded }) => ({
    title: 'Revisión de Comunidad aplicada',
    body:
      downgraded === 'true'
        ? `Promedio de publicidad $${average}: el fee de Comunidad pasa a $${newFee}.`
        : `Promedio de publicidad $${average}: el fee de Comunidad se mantiene en $${newFee}.`,
    route: '/(app)/community',
  }),
```

`test-db.ts` `ensureMigrated()`: add a check that triggers migrate when 065 is missing, e.g. add to the SELECT:

```sql
EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_log_type_check'
          AND pg_get_constraintdef(oid) LIKE '%community_revision%') AS m065
```

and `|| !r.rows[0].m065` to the condition.

- [ ] **Step 4:** Apply migration to test DB (command in Test environment), run unit test → PASS, `npx tsc --noEmit` → clean.

---

### Task 3: Ads service

**Files:**
- Create: `backend/src/services/community-ads.service.ts`
- Test: `backend/tests/integration/community-ads.test.ts` (service-level part)

**Interfaces — Produces:**

```ts
export class AdError extends Error { constructor(public status: number, public code: string) }
export interface AdDTO { type: 'ad'; id: string; brand_name: string; body: string; image_url: string; cta_label: string; cta_url: string }
export interface AdminAdDTO {
  id: string; brand_name: string; body: string; image_url: string; cta_label: string; cta_url: string;
  monthly_fee_ars: number; starts_on: string; ends_on: string; archived_at: string | null; created_at: string;
  status: 'active' | 'upcoming' | 'expired' | 'archived';
}
export interface CreateAdInput {
  brand_name: string; body: string; cta_label: string; cta_url: string;
  monthly_fee_ars: number; starts_on: string; ends_on: string;
  image: { buffer: Buffer; mimetype: string; size: number };
}
export function todayBA(): string; // YYYY-MM-DD in America/Argentina/Buenos_Aires
export async function createAd(input: CreateAdInput, createdBy: string): Promise<AdminAdDTO>;
export async function listAds(): Promise<AdminAdDTO[]>;
export async function archiveAd(id: string): Promise<void>;           // 404 ad_not_found
export async function activeAdsForFeed(): Promise<AdDTO[]>;
export async function recordAdEvent(adId: string, userId: string, kind: 'view' | 'click'): Promise<void>; // 404 ad_not_found
export async function adMetrics(adId: string, from?: string, to?: string): Promise<{
  views: number; clicks: number; reach: number; daily: Array<{ day: string; views: number; clicks: number }>;
}>;
export async function adRevenueForMonth(periodISO: string): Promise<number>; // periodISO = YYYY-MM-01
```

- [ ] **Step 1: Write failing tests** — `backend/tests/integration/community-ads.test.ts` (copy the firebase/push mock header + `beforeAll/beforeEach/afterAll` from `community-posts.test.ts`, then import the service **after** the mocks with `await import(...)`):

```ts
const ads = await import('../../src/services/community-ads.service.js');

async function insertAd(opts: { fee?: number; starts: string; ends: string; archivedAt?: string | null; brand?: string }): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO community_ads (brand_name, body, image_path, image_url, cta_label, cta_url,
                                monthly_fee_ars, starts_on, ends_on, archived_at)
     VALUES ($1, 'b', 'community-ads/x.jpg', 'https://img', 'Ver', 'https://brand.example', $2, $3, $4, $5)
     RETURNING id`,
    [opts.brand ?? 'Marca', opts.fee ?? 10000, opts.starts, opts.ends, opts.archivedAt ?? null],
  );
  return rows[0].id;
}

describe('adRevenueForMonth', () => {
  it('an ad covering a single day of the month counts in full', async () => {
    await insertAd({ fee: 20000, starts: '2026-10-31', ends: '2026-11-30' });
    expect(await ads.adRevenueForMonth('2026-10-01')).toBe(20000);
    expect(await ads.adRevenueForMonth('2026-11-01')).toBe(20000);
  });
  it('out of range does not count', async () => {
    await insertAd({ fee: 20000, starts: '2026-12-01', ends: '2026-12-31' });
    expect(await ads.adRevenueForMonth('2026-11-01')).toBe(0);
  });
  it('archived ad keeps counting in its live months, not after', async () => {
    await insertAd({ fee: 15000, starts: '2026-10-01', ends: '2027-03-31', archivedAt: '2026-11-10T15:00:00Z' });
    expect(await ads.adRevenueForMonth('2026-10-01')).toBe(15000);
    expect(await ads.adRevenueForMonth('2026-11-01')).toBe(15000);
    expect(await ads.adRevenueForMonth('2026-12-01')).toBe(0);
  });
  it('sums several ads', async () => {
    await insertAd({ fee: 10000, starts: '2026-10-01', ends: '2026-10-31' });
    await insertAd({ fee: 25000.5, starts: '2026-09-15', ends: '2026-10-02' });
    expect(await ads.adRevenueForMonth('2026-10-01')).toBe(35000.5);
  });
});

describe('ad events + metrics', () => {
  it('views are deduplicated per user and day', async () => {
    const u = await makeUser('athlete');
    const id = await insertAd({ starts: '2020-01-01', ends: '2099-12-31' });
    await ads.recordAdEvent(id, u.id, 'view');
    await ads.recordAdEvent(id, u.id, 'view');
    await ads.recordAdEvent(id, u.id, 'click');
    const m = await ads.adMetrics(id, '2020-01-01', '2099-12-31');
    expect(m).toMatchObject({ views: 1, clicks: 1, reach: 1 });
    expect(m.daily).toHaveLength(1);
    expect(m.daily[0]).toMatchObject({ views: 1, clicks: 1 });
  });
  it('reach counts distinct viewers', async () => {
    const a = await makeUser('athlete');
    const b = await makeUser('athlete');
    const id = await insertAd({ starts: '2020-01-01', ends: '2099-12-31' });
    await pool.query(
      `INSERT INTO community_ad_events (ad_id, user_id, day, kind) VALUES
         ($1, $2, '2026-09-01', 'view'), ($1, $2, '2026-09-02', 'view'), ($1, $3, '2026-09-02', 'view')`,
      [id, a.id, b.id],
    );
    const m = await ads.adMetrics(id, '2026-09-01', '2026-09-30');
    expect(m).toMatchObject({ views: 3, clicks: 0, reach: 2 });
    expect(m.daily.map((d) => d.day)).toEqual(['2026-09-01', '2026-09-02']);
  });
  it('unknown ad -> AdError 404', async () => {
    const u = await makeUser('athlete');
    await expect(ads.recordAdEvent('00000000-0000-0000-0000-000000000000', u.id, 'view')).rejects.toMatchObject({ status: 404 });
  });
});

describe('listAds / activeAdsForFeed / archiveAd', () => {
  it('classifies and filters', async () => {
    const active = await insertAd({ starts: '2020-01-01', ends: '2099-12-31', brand: 'Active' });
    await insertAd({ starts: '2098-01-01', ends: '2099-12-31', brand: 'Upcoming' });
    await insertAd({ starts: '2020-01-01', ends: '2020-12-31', brand: 'Expired' });
    const list = await ads.listAds();
    const byBrand = Object.fromEntries(list.map((a) => [a.brand_name, a.status]));
    expect(byBrand).toEqual({ Active: 'active', Upcoming: 'upcoming', Expired: 'expired' });
    expect((await ads.activeAdsForFeed()).map((a) => a.id)).toEqual([active]);
    await ads.archiveAd(active);
    expect(await ads.activeAdsForFeed()).toEqual([]);
    expect((await ads.listAds()).find((a) => a.id === active)?.status).toBe('archived');
  });
});

describe('createAd', () => {
  it('uploads the image and rolls back on invalid type', async () => {
    const adm = await makeUser('admin');
    const created = await ads.createAd(
      {
        brand_name: 'Proteína X', body: 'Promo', cta_label: 'Comprar', cta_url: 'https://x.example',
        monthly_fee_ars: 50000, starts_on: '2026-10-01', ends_on: '2026-12-31',
        image: { buffer: tinyJpeg, mimetype: 'image/jpeg', size: tinyJpeg.length },
      },
      adm.id,
    );
    expect(created).toMatchObject({ brand_name: 'Proteína X', monthly_fee_ars: 50000, starts_on: '2026-10-01' });
    expect(storageOps.saved).toEqual([`community-ads/${created.id}.jpg`]);
    await expect(
      ads.createAd(
        { brand_name: 'x', body: '', cta_label: 'x', cta_url: 'https://x.example', monthly_fee_ars: 1,
          starts_on: '2026-10-01', ends_on: '2026-10-01', image: { buffer: tinyJpeg, mimetype: 'image/gif', size: 10 } },
        adm.id,
      ),
    ).rejects.toMatchObject({ code: 'invalid_type' });
  });
});
```

- [ ] **Step 2: Run** → FAIL (module missing).

- [ ] **Step 3: Implement `backend/src/services/community-ads.service.ts`**

```ts
import { randomUUID } from 'node:crypto';
import pool from '../db/connect.js';
import { uploadBufferToStorage, deleteFromStorage } from './storage.service.js';
import { ALLOWED_IMAGE_MIME, MAX_IMAGE_BYTES } from './community-media.service.js';

const TZ = 'America/Argentina/Buenos_Aires';

export class AdError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

export interface AdDTO {
  type: 'ad';
  id: string;
  brand_name: string;
  body: string;
  image_url: string;
  cta_label: string;
  cta_url: string;
}

export interface AdminAdDTO {
  id: string;
  brand_name: string;
  body: string;
  image_url: string;
  cta_label: string;
  cta_url: string;
  monthly_fee_ars: number;
  starts_on: string;
  ends_on: string;
  archived_at: string | null;
  created_at: string;
  status: 'active' | 'upcoming' | 'expired' | 'archived';
}

export interface CreateAdInput {
  brand_name: string;
  body: string;
  cta_label: string;
  cta_url: string;
  monthly_fee_ars: number;
  starts_on: string;
  ends_on: string;
  image: { buffer: Buffer; mimetype: string; size: number };
}

export function todayBA(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

/** DATE columns come back as text via ::text to avoid JS timezone shifts. */
const ADMIN_SELECT = `
  SELECT id, brand_name, body, image_url, cta_label, cta_url, monthly_fee_ars,
         starts_on::text AS starts_on, ends_on::text AS ends_on, archived_at, created_at,
         CASE
           WHEN archived_at IS NOT NULL THEN 'archived'
           WHEN starts_on > (now() AT TIME ZONE '${TZ}')::date THEN 'upcoming'
           WHEN ends_on < (now() AT TIME ZONE '${TZ}')::date THEN 'expired'
           ELSE 'active'
         END AS status
    FROM community_ads`;

interface AdRow {
  id: string;
  brand_name: string;
  body: string;
  image_url: string;
  cta_label: string;
  cta_url: string;
  monthly_fee_ars: string;
  starts_on: string;
  ends_on: string;
  archived_at: Date | null;
  created_at: Date;
  status: AdminAdDTO['status'];
}

const toAdmin = (r: AdRow): AdminAdDTO => ({
  ...r,
  monthly_fee_ars: Number(r.monthly_fee_ars),
  archived_at: r.archived_at ? new Date(r.archived_at).toISOString() : null,
  created_at: new Date(r.created_at).toISOString(),
});

export async function createAd(input: CreateAdInput, createdBy: string): Promise<AdminAdDTO> {
  if (!ALLOWED_IMAGE_MIME.has(input.image.mimetype)) throw new AdError(400, 'invalid_type');
  if (input.image.size > MAX_IMAGE_BYTES) throw new AdError(400, 'image_too_large');
  if (input.ends_on < input.starts_on) throw new AdError(400, 'invalid_range');
  const id = randomUUID();
  const imagePath = `community-ads/${id}.jpg`;
  const imageUrl = await uploadBufferToStorage(imagePath, input.image.buffer, input.image.mimetype);
  try {
    await pool.query(
      `INSERT INTO community_ads (id, brand_name, body, image_path, image_url, cta_label, cta_url,
                                  monthly_fee_ars, starts_on, ends_on, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, input.brand_name, input.body, imagePath, imageUrl, input.cta_label, input.cta_url,
       input.monthly_fee_ars, input.starts_on, input.ends_on, createdBy],
    );
  } catch (e) {
    await deleteFromStorage(imagePath);
    throw e;
  }
  const r = await pool.query<AdRow>(`${ADMIN_SELECT} WHERE id = $1`, [id]);
  return toAdmin(r.rows[0]);
}

export async function listAds(): Promise<AdminAdDTO[]> {
  const r = await pool.query<AdRow>(`${ADMIN_SELECT} ORDER BY starts_on DESC, created_at DESC`);
  return r.rows.map(toAdmin);
}

export async function archiveAd(id: string): Promise<void> {
  const r = await pool.query(
    `UPDATE community_ads SET archived_at = COALESCE(archived_at, now()) WHERE id = $1`,
    [id],
  );
  if (!r.rowCount) throw new AdError(404, 'ad_not_found');
}

export async function activeAdsForFeed(): Promise<AdDTO[]> {
  const r = await pool.query<Omit<AdDTO, 'type'>>(
    `SELECT id, brand_name, body, image_url, cta_label, cta_url
       FROM community_ads
      WHERE archived_at IS NULL
        AND (now() AT TIME ZONE '${TZ}')::date BETWEEN starts_on AND ends_on
      ORDER BY created_at, id`,
  );
  return r.rows.map((row) => ({ type: 'ad' as const, ...row }));
}

export async function recordAdEvent(adId: string, userId: string, kind: 'view' | 'click'): Promise<void> {
  const exists = await pool.query(`SELECT 1 FROM community_ads WHERE id = $1`, [adId]);
  if (!exists.rowCount) throw new AdError(404, 'ad_not_found');
  await pool.query(
    `INSERT INTO community_ad_events (ad_id, user_id, day, kind)
     VALUES ($1, $2, (now() AT TIME ZONE '${TZ}')::date, $3)
     ON CONFLICT DO NOTHING`,
    [adId, userId, kind],
  );
}

export async function adMetrics(
  adId: string,
  from?: string,
  to?: string,
): Promise<{ views: number; clicks: number; reach: number; daily: Array<{ day: string; views: number; clicks: number }> }> {
  const ad = await pool.query<{ starts_on: string; ends_on: string }>(
    `SELECT starts_on::text AS starts_on, ends_on::text AS ends_on FROM community_ads WHERE id = $1`,
    [adId],
  );
  if (!ad.rows[0]) throw new AdError(404, 'ad_not_found');
  const f = from ?? ad.rows[0].starts_on;
  const t = to ?? ad.rows[0].ends_on;
  const daily = await pool.query<{ day: string; views: number; clicks: number }>(
    `SELECT day::text AS day,
            count(*) FILTER (WHERE kind = 'view')::int AS views,
            count(*) FILTER (WHERE kind = 'click')::int AS clicks
       FROM community_ad_events
      WHERE ad_id = $1 AND day BETWEEN $2::date AND $3::date
      GROUP BY day ORDER BY day`,
    [adId, f, t],
  );
  const reach = await pool.query<{ n: number }>(
    `SELECT count(DISTINCT user_id)::int AS n FROM community_ad_events
      WHERE ad_id = $1 AND kind = 'view' AND day BETWEEN $2::date AND $3::date`,
    [adId, f, t],
  );
  return {
    views: daily.rows.reduce((a, d) => a + d.views, 0),
    clicks: daily.rows.reduce((a, d) => a + d.clicks, 0),
    reach: reach.rows[0].n,
    daily: daily.rows,
  };
}

/**
 * Sum of monthly fees of ads whose effective range overlaps the month.
 * Effective end = LEAST(ends_on, archived date in BA). No proration.
 */
export async function adRevenueForMonth(periodISO: string): Promise<number> {
  const r = await pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(monthly_fee_ars), 0) AS total
       FROM community_ads
      WHERE starts_on <= (date_trunc('month', $1::date) + interval '1 month - 1 day')::date
        AND LEAST(ends_on, COALESCE((archived_at AT TIME ZONE '${TZ}')::date, ends_on))
            >= date_trunc('month', $1::date)::date`,
    [periodISO],
  );
  return Number(r.rows[0].total);
}
```

- [ ] **Step 4: Run** `npm test -- tests/integration/community-ads.test.ts` (with TEST_DATABASE_URL) → PASS for these describes.

---

### Task 4: Feed interleaving + ads HTTP

**Files:**
- Modify: `backend/src/services/community.service.ts` (`encodeCursor`, `decodeCursor`, `getFeed`)
- Modify: `backend/src/routes/community.ts`
- Modify: `backend/src/routes/admin-community.ts`
- Modify: `backend/src/middleware/rate-limit.ts`
- Test: add to `backend/tests/integration/community-ads.test.ts`

**Interfaces:**
- `encodeCursor(ts: string, id: string, offset = 0): string` → base64url of `ts|id|offset`.
- `decodeCursor(cursor): { ts: string; id: string; offset: number } | null` — offset defaults to 0 when absent, must be a non-negative integer otherwise → null.
- `getFeed` return type: `{ pinned: PostDTO[]; items: Array<PostDTO | AdDTO>; next_cursor: string | null }`; `next_cursor` encodes `offset = previousOffset + posts on this page` (ads not counted).
- `communityAdEventLimiter = userKeyedLimiter('community-ad-event', 60 * 60 * 1000, 300)`.
- `/community`: `POST /ads/:id/events` body `{ kind: 'view' | 'click' }` → 204; 404 `ad_not_found`.
- `/admin/community`: `GET /ads` → `AdminAdDTO[]`; `POST /ads` multipart (`image` single file + fields `brand_name`, `body`, `cta_label`, `cta_url`, `monthly_fee_ars`, `starts_on`, `ends_on`) → 201 `AdminAdDTO`; `POST /ads/:id/archive` → 204; `GET /ads/:id/metrics?from=&to=` → metrics.

- [ ] **Step 1: Failing tests** — append to `community-ads.test.ts`:

```ts
describe('feed interleaving over HTTP', () => {
  it('inserts an ad after every 8 posts and rotates across pages', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    await insertAd({ starts: '2020-01-01', ends: '2099-12-31', brand: 'A' });
    await insertAd({ starts: '2020-01-01', ends: '2099-12-31', brand: 'B' });
    for (let i = 0; i < 30; i++) {
      await insertPost(a.id, { body: `p${i}`, createdAt: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString() });
    }
    const auth = { Authorization: `Bearer ${a.token}` };
    const p1 = await request(app).get('/api/community/feed').set(auth);
    const types1 = p1.body.items.map((x: { type: string; brand_name?: string }) => x.type === 'ad' ? x.brand_name : 'post');
    expect(types1[8]).toBe('A');
    expect(types1[17]).toBe('B');
    expect(p1.body.items).toHaveLength(22);
    const p2 = await request(app).get(`/api/community/feed?cursor=${p1.body.next_cursor}`).set(auth);
    const types2 = p2.body.items.map((x: { type: string; brand_name?: string }) => x.type === 'ad' ? x.brand_name : 'post');
    // global post 24 is the 4th post of page 2 -> ad after index 3, slot 3 -> 'A'
    expect(types2[4]).toBe('A');
    expect(p2.body.items.filter((x: { type: string }) => x.type === 'post')).toHaveLength(10);
  });

  it('ad shape in feed', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    await insertAd({ starts: '2020-01-01', ends: '2099-12-31' });
    for (let i = 0; i < 8; i++) await insertPost(a.id);
    const r = await request(app).get('/api/community/feed').set('Authorization', `Bearer ${a.token}`);
    expect(Object.keys(r.body.items[8]).sort()).toEqual(['body', 'brand_name', 'cta_label', 'cta_url', 'id', 'image_url', 'type']);
  });
});

describe('ads HTTP', () => {
  it('records events via /community/ads/:id/events', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    const id = await insertAd({ starts: '2020-01-01', ends: '2099-12-31' });
    await request(app).post(`/api/community/ads/${id}/events`).set('Authorization', `Bearer ${a.token}`).send({ kind: 'view' }).expect(204);
    await request(app).post(`/api/community/ads/${id}/events`).set('Authorization', `Bearer ${a.token}`).send({ kind: 'view' }).expect(204);
    const bad = await request(app).post(`/api/community/ads/${id}/events`).set('Authorization', `Bearer ${a.token}`).send({ kind: 'x' });
    expect(bad.status).toBe(400);
    const n = await pool.query(`SELECT count(*)::int AS n FROM community_ad_events`);
    expect(n.rows[0].n).toBe(1);
  });

  it('admin creates, lists, archives and reads metrics', async () => {
    const adm = await makeUser('admin');
    const auth = { Authorization: `Bearer ${adm.token}` };
    const c = await request(app).post('/api/admin/community/ads').set(auth)
      .field('brand_name', 'Marca').field('body', 'Promo').field('cta_label', 'Ver')
      .field('cta_url', 'https://marca.example').field('monthly_fee_ars', '50000')
      .field('starts_on', '2026-10-01').field('ends_on', '2026-12-31')
      .attach('image', tinyJpeg, { filename: 'ad.jpg', contentType: 'image/jpeg' });
    expect(c.status).toBe(201);
    expect(c.body.monthly_fee_ars).toBe(50000);
    const list = await request(app).get('/api/admin/community/ads').set(auth);
    expect(list.body).toHaveLength(1);
    const m = await request(app).get(`/api/admin/community/ads/${c.body.id}/metrics`).set(auth);
    expect(m.body).toEqual({ views: 0, clicks: 0, reach: 0, daily: [] });
    await request(app).post(`/api/admin/community/ads/${c.body.id}/archive`).set(auth).expect(204);

    const noImg = await request(app).post('/api/admin/community/ads').set(auth)
      .field('brand_name', 'x').field('cta_label', 'x').field('cta_url', 'https://x.example')
      .field('monthly_fee_ars', '1').field('starts_on', '2026-10-01').field('ends_on', '2026-10-01');
    expect(noImg.status).toBe(400);
    const badRange = await request(app).post('/api/admin/community/ads').set(auth)
      .field('brand_name', 'x').field('cta_label', 'x').field('cta_url', 'https://x.example')
      .field('monthly_fee_ars', '1').field('starts_on', '2026-10-02').field('ends_on', '2026-10-01')
      .attach('image', tinyJpeg, { filename: 'ad.jpg', contentType: 'image/jpeg' });
    expect(badRange.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

`community.service.ts` — replace `encodeCursor`/`decodeCursor`:

```ts
export function encodeCursor(ts: string, id: string, offset = 0): string {
  return Buffer.from(`${ts}|${id}|${offset}`).toString('base64url');
}

export function decodeCursor(cursor: string): { ts: string; id: string; offset: number } | null {
  try {
    const [ts, id, rawOffset] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    if (!ts || !id || Number.isNaN(Date.parse(ts))) return null;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const offset = rawOffset === undefined ? 0 : Number(rawOffset);
    if (!Number.isInteger(offset) || offset < 0) return null;
    return { ts, id, offset };
  } catch {
    return null;
  }
}
```

In `getFeed`: import `{ activeAdsForFeed, type AdDTO }` from `./community-ads.service.js` and `{ interleaveAds }` from `./platform-fee.math.js`. Track `offset` (`c.offset` when a cursor is given, else 0). After fetching `rows`:

```ts
  const ads = await activeAdsForFeed();
  const posts = rows.map(strip);
  const last = rows[rows.length - 1];
  return {
    pinned,
    items: interleaveAds<PostDTO, AdDTO>(posts, ads, offset),
    next_cursor:
      rows.length === FEED_PAGE_SIZE && last ? encodeCursor(last.cursor_ts, last.id, offset + rows.length) : null,
  };
```

Update the return type to `items: Array<PostDTO | AdDTO>`. Other callers of `encodeCursor` (comments, admin posts) keep working with the default offset.

`rate-limit.ts`: add `export const communityAdEventLimiter = userKeyedLimiter('community-ad-event', 60 * 60 * 1000, 300);`

`sendCommunityError` in `routes/community.ts`: also map `AdError` (import from `../services/community-ads.service.js`) → `res.status(e.status).json({ error: e.code })`.

`routes/community.ts` — add before `export default`:

```ts
router.post(
  '/ads/:id/events',
  communityAdEventLimiter,
  handle(async (req, res) => {
    const parsed = z.object({ kind: z.enum(['view', 'click']) }).safeParse(req.body);
    if (!uuid.safeParse(req.params.id).success) return res.status(404).json({ error: 'ad_not_found' });
    if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
    await recordAdEvent(req.params.id, req.user!.id, parsed.data.kind);
    res.status(204).end();
  }),
);
```

`routes/admin-community.ts` — add:

```ts
import multer from 'multer';
import { MAX_IMAGE_BYTES } from '../services/community-media.service.js';
import { createAd, listAds, archiveAd, adMetrics } from '../services/community-ads.service.js';

const adUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES } }).single('image');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const adFields = z.object({
  brand_name: z.string().trim().min(1).max(120),
  body: z.string().max(280).default(''),
  cta_label: z.string().trim().min(1).max(40),
  cta_url: z.string().url().refine((u) => /^https?:\/\//.test(u)),
  monthly_fee_ars: z.coerce.number().nonnegative(),
  starts_on: isoDate,
  ends_on: isoDate,
});

router.get('/ads', handle(async (_req, res) => { res.json(await listAds()); }));

router.post('/ads', (req, res, next) => {
  adUpload(req, res, (err: unknown) => {
    if (err) return res.status(400).json({ error: 'upload_failed' });
    const parsed = adFields.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
    if (!req.file) return res.status(400).json({ error: 'no_file' });
    const file = req.file;
    createAd(
      { ...parsed.data, image: { buffer: file.buffer, mimetype: file.mimetype, size: file.size } },
      req.user!.id,
    )
      .then((ad) => res.status(201).json(ad))
      .catch((e) => { if (!sendCommunityError(res, e)) next(e); });
  });
});

router.post('/ads/:id/archive', handle(async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) return res.status(404).json({ error: 'ad_not_found' });
  await archiveAd(req.params.id);
  res.status(204).end();
}));

router.get('/ads/:id/metrics', handle(async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) return res.status(404).json({ error: 'ad_not_found' });
  const q = z.object({ from: isoDate.optional(), to: isoDate.optional() }).safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: 'invalid_payload' });
  res.json(await adMetrics(req.params.id, q.data.from, q.data.to));
}));
```

(`createAd` throws `AdError(400,'invalid_range')` when `ends_on < starts_on` — mapped by `sendCommunityError`.)

- [ ] **Step 4: Run** `npm test -- tests/integration/community-ads.test.ts tests/integration/community-feed.test.ts` → PASS (existing feed tests must still pass: no ads inserted there → items unchanged).

---

### Task 5: Platform fee — config, snapshot, summary, adjustment

**Files:**
- Modify: `backend/src/services/platform-fee.service.ts`
- Modify: `backend/src/routes/platform-fee.ts`
- Test: `backend/tests/integration/platform-fee-community.test.ts`

**Interfaces:**
- `PlatformFeeConfig` gains: `community_fee_ars: number; community_fallback_fee_ars: number; community_revision_threshold_ars: number; ad_share_pct: number; community_launched_on: string | null; community_revision_applied_at: string | null`.
- `UpdateConfigInput` gains the first five (not `community_revision_applied_at`); `community_launched_on` accepts `string | null`.
- `PlatformFeeSummary` gains: `community_fee_ars: number; ad_revenue_ars: number; ad_share_pct: number; ad_share_ars: number` (invoice month M: current community fee if launched on or before the last day of M; 15% of ad revenue of the closed month M-1, taken from `platform_fee_history` if frozen else `adRevenueForMonth`, 0 if the module was not launched by the end of M-1). `total_ars` includes both.
- `PlatformFeeHistoryRow` gains `community_fee_ars`, `ad_revenue_ars`, `ad_share_ars`.
- `export function communityActiveForPeriod(launchedOn: string | null, periodISO: string): boolean` — true when `launchedOn` ≤ last day of the period's month.

- [ ] **Step 1: Failing tests** — `backend/tests/integration/platform-fee-community.test.ts`. This file does not hit Storage, so no firebase mock is needed; follow `platform-fee-service.test.ts`:

```ts
import pool from '../../src/db/connect.js';
import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import {
  getConfig,
  updateConfig,
  snapshotMonth,
  getHistory,
  computeCurrent,
  applyAdjustment,
  communityActiveForPeriod,
} from '../../src/services/platform-fee.service.js';

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

async function insertAd(fee: number, starts: string, ends: string): Promise<void> {
  await pool.query(
    `INSERT INTO community_ads (brand_name, image_path, image_url, cta_label, cta_url, monthly_fee_ars, starts_on, ends_on)
     VALUES ('M', 'p', 'u', 'c', 'https://x.example', $1, $2, $3)`,
    [fee, starts, ends],
  );
}

describe('communityActiveForPeriod', () => {
  it('launch month counts', () => {
    expect(communityActiveForPeriod('2026-10-20', '2026-10-01')).toBe(true);
    expect(communityActiveForPeriod('2026-10-20', '2026-09-01')).toBe(false);
    expect(communityActiveForPeriod(null, '2026-10-01')).toBe(false);
  });
});

describe('config', () => {
  it('exposes and updates community fields', async () => {
    const c0 = await getConfig();
    expect(c0).toMatchObject({
      community_fee_ars: 30000, community_fallback_fee_ars: 40000,
      community_revision_threshold_ars: 50000, ad_share_pct: 15,
      community_launched_on: null, community_revision_applied_at: null,
    });
    const c1 = await updateConfig({ community_launched_on: '2026-10-01', ad_share_pct: 20 });
    expect(c1.community_launched_on).toBe('2026-10-01');
    expect(c1.ad_share_pct).toBe(20);
    const c2 = await updateConfig({ community_launched_on: null });
    expect(c2.community_launched_on).toBeNull();
  });
});

describe('snapshotMonth with community', () => {
  it('module off: no community amounts', async () => {
    await insertAd(100000, '2026-10-01', '2026-10-31');
    await snapshotMonth('2026-10-01');
    const [h] = await getHistory();
    expect(h).toMatchObject({ community_fee_ars: 0, ad_revenue_ars: 0, ad_share_ars: 0, total_ars: 105000 });
  });

  it('module on: adds community fee + 15% of ads to the total', async () => {
    await updateConfig({ community_launched_on: '2026-10-20' });
    await insertAd(100000, '2026-10-01', '2026-10-31');
    await snapshotMonth('2026-10-01');
    const [h] = await getHistory();
    expect(h).toMatchObject({ community_fee_ars: 30000, ad_revenue_ars: 100000, ad_share_ars: 15000, total_ars: 150000 });
  });
});

describe('computeCurrent with community', () => {
  it('invoice includes community fee and 15% of previous month ads', async () => {
    await updateConfig({ community_launched_on: '2026-10-01' });
    await insertAd(100000, '2026-10-01', '2026-10-31');
    const s = await computeCurrent('2026-11-05');
    expect(s).toMatchObject({ community_fee_ars: 30000, ad_revenue_ars: 100000, ad_share_pct: 15, ad_share_ars: 15000 });
    expect(s.total_ars).toBe(105000 + 30000 + 15000);
  });
  it('module off: zeroes', async () => {
    const s = await computeCurrent('2026-11-05');
    expect(s).toMatchObject({ community_fee_ars: 0, ad_revenue_ars: 0, ad_share_ars: 0, total_ars: 105000 });
  });
});

describe('applyAdjustment', () => {
  it('scales community amounts with the same factor as the base', async () => {
    const c = await applyAdjustment(1500); // factor 1500 / 1420
    expect(c.base_fee_ars).toBe(110915.49);
    expect(c.community_fee_ars).toBe(31690.14);
    expect(c.community_fallback_fee_ars).toBe(42253.52);
    expect(c.community_revision_threshold_ars).toBe(52816.9);
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** in `platform-fee.service.ts`:

1. Extend `PlatformFeeConfig`, `ConfigRow` (NUMERICs as `string`, `community_launched_on: Date | string | null`, `community_revision_applied_at: Date | string | null`), `mapConfig`:

```ts
    community_fee_ars: Number(r.community_fee_ars),
    community_fallback_fee_ars: Number(r.community_fallback_fee_ars),
    community_revision_threshold_ars: Number(r.community_revision_threshold_ars),
    ad_share_pct: Number(r.ad_share_pct),
    community_launched_on: r.community_launched_on ? toISODate(r.community_launched_on) : null,
    community_revision_applied_at: r.community_revision_applied_at
      ? new Date(r.community_revision_applied_at).toISOString()
      : null,
```

   **Date timezone trap:** `toISODate(Date)` uses `toISOString()` (UTC). pg parses `DATE` into a local-midnight JS Date; on a UTC-3 server that is still the same day in UTC (03:00Z), so it's fine — but to be safe, select the column as text: in `CONFIG_COLS` use `community_launched_on::text AS community_launched_on`.

2. `CONFIG_COLS` append: `, community_fee_ars, community_fallback_fee_ars, community_revision_threshold_ars, ad_share_pct, community_launched_on::text AS community_launched_on, community_revision_applied_at`.

3. `UpdateConfigInput` + `UPDATABLE`: add `community_fee_ars`, `community_fallback_fee_ars`, `community_revision_threshold_ars`, `ad_share_pct`, `community_launched_on`. The existing loop skips `undefined` values; `null` must pass through for `community_launched_on` — the current condition `f in input && v !== undefined` already allows `null`. Keep it.

4. Add:

```ts
/** Community is billed for a month when it was launched on or before that month's last day. */
export function communityActiveForPeriod(launchedOn: string | null, periodISO: string): boolean {
  if (!launchedOn) return false;
  return launchedOn.slice(0, 7) <= periodISO.slice(0, 7);
}
```

5. `snapshotMonth(periodISO)`: after `getAthleteBillingRevenue`, compute

```ts
  const community = communityActiveForPeriod(cfg.community_launched_on, periodISO);
  const adRevenue = community ? await adRevenueForMonth(periodISO) : 0;
```

   pass `communityFeeArs: community ? cfg.community_fee_ars : 0, adRevenueArs: adRevenue, adSharePct: cfg.ad_share_pct` to `computeFee`, and add `community_fee_ars, ad_revenue_ars, ad_share_ars` columns (`$10, $11, $12`) to the INSERT with `fee.communityFeeArs, fee.adRevenueArs, fee.adShareArs`. Import `adRevenueForMonth` from `./community-ads.service.js`.

6. `computeCurrent`: 

```ts
  const communityNow = communityActiveForPeriod(cfg.community_launched_on, invoicePeriod);
  const communityPrev = communityActiveForPeriod(cfg.community_launched_on, revenuePeriod);
  const prevAds = communityPrev ? await previousMonthAdRevenue(revenuePeriod) : 0;
```

   with

```ts
/** Frozen ad revenue for a closed month when snapshotted, else live. */
async function previousMonthAdRevenue(periodISO: string): Promise<number> {
  const h = await pool.query<{ ad_revenue_ars: string }>(
    `SELECT ad_revenue_ars FROM platform_fee_history WHERE period = $1`,
    [periodISO],
  );
  return h.rows[0] ? Number(h.rows[0].ad_revenue_ars) : adRevenueForMonth(periodISO);
}
```

   Pass `communityFeeArs: communityNow ? cfg.community_fee_ars : 0, adRevenueArs: prevAds, adSharePct: cfg.ad_share_pct` into the existing `computeFee` call; add to the returned summary: `community_fee_ars: fee.communityFeeArs, ad_revenue_ars: fee.adRevenueArs, ad_share_pct: cfg.ad_share_pct, ad_share_ars: fee.adShareArs`, and extend `PlatformFeeSummary`.

   Note the existing `previousMonthReal` falls back to history too; a history row snapshotted **before** this change has `ad_revenue_ars = 0` (column default) — correct, since the module didn't exist.

7. `applyAdjustment`: inside the transaction, after `newBase`, compute the three community amounts with `computeAdjustedBase(cfg.community_fee_ars, currentUsd, cfg.reference_usd)` (same for fallback and threshold) and add them to the `UPDATE ... SET` (`community_fee_ars = $4, community_fallback_fee_ars = $5, community_revision_threshold_ars = $6`).

8. `getHistory` / `HistoryRow` / `PlatformFeeHistoryRow`: select and map `h.community_fee_ars, h.ad_revenue_ars, h.ad_share_ars` (as `Number`).

`routes/platform-fee.ts` `configBody` — add:

```ts
  community_fee_ars: z.number().nonnegative().optional(),
  community_fallback_fee_ars: z.number().nonnegative().optional(),
  community_revision_threshold_ars: z.number().nonnegative().optional(),
  ad_share_pct: z.number().min(0).max(100).optional(),
  community_launched_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
```

- [ ] **Step 4: Run** `npm test -- tests/integration/platform-fee-community.test.ts tests/integration/platform-fee-service.test.ts tests/integration/platform-fee.test.ts tests/integration/platform-fee-cron.test.ts` → all PASS. If `platform-fee-service.test.ts`'s own `resetPlatformFee()` re-inserts the config row without community columns, defaults (30000/40000/50000/15/NULL) apply — fine.

---

### Task 6: Automatic 6-month revision

**Files:**
- Modify: `backend/src/services/platform-fee.service.ts`
- Modify: `backend/src/workers/platform-fee-cron.ts`
- Modify: `backend/src/services/email-templates.ts`, `backend/src/services/email.service.ts`
- Test: append to `backend/tests/integration/platform-fee-community.test.ts`

**Interfaces — Produces:**

```ts
// platform-fee.service.ts
export interface CommunityRevisionOutcome { applied: boolean; average?: number; newFee?: number; downgraded?: boolean }
export async function applyCommunityRevisionIfDue(todayISO: string): Promise<CommunityRevisionOutcome>;
// email.service.ts
export async function sendCommunityRevisionEmail(opts: {
  email: string; average: number; threshold: number; newFee: number; downgraded: boolean;
}): Promise<void>;
// email-templates.ts
export function communityRevisionTemplate(opts: { average: number; threshold: number; newFee: number; downgraded: boolean }): string;
```

- [ ] **Step 1: Failing tests** — mock email + push at the top of `platform-fee-community.test.ts`. Because mocks must precede imports in ESM, **convert this test file's imports to the dynamic style**:

```ts
import { jest } from '@jest/globals';

const emails: Array<{ email: string; newFee: number; downgraded: boolean }> = [];
jest.unstable_mockModule('../../src/services/email.service.js', () => ({
  sendCommunityRevisionEmail: async (o: { email: string; newFee: number; downgraded: boolean }) => { emails.push(o); },
  sendVerifyEmail: async () => {},
  sendPasswordResetEmail: async () => {},
  sendCoachPainAlert: async () => {},
  sendMembershipExpiringEmail: async () => {},
  sendMembershipExpiredEmail: async () => {},
  sendAccountApprovedEmail: async () => {},
}));

const pool = (await import('../../src/db/connect.js')).default;
const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const svc = await import('../../src/services/platform-fee.service.js');
const { runPlatformFeeTick } = await import('../../src/workers/platform-fee-cron.js');
```

(Check `email.service.ts` for any other exported function and add it to the mock as a no-op. Rewrite the Task 5 tests to use `svc.getConfig(...)` etc.; add `emails.length = 0` in `beforeEach`.)

Then:

```ts
async function adminUser(): Promise<void> {
  await pool.query(`INSERT INTO users (email, password_hash, role) VALUES ('boss@t.local', 'x', 'superadmin')`);
}

async function history(period: string, adRevenue: number): Promise<void> {
  await pool.query(
    `INSERT INTO platform_fee_history (period, base_fee_ars, active_athletes, price_per_athlete_ars,
       gross_revenue_ars, revenue_share_pct, revenue_share_ars, total_ars, usd_at_snapshot, ad_revenue_ars)
     VALUES ($1, 0, 0, 0, 0, 4, 0, 0, 1420, $2)`,
    [period, adRevenue],
  );
}

describe('applyCommunityRevisionIfDue', () => {
  it('not due before launch + 6 months', async () => {
    await svc.updateConfig({ community_launched_on: '2026-10-15' });
    expect(await svc.applyCommunityRevisionIfDue('2027-04-14')).toEqual({ applied: false });
  });

  it('downgrades to fallback when the 6-month average is below the threshold, once', async () => {
    await adminUser();
    await svc.updateConfig({ community_launched_on: '2026-10-01' });
    for (const p of ['2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01', '2027-03-01']) {
      await history(p, 40000);
    }
    await history('2027-04-01', 999999); // 7th month: ignored
    const r = await svc.applyCommunityRevisionIfDue('2027-04-01');
    expect(r).toMatchObject({ applied: true, average: 40000, newFee: 40000, downgraded: true });
    const c = await svc.getConfig();
    expect(c.community_fee_ars).toBe(40000);
    expect(c.community_revision_applied_at).not.toBeNull();
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ email: 'boss@t.local', downgraded: true });
    expect(await svc.applyCommunityRevisionIfDue('2027-05-01')).toEqual({ applied: false });
    expect(emails).toHaveLength(1);
  });

  it('keeps the fee at exactly the threshold and still marks applied', async () => {
    await svc.updateConfig({ community_launched_on: '2026-10-01' });
    for (const p of ['2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01', '2027-03-01']) {
      await history(p, 50000);
    }
    const r = await svc.applyCommunityRevisionIfDue('2027-04-01');
    expect(r).toMatchObject({ applied: true, downgraded: false, newFee: 30000 });
    expect((await svc.getConfig()).community_revision_applied_at).not.toBeNull();
  });

  it('missing months count as zero', async () => {
    await svc.updateConfig({ community_launched_on: '2026-10-01' });
    await history('2026-10-01', 300000);
    const r = await svc.applyCommunityRevisionIfDue('2027-04-01');
    expect(r).toMatchObject({ applied: true, average: 50000, downgraded: false });
  });

  it('module off never applies', async () => {
    expect(await svc.applyCommunityRevisionIfDue('2030-01-01')).toEqual({ applied: false });
  });

  it('runPlatformFeeTick snapshots then revises', async () => {
    await svc.updateConfig({ community_launched_on: '2026-10-01' });
    const r = await runPlatformFeeTick('2027-04-01');
    const c = await svc.getConfig();
    expect(c.community_revision_applied_at).not.toBeNull();
    expect(c.community_fee_ars).toBe(40000); // no ads at all -> average 0
    expect(r).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

`email-templates.ts`:

```ts
const ars = (n: number) => `$${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;

export function communityRevisionTemplate(opts: {
  average: number;
  threshold: number;
  newFee: number;
  downgraded: boolean;
}): string {
  return layout(`
  <h2 style="margin:0 0 16px 0">Revisión de Comunidad aplicada</h2>
  <p style="line-height:1.6">Se cumplieron 6 meses desde el lanzamiento del módulo Comunidad.</p>
  <ul style="line-height:1.8">
    <li>Promedio mensual de publicidad: <strong>${ars(opts.average)}</strong></li>
    <li>Umbral: <strong>${ars(opts.threshold)}</strong></li>
    <li>Fee fijo de Comunidad desde ahora: <strong>${ars(opts.newFee)}</strong></li>
  </ul>
  <p style="line-height:1.6">${
    opts.downgraded
      ? 'El promedio quedó por debajo del umbral, así que el fee fijo se ajustó según la adenda.'
      : 'El promedio alcanzó el umbral, así que el fee fijo se mantiene.'
  } El 15% sobre la publicidad no cambia.</p>`);
}
```

`email.service.ts`:

```ts
export async function sendCommunityRevisionEmail(opts: {
  email: string;
  average: number;
  threshold: number;
  newFee: number;
  downgraded: boolean;
}): Promise<void> {
  await send({
    to: opts.email,
    subject: 'Revisión de Comunidad — TR Fit',
    html: communityRevisionTemplate(opts),
  });
}
```

(add `communityRevisionTemplate` to the import list; the `email` field is ignored by the template — destructure it out: `const { email, ...rest } = opts; html: communityRevisionTemplate(rest)`.)

`platform-fee.service.ts`:

```ts
import { communityRevisionDate, evaluateCommunityRevision } from './platform-fee.math.js';
import { notifyUser } from './notification.service.js';
import { sendCommunityRevisionEmail } from './email.service.js';
import logger from '../utils/logger.js';

export interface CommunityRevisionOutcome {
  applied: boolean;
  average?: number;
  newFee?: number;
  downgraded?: boolean;
}

export async function applyCommunityRevisionIfDue(todayISO: string): Promise<CommunityRevisionOutcome> {
  const cfg = await getConfig();
  if (!cfg.community_launched_on || cfg.community_revision_applied_at) return { applied: false };
  if (todayISO.slice(0, 10) < communityRevisionDate(cfg.community_launched_on)) return { applied: false };

  const h = await pool.query<{ ad_revenue_ars: string }>(
    `SELECT ad_revenue_ars FROM platform_fee_history
      WHERE period >= date_trunc('month', $1::date)::date
      ORDER BY period LIMIT 6`,
    [cfg.community_launched_on],
  );
  const result = evaluateCommunityRevision({
    monthlyAdRevenues: h.rows.map((r) => Number(r.ad_revenue_ars)),
    threshold: cfg.community_revision_threshold_ars,
    fee: cfg.community_fee_ars,
    fallbackFee: cfg.community_fallback_fee_ars,
  });

  // Guarded by applied_at IS NULL so a concurrent/duplicate run can't apply twice.
  const upd = await pool.query(
    `UPDATE platform_fee_config
        SET community_fee_ars = $1, community_revision_applied_at = now(), updated_at = now()
      WHERE id = 1 AND community_revision_applied_at IS NULL`,
    [result.newFee],
  );
  if (!upd.rowCount) return { applied: false };

  const admins = await pool.query<{ id: string; email: string }>(
    `SELECT id, email FROM users WHERE role IN ('admin', 'superadmin')`,
  );
  for (const a of admins.rows) {
    void notifyUser(a.id, 'community_revision', {
      average: String(result.average),
      newFee: String(result.newFee),
      downgraded: String(result.downgraded),
    }).catch((e) => logger.error({ err: e }, 'community revision push failed'));
    try {
      await sendCommunityRevisionEmail({
        email: a.email,
        average: result.average,
        threshold: cfg.community_revision_threshold_ars,
        newFee: result.newFee,
        downgraded: result.downgraded,
      });
    } catch (e) {
      logger.error({ err: e, email: a.email }, 'community revision email failed');
    }
  }
  return { applied: true, ...result };
}
```

`workers/platform-fee-cron.ts` `runPlatformFeeTick`, after `await snapshotMonth(period);`:

```ts
  const revision = await applyCommunityRevisionIfDue(today);
  if (revision.applied) logger.info({ revision }, 'community revision applied');
```

(import `applyCommunityRevisionIfDue` from `../services/platform-fee.service.js`.)

- [ ] **Step 4: Run** `npm test -- tests/integration/platform-fee-community.test.ts tests/integration/platform-fee-cron.test.ts` → PASS.

---

### Task 7: `/admin/community/summary`

**Files:**
- Modify: `backend/src/services/community-ads.service.ts` (add `communitySummary`)
- Modify: `backend/src/routes/admin-community.ts`
- Test: append to `backend/tests/integration/community-ads.test.ts`

**Interfaces — Produces:**

```ts
export interface CommunitySummary {
  enabled: boolean;
  launched_on: string | null;
  revision_date: string | null;
  days_to_revision: number | null;       // negative once past
  ad_revenue_this_month: number;
  ad_share_this_month: number;
  avg_ad_revenue: number;                 // average used for the projection
  projected_community_fee: number;
  revision_applied_at: string | null;
  community_fee_ars: number;
  threshold_ars: number;
}
export async function communitySummary(todayISO?: string): Promise<CommunitySummary>;
```

Projection rule: if revision already applied → `projected_community_fee = community_fee_ars` and `avg_ad_revenue` = average of the first 6 history rows / 6. Otherwise use the months since launch that exist in history (first up to 6) **plus the current month live** (`adRevenueForMonth(current month)`) when the current month is within the first 6, averaged over the number of months counted (min 1); `projected = avg < threshold ? fallback : fee`. When not launched: `avg_ad_revenue = ad_revenue_this_month`, projection computed the same way.

Import `getConfig` from `./platform-fee.service.js` and `communityRevisionDate`, `evaluateCommunityRevision`(not needed — compare directly), `currentMonthPeriod` from `./platform-fee.math.js`. **Cycle check:** `platform-fee.service.ts` imports `adRevenueForMonth` from `community-ads.service.ts`, and `community-ads.service.ts` would import `getConfig` from `platform-fee.service.ts` — an ESM cycle between function-only modules is safe at runtime (no top-level use), but to keep it clean put `communitySummary` in a new file `backend/src/services/community-summary.service.ts` instead. Use that file.

- [ ] **Step 1: Failing test**

```ts
describe('GET /admin/community/summary', () => {
  it('module off', async () => {
    const adm = await makeUser('admin');
    const r = await request(app).get('/api/admin/community/summary').set('Authorization', `Bearer ${adm.token}`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ enabled: false, launched_on: null, revision_date: null, days_to_revision: null, revision_applied_at: null });
  });

  it('module on: dates, this-month revenue and projection', async () => {
    const adm = await makeUser('admin');
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
    await pool.query(`UPDATE platform_fee_config SET community_launched_on = $1::date - 10 WHERE id = 1`, [today]);
    await insertAd({ fee: 20000, starts: '2020-01-01', ends: '2099-12-31' });
    const r = await request(app).get('/api/admin/community/summary').set('Authorization', `Bearer ${adm.token}`);
    expect(r.body.enabled).toBe(true);
    expect(r.body.ad_revenue_this_month).toBe(20000);
    expect(r.body.ad_share_this_month).toBe(3000);
    expect(r.body.projected_community_fee).toBe(40000); // avg 20000 < 50000
    expect(r.body.days_to_revision).toBeGreaterThan(150);
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** `backend/src/services/community-summary.service.ts`:

```ts
import pool from '../db/connect.js';
import { getConfig } from './platform-fee.service.js';
import { adRevenueForMonth, todayBA } from './community-ads.service.js';
import { communityRevisionDate, currentMonthPeriod } from './platform-fee.math.js';

export interface CommunitySummary {
  enabled: boolean;
  launched_on: string | null;
  revision_date: string | null;
  days_to_revision: number | null;
  ad_revenue_this_month: number;
  ad_share_this_month: number;
  avg_ad_revenue: number;
  projected_community_fee: number;
  revision_applied_at: string | null;
  community_fee_ars: number;
  threshold_ars: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const daysBetween = (fromISO: string, toISO: string) =>
  Math.round((Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) / 86_400_000);

export async function communitySummary(todayISO?: string): Promise<CommunitySummary> {
  const today = todayISO ?? todayBA();
  const cfg = await getConfig();
  const thisMonth = currentMonthPeriod(today);
  const adThisMonth = await adRevenueForMonth(thisMonth);
  const launched = cfg.community_launched_on;
  const revisionDate = launched ? communityRevisionDate(launched) : null;

  let avg = adThisMonth;
  if (launched) {
    const h = await pool.query<{ period: string; ad_revenue_ars: string }>(
      `SELECT period::text AS period, ad_revenue_ars FROM platform_fee_history
        WHERE period >= date_trunc('month', $1::date)::date
        ORDER BY period LIMIT 6`,
      [launched],
    );
    const months = h.rows.map((r) => Number(r.ad_revenue_ars));
    if (cfg.community_revision_applied_at) {
      avg = months.reduce((a, b) => a + b, 0) / 6;
    } else {
      const windowEnd = currentMonthPeriod(revisionDate!); // month of revision date (exclusive)
      const includeCurrent = thisMonth < windowEnd && !h.rows.some((r) => r.period === thisMonth);
      if (includeCurrent && months.length < 6) months.push(adThisMonth);
      avg = months.length ? months.reduce((a, b) => a + b, 0) / months.length : 0;
    }
  }
  avg = round2(avg);
  const projected = cfg.community_revision_applied_at
    ? cfg.community_fee_ars
    : avg < cfg.community_revision_threshold_ars
      ? cfg.community_fallback_fee_ars
      : cfg.community_fee_ars;

  return {
    enabled: launched !== null,
    launched_on: launched,
    revision_date: revisionDate,
    days_to_revision: revisionDate ? daysBetween(today, revisionDate) : null,
    ad_revenue_this_month: adThisMonth,
    ad_share_this_month: round2((adThisMonth * cfg.ad_share_pct) / 100),
    avg_ad_revenue: avg,
    projected_community_fee: projected,
    revision_applied_at: cfg.community_revision_applied_at,
    community_fee_ars: cfg.community_fee_ars,
    threshold_ars: cfg.community_revision_threshold_ars,
  };
}
```

`routes/admin-community.ts`:

```ts
router.get('/summary', handle(async (_req, res) => { res.json(await communitySummary()); }));
```

- [ ] **Step 4: Run** `npm test -- tests/integration/community-ads.test.ts` → PASS.

---

### Task 8: Full regression

- [ ] `cd backend && npx tsc --noEmit` → 0 errors.
- [ ] `cd backend && TEST_DATABASE_URL="$TEST_DATABASE_URL" npm test 2>&1 | tail -40` → all green. Pre-existing failures: verify with `git stash` before touching; report instead of fixing unrelated code.
- [ ] `npx prettier --write` only on files you created/modified.
- [ ] Summary: files, test results, deviations.
