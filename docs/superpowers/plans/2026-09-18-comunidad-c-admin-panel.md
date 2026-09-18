# Comunidad — Part C: admin panel Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.
> **auto-build host:** Claude plans+reviews; Grok implements via headless CLI.
> <!-- auto-build plan · 2026-09-18 · source: claude+writing-plans · part C of 3 -->

**Goal:** Admin panel for Comunidad: `/admin/community` page (tabs Publicar / Muro / Denuncias / Publicidad), sidebar item with open-reports badge, dashboard cards, community breakdown + revision card + config fields in `PlatformFee.tsx`, and community rules in `Terms.tsx`.

**Architecture:** React 19 + TanStack Query hooks in one file `hooks/useCommunity.ts` (same style as `hooks/usePlatformFee.ts`). Pure helpers in `lib/community.ts` (unit-tested). Page `pages/admin/Community.tsx` composes one component per tab under `components/admin/community/`. Image compression + thumbnail on the client with `<canvas>` in `lib/image.ts`.

**Tech Stack:** React 19, Vite, TypeScript, Tailwind 4, shadcn/ui (`@/components/ui/*`), lucide-react, @tanstack/react-query 5, axios (`api` from `@/lib/api`), sonner (`toast`), Vitest + Testing Library (msw with `onUnhandledRequest: 'error'` → tests must mock hooks, never hit the network).

**Spec:** `docs/superpowers/specs/2026-09-18-comunidad-design.md` — section "Panel admin" (+ API shapes in "API").

**Backend already implemented in this branch (Parts A and B).** Read before starting:
- `backend/src/routes/admin-community.ts` (all admin endpoints incl. `GET /reports/count`, `/ads`, `/summary`)
- `backend/src/services/community.service.ts` (`PostDTO`), `community-moderation.service.ts` (`ReportDTO`), `community-ads.service.ts` (`AdminAdDTO`), `community-summary.service.ts` (`CommunitySummary`)
- `backend/src/services/platform-fee.service.ts` (new `PlatformFeeSummary`/`PlatformFeeConfig` fields)

## Global Constraints

- Do not open PRs, push, or commit. Skip every "commit" step.
- Spanish (rioplatense, "vos") UI copy. Follow existing visual style (see `pages/admin/PlatformFee.tsx`, `components/admin/*`).
- Use `@/` import aliases. No new npm dependencies.
- Reports age turns **red after 20 hours** (`age_hours > 20`).
- Ads: amount not editable after creation (no edit UI). Required: brand, image, CTA label, CTA URL (http/https), monthly fee ≥ 0, start date, end date ≥ start date. Body ≤ 280 chars.
- Posts body ≤ 2000 chars. Events require place and date/time.
- Dashboard: "Denuncias pendientes" card only when open reports > 0. Revision notice only when `0 <= days_to_revision <= 15` and not applied.
- Verification commands (lint at HEAD is broken — don't use `npm run lint` as a gate):
  - `cd frontend && npx tsc -b --noEmit` (if `-b` complains, `npx tsc --noEmit -p tsconfig.app.json`)
  - `cd frontend && npx vitest run <paths>`
  - `cd frontend && npx prettier --write <files you touched>`

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `frontend/src/hooks/useCommunity.ts` | Create | Types + queries/mutations for `/admin/community/*` |
| `frontend/src/lib/community.ts` | Create | Pure helpers: age tone, ad status groups, ad form validation, WhatsApp report text, multipart builders |
| `frontend/src/lib/community.test.ts` | Create | Tests for helpers |
| `frontend/src/lib/image.ts` | Create | Canvas compression + thumbnail |
| `frontend/src/components/admin/community/PublishTab.tsx` | Create | Announcement/event form + preview |
| `frontend/src/components/admin/community/WallTab.tsx` | Create | Moderation wall |
| `frontend/src/components/admin/community/ReportsTab.tsx` | Create | Reports inbox |
| `frontend/src/components/admin/community/ReportsTab.test.tsx` | Create | Actions + age color |
| `frontend/src/components/admin/community/AdsTab.tsx` | Create | Ad form, list, detail/metrics, copy report |
| `frontend/src/components/admin/community/AdsTab.test.tsx` | Create | Form validation wiring |
| `frontend/src/pages/admin/Community.tsx` | Create | Page + tabs (`?tab=`) |
| `frontend/src/App.tsx` | Modify | Route |
| `frontend/src/components/admin/Sidebar.tsx` | Modify | "Comunidad" item + badge |
| `frontend/src/pages/admin/Dashboard.tsx` | Modify | Reports card + revision notice |
| `frontend/src/hooks/usePlatformFee.ts` | Modify | New summary/config/history fields |
| `frontend/src/pages/admin/PlatformFee.tsx` | Modify | Breakdown rows, revision card, config fields |
| `frontend/src/pages/admin/PlatformFee.test.tsx` | Modify | Mocks include new fields; community rows test |
| `frontend/src/pages/Terms.tsx` | Modify | Community rules section |

---

### Task 1: Hooks + pure helpers

**Files:**
- Create: `frontend/src/hooks/useCommunity.ts`, `frontend/src/lib/community.ts`, `frontend/src/lib/community.test.ts`, `frontend/src/lib/image.ts`

**Interfaces — Produces:**

`useCommunity.ts` types (mirror backend DTOs exactly):

```ts
export type PostKind = 'post' | 'announcement' | 'event';
export type Category = 'general' | 'meals' | 'training';
export interface CommunityAuthor { id: string; name: string; avatar_url: string | null; is_coach: boolean }
export interface CommunityPost {
  type: 'post'; id: string; kind: PostKind; category: Category; body: string; created_at: string; pinned: boolean;
  author: CommunityAuthor;
  media: Array<{ url: string; thumb_url: string; width: number; height: number }>;
  like_count: number; comment_count: number; liked_by_me: boolean;
  event?: { location: string | null; starts_at: string; rsvp_count: number; going: boolean };
  can_delete: boolean; hidden_at?: string | null;
}
export interface CommunityReport {
  id: string; target_type: 'post' | 'comment'; target_id: string;
  reason: 'offensive' | 'spam' | 'inappropriate' | 'other'; note: string | null;
  status: 'open' | 'actioned' | 'dismissed'; created_at: string; age_hours: number;
  reporter: { id: string; name: string };
  content: { body: string; author_id: string; author_name: string; hidden: boolean; media: Array<{ thumb_url: string }>; post_id: string } | null;
}
export interface CommunityAd {
  id: string; brand_name: string; body: string; image_url: string; cta_label: string; cta_url: string;
  monthly_fee_ars: number; starts_on: string; ends_on: string; archived_at: string | null; created_at: string;
  status: 'active' | 'upcoming' | 'expired' | 'archived';
}
export interface AdMetrics { views: number; clicks: number; reach: number; daily: Array<{ day: string; views: number; clicks: number }> }
export interface CommunitySummary {
  enabled: boolean; launched_on: string | null; revision_date: string | null; days_to_revision: number | null;
  ad_revenue_this_month: number; ad_share_this_month: number; avg_ad_revenue: number;
  projected_community_fee: number; revision_applied_at: string | null; community_fee_ars: number; threshold_ars: number;
}
export interface Rsvp { id: string; name: string; avatar_url: string | null; created_at: string }
```

Hooks: `useCommunityWall(includeHidden: boolean)` (infinite query over `next_cursor`), `useCommunityReports(status)`, `useCommunityReportCount()`, `useCommunityAds()`, `useAdMetrics(adId | null)`, `useCommunitySummary()`, `useEventRsvps(postId | null)`, mutations `useCreateCommunityPost()`, `useSetPostHidden()`, `useDeleteCommunityPost()`, `useSetPostPinned()`, `useResolveReport()`, `useMuteUser()`, `useCreateAd()`, `useArchiveAd()`.

`lib/community.ts`:

```ts
export const REPORT_AGE_ALERT_HOURS = 20;
export function reportAgeTone(ageHours: number): 'danger' | 'normal';
export function fmtAge(ageHours: number): string;             // "35 min" | "5 h" | "2 d 3 h"
export const REPORT_REASON_LABEL: Record<'offensive' | 'spam' | 'inappropriate' | 'other', string>;
export interface AdFormValues { brand_name: string; body: string; cta_label: string; cta_url: string; monthly_fee_ars: string; starts_on: string; ends_on: string; image: File | null }
export type AdFormErrors = Partial<Record<keyof AdFormValues, string>>;
export function validateAdForm(v: AdFormValues): AdFormErrors;
export function groupAds(ads: CommunityAd[]): { active: CommunityAd[]; upcoming: CommunityAd[]; ended: CommunityAd[] }; // ended = expired + archived
export function buildAdReport(ad: CommunityAd, m: AdMetrics): string;
export interface PublishFormValues { kind: 'announcement' | 'event'; body: string; event_location: string; event_starts_at: string; pin: boolean }
export function validatePublishForm(v: PublishFormValues): Partial<Record<keyof PublishFormValues, string>>;
```

`lib/image.ts`:

```ts
export interface PreparedImage { image: Blob; thumb: Blob; width: number; height: number }
export async function prepareImage(file: File): Promise<PreparedImage>;
```

- [ ] **Step 1: Write failing test** — `frontend/src/lib/community.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import {
  buildAdReport,
  fmtAge,
  groupAds,
  reportAgeTone,
  validateAdForm,
  validatePublishForm,
  type AdFormValues,
} from './community';
import type { CommunityAd } from '@/hooks/useCommunity';

const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
const validAd: AdFormValues = {
  brand_name: 'Marca', body: '', cta_label: 'Ver', cta_url: 'https://marca.example',
  monthly_fee_ars: '50000', starts_on: '2026-10-01', ends_on: '2026-12-31', image: file,
};

const ad = (over: Partial<CommunityAd>): CommunityAd => ({
  id: 'a', brand_name: 'Marca', body: '', image_url: 'u', cta_label: 'Ver', cta_url: 'https://x',
  monthly_fee_ars: 1, starts_on: '2026-10-01', ends_on: '2026-10-31', archived_at: null,
  created_at: '2026-09-01T00:00:00Z', status: 'active', ...over,
});

describe('reportAgeTone', () => {
  it('turns red strictly after 20 hours', () => {
    expect(reportAgeTone(20)).toBe('normal');
    expect(reportAgeTone(20.1)).toBe('danger');
  });
});

describe('fmtAge', () => {
  it('formats minutes, hours and days', () => {
    expect(fmtAge(0.5)).toBe('30 min');
    expect(fmtAge(5.2)).toBe('5 h');
    expect(fmtAge(51)).toBe('2 d 3 h');
  });
});

describe('validateAdForm', () => {
  it('accepts a valid ad', () => {
    expect(validateAdForm(validAd)).toEqual({});
  });
  it('requires brand, image, cta and url', () => {
    const e = validateAdForm({ ...validAd, brand_name: ' ', image: null, cta_label: '', cta_url: 'marca.com' });
    expect(Object.keys(e).sort()).toEqual(['brand_name', 'cta_label', 'cta_url', 'image']);
  });
  it('rejects negative or empty fee and end before start', () => {
    expect(validateAdForm({ ...validAd, monthly_fee_ars: '-1' }).monthly_fee_ars).toBeDefined();
    expect(validateAdForm({ ...validAd, monthly_fee_ars: '' }).monthly_fee_ars).toBeDefined();
    expect(validateAdForm({ ...validAd, ends_on: '2026-09-30' }).ends_on).toBeDefined();
  });
  it('limits body to 280 chars and rejects non-image files', () => {
    expect(validateAdForm({ ...validAd, body: 'x'.repeat(281) }).body).toBeDefined();
    const pdf = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    expect(validateAdForm({ ...validAd, image: pdf }).image).toBeDefined();
  });
});

describe('validatePublishForm', () => {
  it('event needs place and date', () => {
    const e = validatePublishForm({ kind: 'event', body: 'Asado', event_location: '', event_starts_at: '', pin: false });
    expect(Object.keys(e).sort()).toEqual(['event_location', 'event_starts_at']);
  });
  it('announcement needs body', () => {
    expect(validatePublishForm({ kind: 'announcement', body: ' ', event_location: '', event_starts_at: '', pin: false }).body).toBeDefined();
  });
});

describe('groupAds', () => {
  it('splits by status', () => {
    const g = groupAds([
      ad({ id: '1', status: 'active' }), ad({ id: '2', status: 'upcoming' }),
      ad({ id: '3', status: 'expired' }), ad({ id: '4', status: 'archived' }),
    ]);
    expect(g.active.map((a) => a.id)).toEqual(['1']);
    expect(g.upcoming.map((a) => a.id)).toEqual(['2']);
    expect(g.ended.map((a) => a.id)).toEqual(['3', '4']);
  });
});

describe('buildAdReport', () => {
  it('produces WhatsApp-ready text with the numbers', () => {
    const txt = buildAdReport(ad({ brand_name: 'Proteína X', starts_on: '2026-10-01', ends_on: '2026-10-31' }), {
      views: 1200, clicks: 36, reach: 85, daily: [],
    });
    expect(txt).toContain('Proteína X');
    expect(txt).toContain('1.200');
    expect(txt).toContain('36');
    expect(txt).toContain('85');
    expect(txt).toContain('3,0%'); // CTR = 36 / 1200
  });
});
```

- [ ] **Step 2: Run** `cd frontend && npx vitest run src/lib/community.test.ts` → FAIL.

- [ ] **Step 3: Implement `frontend/src/lib/community.ts`**

```ts
import type { AdMetrics, CommunityAd } from '@/hooks/useCommunity';

export const REPORT_AGE_ALERT_HOURS = 20;

export function reportAgeTone(ageHours: number): 'danger' | 'normal' {
  return ageHours > REPORT_AGE_ALERT_HOURS ? 'danger' : 'normal';
}

export function fmtAge(ageHours: number): string {
  if (ageHours < 1) return `${Math.max(1, Math.round(ageHours * 60))} min`;
  if (ageHours < 24) return `${Math.floor(ageHours)} h`;
  const d = Math.floor(ageHours / 24);
  const h = Math.floor(ageHours - d * 24);
  return h > 0 ? `${d} d ${h} h` : `${d} d`;
}

export const REPORT_REASON_LABEL = {
  offensive: 'Ofensivo',
  spam: 'Spam',
  inappropriate: 'Inapropiado',
  other: 'Otro',
} as const;

export interface AdFormValues {
  brand_name: string;
  body: string;
  cta_label: string;
  cta_url: string;
  monthly_fee_ars: string;
  starts_on: string;
  ends_on: string;
  image: File | null;
}
export type AdFormErrors = Partial<Record<keyof AdFormValues, string>>;

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function validateAdForm(v: AdFormValues): AdFormErrors {
  const e: AdFormErrors = {};
  if (!v.brand_name.trim()) e.brand_name = 'Ingresá la marca';
  if (v.body.length > 280) e.body = 'Máximo 280 caracteres';
  if (!v.cta_label.trim()) e.cta_label = 'Ingresá el texto del botón';
  if (!/^https?:\/\/\S+\.\S+/.test(v.cta_url.trim())) e.cta_url = 'Ingresá un link que empiece con https://';
  const fee = Number(v.monthly_fee_ars);
  if (v.monthly_fee_ars.trim() === '' || !Number.isFinite(fee) || fee < 0) e.monthly_fee_ars = 'Ingresá un monto válido';
  if (!v.starts_on) e.starts_on = 'Elegí la fecha de inicio';
  if (!v.ends_on) e.ends_on = 'Elegí la fecha de fin';
  else if (v.starts_on && v.ends_on < v.starts_on) e.ends_on = 'La fecha de fin es anterior al inicio';
  if (!v.image) e.image = 'Subí una imagen';
  else if (!IMAGE_TYPES.includes(v.image.type)) e.image = 'La imagen debe ser JPG, PNG o WebP';
  return e;
}

export interface PublishFormValues {
  kind: 'announcement' | 'event';
  body: string;
  event_location: string;
  event_starts_at: string;
  pin: boolean;
}

export function validatePublishForm(v: PublishFormValues): Partial<Record<keyof PublishFormValues, string>> {
  const e: Partial<Record<keyof PublishFormValues, string>> = {};
  if (!v.body.trim()) e.body = 'Escribí el texto';
  else if (v.body.length > 2000) e.body = 'Máximo 2000 caracteres';
  if (v.kind === 'event') {
    if (!v.event_location.trim()) e.event_location = 'Ingresá el lugar';
    if (!v.event_starts_at) e.event_starts_at = 'Elegí fecha y hora';
  }
  return e;
}

export function groupAds(ads: CommunityAd[]): { active: CommunityAd[]; upcoming: CommunityAd[]; ended: CommunityAd[] } {
  return {
    active: ads.filter((a) => a.status === 'active'),
    upcoming: ads.filter((a) => a.status === 'upcoming'),
    ended: ads.filter((a) => a.status === 'expired' || a.status === 'archived'),
  };
}

const NUM = new Intl.NumberFormat('es-AR');
const PCT = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function buildAdReport(ad: CommunityAd, m: AdMetrics): string {
  const ctr = m.views > 0 ? (m.clicks / m.views) * 100 : 0;
  return [
    `📊 Reporte de publicidad — ${ad.brand_name}`,
    `Período: ${ddmm(ad.starts_on)} al ${ddmm(ad.ends_on)}`,
    '',
    `👀 Vistas: ${NUM.format(m.views)}`,
    `👤 Alcance: ${NUM.format(m.reach)} personas`,
    `👉 Clics: ${NUM.format(m.clicks)} (${PCT.format(ctr)}%)`,
    '',
    'Comunidad TR-Fit',
  ].join('\n');
}
```

- [ ] **Step 4: Implement `frontend/src/lib/image.ts`**

```ts
export interface PreparedImage {
  image: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

const MAX_SIDE = 1600;
const THUMB_SIDE = 400;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_THUMB_BYTES = 200 * 1024;

async function toJpeg(bitmap: ImageBitmap, maxSide: number, maxBytes: number): Promise<{ blob: Blob; w: number; h: number }> {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  for (const q of [0.82, 0.7, 0.55, 0.4]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', q));
    if (blob && blob.size <= maxBytes) return { blob, w, h };
  }
  throw new Error('image_too_large');
}

/** Compress to JPEG ≤2 MB (max 1600px) plus a ≤200 KB thumbnail (max 400px), matching backend limits. */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const main = await toJpeg(bitmap, MAX_SIDE, MAX_IMAGE_BYTES);
    const thumb = await toJpeg(bitmap, THUMB_SIDE, MAX_THUMB_BYTES);
    return { image: main.blob, thumb: thumb.blob, width: main.w, height: main.h };
  } finally {
    bitmap.close();
  }
}
```

(No unit test: jsdom has no canvas. Components that call it are tested with the hook mocked.)

- [ ] **Step 5: Implement `frontend/src/hooks/useCommunity.ts`** — types from the Interfaces block above, then:

```ts
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PreparedImage } from '@/lib/image';

const KEY = ['community'] as const;

export function useCommunityWall(includeHidden: boolean) {
  return useInfiniteQuery({
    queryKey: [...KEY, 'wall', includeHidden],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const r = await api.get<{ items: CommunityPost[]; next_cursor: string | null }>('/admin/community/posts', {
        params: { cursor: pageParam ?? undefined, include_hidden: includeHidden ? 1 : undefined },
      });
      return r.data;
    },
    getNextPageParam: (last) => last.next_cursor,
  });
}

export function useCommunityReports(status: 'open' | 'actioned' | 'dismissed' = 'open') {
  return useQuery({
    queryKey: [...KEY, 'reports', status],
    queryFn: async () => (await api.get<CommunityReport[]>('/admin/community/reports', { params: { status } })).data,
    refetchInterval: 60_000,
  });
}

export function useCommunityReportCount() {
  return useQuery({
    queryKey: [...KEY, 'reports', 'count'],
    queryFn: async () => (await api.get<{ open: number }>('/admin/community/reports/count')).data.open,
    refetchInterval: 60_000,
  });
}

export function useCommunityAds() {
  return useQuery({
    queryKey: [...KEY, 'ads'],
    queryFn: async () => (await api.get<CommunityAd[]>('/admin/community/ads')).data,
  });
}

export function useAdMetrics(adId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'ads', adId, 'metrics'],
    enabled: !!adId,
    queryFn: async () => (await api.get<AdMetrics>(`/admin/community/ads/${adId}/metrics`)).data,
  });
}

export function useCommunitySummary() {
  return useQuery({
    queryKey: [...KEY, 'summary'],
    queryFn: async () => (await api.get<CommunitySummary>('/admin/community/summary')).data,
  });
}

export function useEventRsvps(postId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'rsvps', postId],
    enabled: !!postId,
    queryFn: async () => (await api.get<Rsvp[]>(`/admin/community/posts/${postId}/rsvps`)).data,
  });
}

function useInvalidating<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}

export interface CreatePostInput {
  kind: 'announcement' | 'event';
  body: string;
  event_location?: string;
  event_starts_at?: string; // ISO
  pin: boolean;
  image?: PreparedImage | null;
}

export function useCreateCommunityPost() {
  return useInvalidating(async (input: CreatePostInput) => {
    const fd = new FormData();
    fd.append('kind', input.kind);
    fd.append('body', input.body);
    fd.append('pin', String(input.pin));
    if (input.kind === 'event') {
      fd.append('event_location', input.event_location ?? '');
      fd.append('event_starts_at', input.event_starts_at ?? '');
    }
    if (input.image) {
      fd.append('images', input.image.image, 'image.jpg');
      fd.append('thumbs', input.image.thumb, 'thumb.jpg');
      fd.append('widths', String(input.image.width));
      fd.append('heights', String(input.image.height));
    }
    return (await api.post<CommunityPost>('/admin/community/posts', fd)).data;
  });
}

export function useSetPostHidden() {
  return useInvalidating(async ({ id, hidden }: { id: string; hidden: boolean }) => {
    await api.post(`/admin/community/posts/${id}/${hidden ? 'hide' : 'unhide'}`);
  });
}

export function useDeleteCommunityPost() {
  return useInvalidating(async (id: string) => {
    await api.delete(`/community/posts/${id}`);
  });
}

export function useSetPostPinned() {
  return useInvalidating(async ({ id, pinned }: { id: string; pinned: boolean }) => {
    await api.patch(`/admin/community/posts/${id}/pin`, { pinned });
  });
}

export function useResolveReport() {
  return useInvalidating(
    async ({ id, action, mute_days }: { id: string; action: 'hide' | 'dismiss' | 'mute'; mute_days?: number }) => {
      await api.post(`/admin/community/reports/${id}/resolve`, { action, mute_days });
    },
  );
}

export function useMuteUser() {
  return useInvalidating(async ({ userId, days }: { userId: string; days: number | null }) => {
    await api.post(`/admin/community/users/${userId}/mute`, { days });
  });
}

export interface CreateAdInput {
  brand_name: string; body: string; cta_label: string; cta_url: string;
  monthly_fee_ars: number; starts_on: string; ends_on: string; image: Blob;
}

export function useCreateAd() {
  return useInvalidating(async (input: CreateAdInput) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(input)) {
      if (k === 'image') fd.append('image', v as Blob, 'ad.jpg');
      else fd.append(k, String(v));
    }
    return (await api.post<CommunityAd>('/admin/community/ads', fd)).data;
  });
}

export function useArchiveAd() {
  return useInvalidating(async (id: string) => {
    await api.post(`/admin/community/ads/${id}/archive`);
  });
}
```

Note on admin delete: `DELETE /community/posts/:id` works for admins before launch (admins bypass `community_disabled`) — that's why the wall's "Borrar" uses the `/community` route.

- [ ] **Step 6: Run** `npx vitest run src/lib/community.test.ts` → PASS; type-check.

---

### Task 2: Reports tab

**Files:**
- Create: `frontend/src/components/admin/community/ReportsTab.tsx`
- Test: `frontend/src/components/admin/community/ReportsTab.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportsTab } from './ReportsTab';
import type { CommunityReport } from '@/hooks/useCommunity';

const mocks = vi.hoisted(() => ({ reports: [] as CommunityReport[], resolve: vi.fn() }));

vi.mock('@/hooks/useCommunity', () => ({
  useCommunityReports: () => ({ data: mocks.reports, isLoading: false }),
  useResolveReport: () => ({ mutateAsync: mocks.resolve, isPending: false }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const report = (over: Partial<CommunityReport>): CommunityReport => ({
  id: 'r1', target_type: 'post', target_id: 'p1', reason: 'offensive', note: null, status: 'open',
  created_at: '2026-09-18T00:00:00Z', age_hours: 2, reporter: { id: 'u1', name: 'Ana' },
  content: { body: 'contenido feo', author_id: 'u2', author_name: 'Beto', hidden: false, media: [], post_id: 'p1' },
  ...over,
});

beforeEach(() => {
  mocks.resolve.mockReset();
  mocks.resolve.mockResolvedValue(undefined);
  mocks.reports = [report({})];
});

describe('ReportsTab', () => {
  it('shows the reported content and author', () => {
    render(<ReportsTab />);
    expect(screen.getByText('contenido feo')).toBeInTheDocument();
    expect(screen.getByText(/Beto/)).toBeInTheDocument();
    expect(screen.getByText('Ofensivo')).toBeInTheDocument();
  });

  it('age is red only after 20 h', () => {
    mocks.reports = [report({ id: 'a', age_hours: 19 }), report({ id: 'b', age_hours: 21 })];
    render(<ReportsTab />);
    const ages = screen.getAllByTestId('report-age');
    expect(ages[0].className).not.toMatch(/text-red/);
    expect(ages[1].className).toMatch(/text-red/);
  });

  it('hide and dismiss call resolve with the action', async () => {
    render(<ReportsTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar' }));
    expect(mocks.resolve).toHaveBeenCalledWith({ id: 'r1', action: 'hide' });
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(mocks.resolve).toHaveBeenCalledWith({ id: 'r1', action: 'dismiss' });
  });

  it('mute sends the chosen number of days', () => {
    render(<ReportsTab />);
    fireEvent.change(screen.getByLabelText('Días de silencio'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: /Silenciar/ }));
    expect(mocks.resolve).toHaveBeenCalledWith({ id: 'r1', action: 'mute', mute_days: 7 });
  });

  it('empty state', () => {
    mocks.reports = [];
    render(<ReportsTab />);
    expect(screen.getByText('No hay denuncias pendientes.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement `ReportsTab.tsx`**

```tsx
import { useState } from 'react';
import { toast } from 'sonner';
import { useCommunityReports, useResolveReport, type CommunityReport } from '@/hooks/useCommunity';
import { REPORT_REASON_LABEL, fmtAge, reportAgeTone } from '@/lib/community';
import { cn } from '@/lib/utils';

export function ReportsTab() {
  const { data: reports, isLoading } = useCommunityReports('open');
  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (!reports || reports.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay denuncias pendientes.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Respondé cada denuncia dentro de las 24 h. Se ponen en rojo pasadas las 20 h.
      </p>
      {reports.map((r) => (
        <ReportCard key={r.id} report={r} />
      ))}
    </div>
  );
}

function ReportCard({ report }: { report: CommunityReport }) {
  const resolve = useResolveReport();
  const [days, setDays] = useState('3');
  const danger = reportAgeTone(report.age_hours) === 'danger';

  async function run(action: 'hide' | 'dismiss' | 'mute') {
    try {
      await resolve.mutateAsync(
        action === 'mute' ? { id: report.id, action, mute_days: Number(days) } : { id: report.id, action },
      );
      toast.success(action === 'dismiss' ? 'Denuncia descartada' : 'Denuncia resuelta');
    } catch {
      toast.error('No se pudo resolver la denuncia');
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-red-500/10 px-2 py-0.5 font-semibold text-red-700 dark:text-red-400">
          {REPORT_REASON_LABEL[report.reason]}
        </span>
        <span className="text-muted-foreground">
          {report.target_type === 'post' ? 'Publicación' : 'Comentario'} · denunció {report.reporter.name}
        </span>
        <span
          data-testid="report-age"
          className={cn('ml-auto font-mono tabular-nums', danger ? 'font-bold text-red-600' : 'text-muted-foreground')}
        >
          hace {fmtAge(report.age_hours)}
        </span>
      </div>
      {report.content ? (
        <div className="mt-3 rounded-md bg-muted/50 p-3 text-sm">
          <div className="mb-1 text-xs font-semibold">
            {report.content.author_name}
            {report.content.hidden && <span className="ml-2 text-muted-foreground">(ya oculto)</span>}
          </div>
          <p className="whitespace-pre-wrap">{report.content.body}</p>
          {report.content.media.length > 0 && (
            <div className="mt-2 flex gap-2">
              {report.content.media.map((m) => (
                <img key={m.thumb_url} src={m.thumb_url} alt="" className="size-16 rounded object-cover" />
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">El contenido ya fue borrado.</p>
      )}
      {report.note && <p className="mt-2 text-xs text-muted-foreground">Nota: {report.note}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => run('hide')} disabled={resolve.isPending}
          className="h-8 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60">
          Ocultar
        </button>
        <button type="button" onClick={() => run('dismiss')} disabled={resolve.isPending}
          className="h-8 rounded-md border border-border px-3 text-xs font-semibold disabled:opacity-60">
          Descartar
        </button>
        <label className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <span className="sr-only">Días de silencio</span>
          <select aria-label="Días de silencio" value={days} onChange={(e) => setDays(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs">
            {[1, 3, 7, 30].map((d) => (
              <option key={d} value={d}>{d} {d === 1 ? 'día' : 'días'}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => run('mute')} disabled={resolve.isPending}
          className="h-8 rounded-md border border-red-500/40 px-3 text-xs font-semibold text-red-700 disabled:opacity-60 dark:text-red-400">
          Silenciar {days} {days === '1' ? 'día' : 'días'}
        </button>
      </div>
    </div>
  );
}
```

(`getByLabelText('Días de silencio')` resolves via `aria-label` on the select; drop the `sr-only` span if Testing Library reports two matches.)

- [ ] **Step 4: Run** `npx vitest run src/components/admin/community/ReportsTab.test.tsx` → PASS.

---

### Task 3: Ads tab

**Files:**
- Create: `frontend/src/components/admin/community/AdsTab.tsx`
- Test: `frontend/src/components/admin/community/AdsTab.test.tsx`

**Behavior:** Top: "Nueva publicidad" form (fields per `AdFormValues`; image input `accept="image/jpeg,image/png,image/webp"`; on submit run `validateAdForm`, show errors under each field, and only if valid compress with `prepareImage(file)` and call `useCreateAd().mutateAsync({ ..., monthly_fee_ars: Number(...), image: prepared.image })`, then reset + `toast.success('Publicidad creada')`). Text under the amount: "El monto no se puede editar después. Para cambiarlo, dala de baja y creá otra." Then three sections from `groupAds`: **Vigentes**, **Próximas**, **Vencidas / dadas de baja** — each row: image thumb, brand, `dd/mm – dd/mm`, `fmtARS(monthly_fee_ars)`/mes, buttons "Ver métricas" and (not for ended) "Dar de baja" (confirm with `window.confirm('¿Dar de baja esta publicidad? Deja de mostrarse en el muro.')`). Selecting "Ver métricas" shows a detail panel: KPIs Vistas / Clics / Alcance, `<Sparkline data={metrics.daily.map(d => d.views)} />` (from `@/components/admin/Sparkline`, renders nothing with <2 points), and button **"Copiar reporte"** → `navigator.clipboard.writeText(buildAdReport(ad, metrics))` + `toast.success('Reporte copiado')`.

- [ ] **Step 1: Failing test** — `AdsTab.test.tsx`

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdsTab } from './AdsTab';
import type { CommunityAd } from '@/hooks/useCommunity';

const mocks = vi.hoisted(() => ({
  ads: [] as CommunityAd[],
  create: vi.fn(),
  archive: vi.fn(),
  metrics: { views: 1200, clicks: 36, reach: 85, daily: [] as Array<{ day: string; views: number; clicks: number }> },
}));

vi.mock('@/hooks/useCommunity', () => ({
  useCommunityAds: () => ({ data: mocks.ads, isLoading: false }),
  useCreateAd: () => ({ mutateAsync: mocks.create, isPending: false }),
  useArchiveAd: () => ({ mutateAsync: mocks.archive, isPending: false }),
  useAdMetrics: (id: string | null) => ({ data: id ? mocks.metrics : undefined, isLoading: false }),
}));
vi.mock('@/lib/image', () => ({
  prepareImage: async () => ({ image: new Blob(['x']), thumb: new Blob(['t']), width: 10, height: 10 }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ad: CommunityAd = {
  id: 'ad1', brand_name: 'Proteína X', body: '', image_url: 'https://img', cta_label: 'Ver', cta_url: 'https://x.example',
  monthly_fee_ars: 50000, starts_on: '2026-10-01', ends_on: '2026-10-31', archived_at: null,
  created_at: '2026-09-01T00:00:00Z', status: 'active',
};

beforeEach(() => {
  mocks.ads = [ad];
  mocks.create.mockReset().mockResolvedValue(ad);
  mocks.archive.mockReset().mockResolvedValue(undefined);
});

describe('AdsTab', () => {
  it('shows validation errors and does not submit an empty form', async () => {
    render(<AdsTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Crear publicidad' }));
    expect(await screen.findByText('Ingresá la marca')).toBeInTheDocument();
    expect(screen.getByText('Subí una imagen')).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('submits a valid ad with a numeric fee', async () => {
    render(<AdsTab />);
    fireEvent.change(screen.getByLabelText('Marca'), { target: { value: 'Marca' } });
    fireEvent.change(screen.getByLabelText('Texto del botón'), { target: { value: 'Comprar' } });
    fireEvent.change(screen.getByLabelText('Link'), { target: { value: 'https://marca.example' } });
    fireEvent.change(screen.getByLabelText('Monto mensual (ARS)'), { target: { value: '50000' } });
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-12-31' } });
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Imagen'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear publicidad' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    expect(mocks.create.mock.calls[0][0]).toMatchObject({ brand_name: 'Marca', monthly_fee_ars: 50000, starts_on: '2026-10-01' });
  });

  it('lists active ads and copies the WhatsApp report', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<AdsTab />);
    expect(screen.getByText('Proteína X')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver métricas' }));
    expect(screen.getByText('1.200')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copiar reporte' }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toContain('Proteína X');
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement `AdsTab.tsx`** following the Behavior block. Every form field must be a `<label>` wrapping its input with the exact label text used in the test (`Marca`, `Texto`, `Texto del botón`, `Link`, `Monto mensual (ARS)`, `Desde`, `Hasta`, `Imagen`) so `getByLabelText` works — e.g.

```tsx
<label className="flex flex-col text-xs text-muted-foreground">
  Marca
  <input value={v.brand_name} onChange={(e) => set('brand_name', e.target.value)} className={field} />
  {errors.brand_name && <span className="mt-1 text-red-600">{errors.brand_name}</span>}
</label>
```

Numbers shown in the metrics panel use `new Intl.NumberFormat('es-AR').format(n)` (so 1200 → `1.200`). Use `fmtARS` from `@/lib/format` for money and `fmtShortDate` for dates. Submit handler:

```tsx
async function onSubmit(e: React.FormEvent) {
  e.preventDefault();
  const errs = validateAdForm(v);
  setErrors(errs);
  if (Object.keys(errs).length > 0) return;
  try {
    const prepared = await prepareImage(v.image!);
    await create.mutateAsync({
      brand_name: v.brand_name.trim(), body: v.body.trim(), cta_label: v.cta_label.trim(),
      cta_url: v.cta_url.trim(), monthly_fee_ars: Number(v.monthly_fee_ars),
      starts_on: v.starts_on, ends_on: v.ends_on, image: prepared.image,
    });
    setV(EMPTY);
    toast.success('Publicidad creada');
  } catch {
    toast.error('No se pudo crear la publicidad');
  }
}
```

- [ ] **Step 4: Run** → PASS.

---

### Task 4: Publish tab + Wall tab + page + route + sidebar

**Files:**
- Create: `frontend/src/components/admin/community/PublishTab.tsx`, `frontend/src/components/admin/community/WallTab.tsx`, `frontend/src/pages/admin/Community.tsx`
- Modify: `frontend/src/App.tsx`, `frontend/src/components/admin/Sidebar.tsx`

**PublishTab behavior:** segmented choice Aviso / Evento (`kind`), textarea "Texto" (max 2000, counter), optional photo (`accept="image/jpeg,image/png,image/webp"`, one file; show local preview via `URL.createObjectURL`), when Evento: "Lugar" text + "Fecha y hora" `<input type="datetime-local">`, checkbox "Fijar arriba". Right column (stacked on mobile): **Vista previa** card mimicking a wall post: coach badge "Coach", kind chip (Aviso/Evento), body with `whitespace-pre-wrap`, photo, event box with place + formatted date (`new Date(value).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })`). Submit: `validatePublishForm`; if a photo is present `prepareImage(file)`; `event_starts_at: new Date(localValue).toISOString()`; call `useCreateCommunityPost().mutateAsync`. On `AxiosError` with `response.data.error === 'pin_limit'` → `toast.error('Ya hay 3 publicaciones fijadas. Desfijá una desde el Muro.')`; other errors → `toast.error('No se pudo publicar')`. Success → reset + `toast.success('Publicado. Les llega un aviso a todos los alumnos.')`.

**WallTab behavior:** checkbox "Mostrar ocultas" (default **on**) → `useCommunityWall(showHidden)`; list posts (author name + "Coach" badge when `is_coach`, relative date via `fmtTimeAgo`, kind chip, category, body, thumbs of `media` using `thumb_url`, counts ❤ like_count · 💬 comment_count, event box with `rsvp_count` asistentes). Hidden posts: `opacity-50` + "Oculta" chip. Actions per post: Ocultar/Restaurar (`useSetPostHidden`), Fijar/Desfijar (`useSetPostPinned`; `pin_limit` 409 → toast as above), Borrar (`window.confirm('¿Borrar esta publicación? No se puede deshacer.')` → `useDeleteCommunityPost`), and for events "Ver asistentes" (toggles an inline list from `useEventRsvps(post.id)`). "Cargar más" button when `hasNextPage` → `fetchNextPage()`.

**Community page:**

```tsx
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/admin/PageHeader';
import { AdminTabs } from '@/components/admin/AdminTabs';
import { PublishTab } from '@/components/admin/community/PublishTab';
import { WallTab } from '@/components/admin/community/WallTab';
import { ReportsTab } from '@/components/admin/community/ReportsTab';
import { AdsTab } from '@/components/admin/community/AdsTab';
import { useCommunityReportCount, useCommunitySummary } from '@/hooks/useCommunity';

type TabKey = 'publish' | 'wall' | 'reports' | 'ads';
const TABS: TabKey[] = ['publish', 'wall', 'reports', 'ads'];

export default function Community() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as TabKey | null;
  const tab: TabKey = raw && TABS.includes(raw) ? raw : 'publish';
  const { data: openCount } = useCommunityReportCount();
  const { data: summary } = useCommunitySummary();

  return (
    <div>
      <PageHeader
        eyebrow="Comunidad"
        title="Comunidad"
        sub={
          summary && !summary.enabled
            ? 'El módulo todavía no está lanzado: los alumnos no ven el muro. Podés cargar avisos y publicidad.'
            : 'Muro de la comunidad, denuncias y publicidad.'
        }
      />
      <AdminTabs<TabKey>
        tabs={[
          { key: 'publish', label: 'Publicar' },
          { key: 'wall', label: 'Muro' },
          { key: 'reports', label: 'Denuncias', count: openCount ?? undefined },
          { key: 'ads', label: 'Publicidad' },
        ]}
        value={tab}
        onChange={(k) => setParams({ tab: k })}
      />
      {tab === 'publish' && <PublishTab />}
      {tab === 'wall' && <WallTab />}
      {tab === 'reports' && <ReportsTab />}
      {tab === 'ads' && <AdsTab />}
    </div>
  );
}
```

- [ ] **Step 1:** Implement `PublishTab.tsx`, `WallTab.tsx`, `Community.tsx` per the behavior blocks.
- [ ] **Step 2: Route** — `App.tsx`: `import AdminCommunity from '@/pages/admin/Community';` and inside the same `<Route>` group as `/admin/platform-fee` (the RequireAdmin + AdminShell group) add `<Route path="/admin/community" element={<AdminCommunity />} />`.
- [ ] **Step 3: Sidebar** — import `MessagesSquare` from `lucide-react` and `useCommunityReportCount` from `@/hooks/useCommunity`; `const { data: openReports } = useCommunityReportCount();`; add to the **Gestión** group after "Rutinas":

```ts
        {
          key: 'community',
          label: 'Comunidad',
          icon: MessagesSquare,
          to: '/admin/community',
          count: openReports ?? 0,
          matchPrefixes: ['/admin/community'],
        },
```

  Check `Topbar.navigation.test.tsx` / any Sidebar test that renders `Sidebar` with mocked hooks: if they mock `@/hooks/useAdminUsers` etc. individually, add `vi.mock('@/hooks/useCommunity', () => ({ useCommunityReportCount: () => ({ data: 0 }) }))` to them so they don't hit the network (msw errors on unhandled requests).
- [ ] **Step 4:** `npx tsc -b --noEmit` → clean; `npx vitest run` (whole frontend suite) → all pass.

---

### Task 5: Dashboard cards

**Files:** Modify `frontend/src/pages/admin/Dashboard.tsx`

- [ ] **Step 1:** Add a `CommunityRow` component rendered right after `<CuotasRow … />`:

```tsx
function CommunityRow() {
  const { data: openReports } = useCommunityReportCount();
  const { data: summary } = useCommunitySummary();
  const showReports = (openReports ?? 0) > 0;
  const days = summary?.days_to_revision;
  const showRevision = !!summary && !summary.revision_applied_at && days != null && days >= 0 && days <= 15;
  if (!showReports && !showRevision) return null;
  return (
    <div className="mb-[22px] grid grid-cols-1 gap-[14px] sm:grid-cols-2">
      {showReports && (
        <Link to="/admin/community?tab=reports" className="block">
          <KpiCard
            eyebrow="Denuncias pendientes"
            value={openReports}
            sub="Respondé dentro de las 24 h"
            highlighted
          />
        </Link>
      )}
      {showRevision && summary && (
        <Link to="/admin/platform-fee" className="block">
          <KpiCard
            eyebrow="Revisión de Comunidad"
            value={days === 0 ? 'Hoy' : `${days} días`}
            sub={`Promedio de publicidad ${fmtARS(summary.avg_ad_revenue)} · umbral ${fmtARS(summary.threshold_ars)}`}
          />
        </Link>
      )}
    </div>
  );
}
```

  Imports: `useCommunityReportCount`, `useCommunitySummary` from `@/hooks/useCommunity`; `fmtARS` from `@/lib/format` (if not already imported); `Link` is already used in the file. Match the grid/gap classes to the existing `CuotasRow` wrapper.
- [ ] **Step 2:** If a Dashboard test exists that renders `Dashboard`, mock `@/hooks/useCommunity` there (`useCommunityReportCount: () => ({ data: 0 })`, `useCommunitySummary: () => ({ data: undefined })`). Run `npx vitest run` → pass.

---

### Task 6: PlatformFee integration

**Files:** Modify `frontend/src/hooks/usePlatformFee.ts`, `frontend/src/pages/admin/PlatformFee.tsx`, `frontend/src/pages/admin/PlatformFee.test.tsx`

- [ ] **Step 1: Types** — `usePlatformFee.ts`:
  - `PlatformFeeSummary` += `community_fee_ars: number; ad_revenue_ars: number; ad_share_pct: number; ad_share_ars: number;`
  - `PlatformFeeConfig` += `community_fee_ars: number; community_fallback_fee_ars: number; community_revision_threshold_ars: number; ad_share_pct: number; community_launched_on: string | null; community_revision_applied_at: string | null;`
  - `PlatformFeeHistoryRow` += `community_fee_ars: number; ad_revenue_ars: number; ad_share_ars: number;`
  - Check `useUpdatePlatformFeeConfig`'s payload type; widen it to accept `number | string | null` values.

- [ ] **Step 2: Failing test** — in `PlatformFee.test.tsx`, add the new fields to the mocked `summary` (`community_fee_ars: 30000, ad_revenue_ars: 100000, ad_share_pct: 15, ad_share_ars: 15000`) and `config` (`community_fee_ars: 30000, community_fallback_fee_ars: 40000, community_revision_threshold_ars: 50000, ad_share_pct: 15, community_launched_on: '2026-10-01', community_revision_applied_at: null`), and mock the community hook:

```ts
vi.mock('@/hooks/useCommunity', () => ({
  useCommunitySummary: () => ({
    data: {
      enabled: true, launched_on: '2026-10-01', revision_date: '2027-04-01', days_to_revision: 120,
      ad_revenue_this_month: 100000, ad_share_this_month: 15000, avg_ad_revenue: 42000,
      projected_community_fee: 40000, revision_applied_at: null, community_fee_ars: 30000, threshold_ars: 50000,
    },
  }),
}));
```

  Add tests:

```ts
  it('shows the community breakdown rows', () => {
    render(<PlatformFee />);
    expect(screen.getByText('Comunidad (fijo)')).toBeInTheDocument();
    expect(screen.getByText(/15% sobre publicidad/)).toBeInTheDocument();
  });

  it('shows the revision card with the projection', () => {
    render(<PlatformFee />);
    expect(screen.getByText('Revisión de Comunidad')).toBeInTheDocument();
    expect(screen.getByText(/120 días/)).toBeInTheDocument();
  });
```

  (If `PlatformFee.test.tsx` wraps `render` in providers/helpers, follow the file's existing pattern.) Also add a test that when `community_fee_ars` is 0 (module off) the "Comunidad (fijo)" row is not rendered.

- [ ] **Step 3: Run** → FAIL.

- [ ] **Step 4: Implement in `PlatformFee.tsx`:**
  1. In the invoice `<dl>`, after the revenue-share row, when `summary.community_fee_ars > 0`:

```tsx
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Comunidad (fijo)</dt>
            <dd className="tabular-nums">{fmtARS(summary.community_fee_ars)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Publicidad de {realMonthLabel}</dt>
            <dd className="tabular-nums">{fmtARS(summary.ad_revenue_ars)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{summary.ad_share_pct}% sobre publicidad de {realMonthLabel}</dt>
            <dd className="tabular-nums">{fmtARS(summary.ad_share_ars)}</dd>
          </div>
```

  2. A **"Revisión de Comunidad"** card (`useCommunitySummary()`), rendered when `summary.enabled`, placed after the invoice card:
     - Not applied: "Fecha de revisión: {dd/mm/yyyy of revision_date} · faltan {days_to_revision} días"; "Promedio de publicidad hasta hoy: {fmtARS(avg_ad_revenue)} (umbral {fmtARS(threshold_ars)})" with a green/amber dot depending on `avg >= threshold`; "Fee proyectado: {fmtARS(projected_community_fee)}". Explainer line: "Si el promedio mensual de publicidad de los primeros 6 meses es menor al umbral, el fee fijo pasa de {fmtARS(config.community_fee_ars)} a {fmtARS(config.community_fallback_fee_ars)}. El 15% se mantiene."
     - Applied: "Revisión aplicada el {fmtShortDate(revision_applied_at)}. Fee fijo de Comunidad: {fmtARS(community_fee_ars)}."
     Use the existing `ddmmyyyy` helper for dates.
  3. `ConfigEditor`: extend the `config` prop type and add fields — "Comunidad: fee fijo (ARS)", "Comunidad: fee si no llega al umbral (ARS)", "Comunidad: umbral de publicidad (ARS)", "% sobre publicidad", "Lanzamiento de Comunidad" (`<input type="date">`, empty = apagado). Include them in the `onSave` patch: numbers via `Number(...)`, and `community_launched_on: launched || null`. Widen `onSave`'s patch type to `Record<string, number | string | null>`. Add a short hint under the launch field: "Al cargar la fecha, los alumnos ven la Comunidad y empieza a cobrarse el fee. Los 6 meses de revisión cuentan desde acá."
  4. If the history table renders columns per row, add a "Comunidad" column showing `fmtARS(row.community_fee_ars + row.ad_share_ars)` — only if that table exists and is simple to extend; otherwise skip and note it.

- [ ] **Step 5: Run** `npx vitest run src/pages/admin/PlatformFee.test.tsx` → PASS.

---

### Task 7: Terms — community rules

**Files:** Modify `frontend/src/pages/Terms.tsx`

- [ ] **Step 1:** Insert a new section right after section "5. Uso aceptable" and renumber every following `<h2>` (+1). Change `updated="29 de junio de 2026"` to `updated="18 de septiembre de 2026"`. Content:

```tsx
      <h2>6. Comunidad</h2>
      <p>
        La Comunidad es un espacio dentro de la app donde los alumnos y el
        coach pueden publicar textos y fotos, comentar y dar "me gusta". Para
        publicar o comentar tenés que aceptar estas normas.
      </p>
      <p>
        <strong>Tolerancia cero con el contenido ofensivo.</strong> No está
        permitido publicar contenido ofensivo, discriminatorio, violento,
        sexual, que acose o amenace a otras personas, spam, publicidad no
        autorizada ni información personal de terceros.
      </p>
      <ul>
        <li>
          Cualquier usuario puede denunciar una publicación o comentario desde
          la app. Revisamos las denuncias dentro de las 24 horas.
        </li>
        <li>
          Podés bloquear a otro usuario: dejás de ver su contenido y esa
          persona deja de ver el tuyo.
        </li>
        <li>
          Podemos ocultar contenido que no cumpla estas normas y silenciar o
          suspender la cuenta de quien las incumpla, sin aviso previo.
        </li>
        <li>
          Sos responsable de lo que publicás. Al publicar fotos declarás que
          tenés derecho a compartirlas.
        </li>
        <li>
          Las publicaciones marcadas como "Publicidad" son de marcas que
          colaboran con TR-Fit.
        </li>
      </ul>
```

- [ ] **Step 2:** `npx tsc -b --noEmit` and `npx vitest run` → clean.

---

### Task 8: Final verification

- [ ] `cd frontend && npx tsc -b --noEmit` → 0 errors.
- [ ] `cd frontend && npx vitest run` → all pass.
- [ ] `cd frontend && npx vite build` → succeeds.
- [ ] `npx prettier --write` on every file you created/modified (only those).
- [ ] Summary: files, results, deviations (e.g. skipped history column).
