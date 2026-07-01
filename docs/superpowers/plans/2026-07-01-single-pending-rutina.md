# Single Pending Rutina Per User — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guarantee at most one pending rutina per athlete in the admin cola, reject regeneration while one is in review, and disable the app's "Regenerar plan" button when a pending rutina exists.

**Architecture:** Backend rejects `POST /athlete/skeleton/regenerate` with `409` when a `pending_review` skeleton already exists (checked race-safely inside the existing advisory lock), exposes a `pendingReview` boolean on `GET /athlete/me`, and dedups the admin cola query to the latest pending per athlete. The app reads `pendingReview` and disables the regenerate button, with a `409` catch as a race backstop.

**Tech Stack:** Backend — Node 20, Express 4, TypeScript (ESM), PostgreSQL 15 (`pg`), Jest (ts-jest ESM, integration tests against a live `trfit_test` DB). App — React Native / Expo, TypeScript, Jest + `@testing-library/react-native`.

## Global Constraints

- Two repos. Backend/admin: `/Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web` (paths below are relative to `backend/` unless noted). App: `/Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app`.
- Backend integration tests require a running Postgres test DB (`trfit_test`, default `postgres://postgres:postgres@localhost:5432/trfit_test`). Start it before running any backend test step (e.g. `npm run start:dev`'s Postgres, or `docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres`).
- Backend test runner: `npm test` = `node --experimental-vm-modules node_modules/jest/bin/jest.js`. Run a single file with `npm test -- <path>` and a single case with `-t '<name>'`.
- Code style: single quotes, semicolons, 2-space indent, ES module imports use `.js` extension for local files (e.g. `import { x } from './y.js'`). Follow surrounding code.
- Exact rejection copy (used verbatim in route and app): `Ya tenés una rutina en revisión. Esperá a que tu coach la apruebe.`
- Skeleton status enum: `'pending_review' | 'approved' | 'rejected' | 'superseded'`.

---

## File Structure

**Backend (`tr-fit-web/backend`)**
- `src/services/skeleton-regen.service.ts` — add `PendingReviewExistsError` + pre-generation guard.
- `src/routes/athlete.ts` — map the error to `409` on regenerate; add `pendingReview` to `GET /me`.
- `src/services/skeleton.service.ts` — dedup `listPendingForCoach` to one row per athlete.
- `tests/integration/skeleton-regen-service.test.ts` — new guard test + updated concurrency test.
- `tests/integration/athlete-routes.test.ts` — `pendingReview` assertions (or a new `pending-review-flag.test.ts` if the file's setup does not fit).
- `tests/integration/admin-rutinas.test.ts` — dedup assertion (or `skeleton.service` unit-level via pool inserts).

**App (`tr-fit-app`)**
- `lib/athlete-profile.ts` — expose `pendingReview`.
- `components/ui/SettingsRow.tsx` — add `disabled` prop.
- `app/(app)/athlete/profile.tsx` — disable button on pending; add `409` catch.
- `__tests__/athlete-profile.test.ts` — update shape assertion + add `pendingReview` case.

---

## Task 1: Backend — reject regenerate when a pending rutina exists

**Files:**
- Modify: `backend/src/services/skeleton-regen.service.ts`
- Modify: `backend/src/routes/athlete.ts:45-51`
- Test: `backend/tests/integration/skeleton-regen-service.test.ts`

**Interfaces:**
- Consumes: existing `regenerateSkeleton(athleteId: string): Promise<{ ok: true; skeletonId: string }>`.
- Produces: `class PendingReviewExistsError extends Error` (exported from `skeleton-regen.service.ts`), thrown by `regenerateSkeleton` when a `pending_review` skeleton exists for the athlete. Route returns HTTP `409` with JSON body `{ message: string }`.

- [ ] **Step 1: Write the failing test — guard blocks a second pending**

Add to `backend/tests/integration/skeleton-regen-service.test.ts`. Note the top of the file already imports `regenerateSkeleton`; add `PendingReviewExistsError` to that same import line: `const { regenerateSkeleton, PendingReviewExistsError } = await import('../../src/services/skeleton-regen.service.js');`

```typescript
describe('regenerateSkeleton single-pending guard', () => {
  it('rejects a second regen while a pending_review skeleton exists', async () => {
    await ensureFirstExercise();
    const c = await createAdmin();
    const a = await createAthlete(c);
    await setTier(a, 'basico');

    const first = await regenerateSkeleton(a);
    expect(first.ok).toBe(true);

    await expect(regenerateSkeleton(a)).rejects.toBeInstanceOf(
      PendingReviewExistsError,
    );

    const rows = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM athlete_skeletons
        WHERE athlete_id = $1 AND status = 'pending_review'`,
      [a],
    );
    expect(rows.rows[0].n).toBe(1);
    // Second attempt must not call the (mocked) generator.
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it('allows regen again after the pending is approved/superseded', async () => {
    await ensureFirstExercise();
    const c = await createAdmin();
    const a = await createAthlete(c);
    await setTier(a, 'basico');

    await regenerateSkeleton(a);
    await pool.query(
      `UPDATE athlete_skeletons SET status = 'superseded'
        WHERE athlete_id = $1 AND status = 'pending_review'`,
      [a],
    );
    const again = await regenerateSkeleton(a);
    expect(again.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npm test -- tests/integration/skeleton-regen-service.test.ts -t 'single-pending guard'`
Expected: FAIL — `PendingReviewExistsError` is `undefined` (not exported yet) / second regen resolves instead of rejecting.

- [ ] **Step 3: Add the error class and the guard**

In `backend/src/services/skeleton-regen.service.ts`, add the exported error class near the top (after imports, before `RegenResult`):

```typescript
export class PendingReviewExistsError extends Error {
  statusCode = 409;
  constructor() {
    super('pending_review skeleton already exists for this athlete');
    this.name = 'PendingReviewExistsError';
  }
}
```

Then inside `regenerateSkeleton`, immediately after the advisory-lock query and **before** the profile load / `generateSkeleton` call, add the guard:

```typescript
    const pendingR = await client.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM athlete_skeletons
         WHERE athlete_id = $1 AND status = 'pending_review'
       ) AS exists`,
      [athleteId],
    );
    if (pendingR.rows[0].exists) {
      throw new PendingReviewExistsError();
    }
```

(The surrounding `try` already does `ROLLBACK` on throw, so the transaction unwinds cleanly and no OpenAI call is made.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npm test -- tests/integration/skeleton-regen-service.test.ts -t 'single-pending guard'`
Expected: PASS (both cases).

- [ ] **Step 5: Update the existing concurrency test for the new behavior**

The existing test `serializes concurrent calls via advisory lock — both succeed` is now wrong: with the guard, two concurrent regens produce exactly one pending — one call wins, the other rejects. Replace that `it(...)` block with:

```typescript
  it('serializes concurrent calls — one succeeds, the other is rejected', async () => {
    await ensureFirstExercise();
    const c = await createAdmin();
    const a = await createAthlete(c);
    await setTier(a, 'basico');

    const results = await Promise.allSettled([
      regenerateSkeleton(a),
      regenerateSkeleton(a),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      PendingReviewExistsError,
    );

    const rows = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM athlete_skeletons
        WHERE athlete_id = $1 AND status = 'pending_review'`,
      [a],
    );
    expect(rows.rows[0].n).toBe(1);
  });
```

- [ ] **Step 6: Run the whole regen test file**

Run: `cd backend && npm test -- tests/integration/skeleton-regen-service.test.ts`
Expected: PASS — all cases, including the updated concurrency test.

- [ ] **Step 7: Map the error to 409 in the route**

In `backend/src/routes/athlete.ts`, add the import (extend the existing regen import on line 12):

```typescript
import { regenerateSkeleton, PendingReviewExistsError } from '../services/skeleton-regen.service.js';
```

Replace the handler at lines 45-51 with:

```typescript
router.post('/skeleton/regenerate', async (req, res) => {
  // One pending rutina per athlete: reject while one is already in review.
  try {
    const result = await regenerateSkeleton(req.user!.id);
    res.status(201).json({
      skeletonId: result.skeletonId, status: 'pending_review',
    });
  } catch (e) {
    if (e instanceof PendingReviewExistsError) {
      return res.status(409).json({
        message: 'Ya tenés una rutina en revisión. Esperá a que tu coach la apruebe.',
      });
    }
    throw e;
  }
});
```

- [ ] **Step 8: Add a route-level test for the 409 body**

Append to `backend/tests/integration/skeleton-regen-service.test.ts` a test that drives the route. Check whether this file already builds an Express app / supertest agent; the integration suite uses `supertest` elsewhere (see `tests/integration/athlete-routes.test.ts` for the exact app-bootstrap + auth-token pattern). If wiring an app here is heavy, instead add this case to `tests/integration/athlete-routes.test.ts` following that file's existing setup, asserting:

```typescript
  it('POST /athlete/skeleton/regenerate returns 409 with message when a pending exists', async () => {
    // (using this file's existing authed-athlete agent + first successful regen)
    const first = await agent.post('/athlete/skeleton/regenerate').send({});
    expect(first.status).toBe(201);
    const second = await agent.post('/athlete/skeleton/regenerate').send({});
    expect(second.status).toBe(409);
    expect(second.body.message).toBe(
      'Ya tenés una rutina en revisión. Esperá a que tu coach la apruebe.',
    );
  });
```

Run: `cd backend && npm test -- tests/integration/athlete-routes.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web
git add backend/src/services/skeleton-regen.service.ts backend/src/routes/athlete.ts backend/tests/integration/skeleton-regen-service.test.ts backend/tests/integration/athlete-routes.test.ts
git commit -m "feat(rutinas): reject regenerate while a pending rutina is in review"
```

---

## Task 2: Backend — expose `pendingReview` on GET /athlete/me

**Files:**
- Modify: `backend/src/routes/athlete.ts:53-74`
- Test: `backend/tests/integration/athlete-routes.test.ts`

**Interfaces:**
- Consumes: existing `GET /athlete/me` handler and `pool`.
- Produces: `GET /athlete/me` JSON gains `pendingReview: boolean` (true iff a `pending_review` skeleton exists for the athlete).

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/integration/athlete-routes.test.ts` (reuse the file's authed-athlete agent):

```typescript
  it('GET /athlete/me returns pendingReview=false with no pending, true after regen', async () => {
    const before = await agent.get('/athlete/me');
    expect(before.status).toBe(200);
    expect(before.body.pendingReview).toBe(false);

    await agent.post('/athlete/skeleton/regenerate').send({});

    const after = await agent.get('/athlete/me');
    expect(after.body.pendingReview).toBe(true);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npm test -- tests/integration/athlete-routes.test.ts -t 'pendingReview'`
Expected: FAIL — `before.body.pendingReview` is `undefined`.

- [ ] **Step 3: Implement — add the EXISTS query and field**

In `backend/src/routes/athlete.ts` `GET /me`, after the existing `skeleton` load (around line 63) add:

```typescript
  const pendingR = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM athlete_skeletons
       WHERE athlete_id = $1 AND status = 'pending_review'
     ) AS exists`,
    [userId],
  );
```

Then add `pendingReview` to the response object (line 69-73):

```typescript
  res.json({
    profile, programState: state,
    skeletonStatus: skeleton.status,
    pendingReview: pendingR.rows[0].exists,
    blockedReason,
  });
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npm test -- tests/integration/athlete-routes.test.ts -t 'pendingReview'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web
git add backend/src/routes/athlete.ts backend/tests/integration/athlete-routes.test.ts
git commit -m "feat(athlete): expose pendingReview flag on GET /athlete/me"
```

---

## Task 3: Backend — dedup admin cola to one pending per athlete

**Files:**
- Modify: `backend/src/services/skeleton.service.ts:323-334` (`listPendingForCoach`)
- Test: `backend/tests/integration/admin-rutinas.test.ts`

**Interfaces:**
- Consumes: existing `listPendingForCoach(coachId: string)`.
- Produces: same row shape `{ id, athlete_id, created_at, generation_rationale, athlete_name }`, but at most one row per `athlete_id` (the most recent `created_at`), ordered `created_at ASC`.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/integration/admin-rutinas.test.ts` (this file already imports fixtures + pool; match its existing imports). If `listPendingForCoach` is not yet imported there, add `const { listPendingForCoach } = await import('../../src/services/skeleton.service.js');` alongside the file's other dynamic imports.

```typescript
  it('listPendingForCoach returns one row per athlete (latest pending)', async () => {
    const coach = await createAdmin();
    const athlete = await createAthlete(coach);

    // Two accumulated pending skeletons for the same athlete.
    await pool.query(
      `INSERT INTO athlete_skeletons
         (athlete_id, status, generated_by, generation_prompt, generation_rationale)
       VALUES
         ($1,'pending_review','ai','{}'::jsonb,'older'),
         ($1,'pending_review','ai','{}'::jsonb,'newer')`,
      [athlete],
    );
    // Force a deterministic ordering: make 'newer' the latest.
    await pool.query(
      `UPDATE athlete_skeletons SET created_at = now() - interval '1 hour'
        WHERE athlete_id = $1 AND generation_rationale = 'older'`,
      [athlete],
    );

    const list = await listPendingForCoach(coach);
    const forAthlete = list.filter((r) => r.athlete_id === athlete);
    expect(forAthlete).toHaveLength(1);
    expect(forAthlete[0].generation_rationale).toBe('newer');
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npm test -- tests/integration/admin-rutinas.test.ts -t 'one row per athlete'`
Expected: FAIL — returns 2 rows for the athlete.

- [ ] **Step 3: Implement — DISTINCT ON latest per athlete**

Replace the query in `listPendingForCoach` (`backend/src/services/skeleton.service.ts`) with:

```typescript
export async function listPendingForCoach(coachId: string) {
  const { rows } = await pool.query(
    `SELECT id, athlete_id, created_at, generation_rationale, athlete_name
       FROM (
         SELECT DISTINCT ON (s.athlete_id)
                s.id, s.athlete_id, s.created_at, s.generation_rationale,
                ap.name AS athlete_name
           FROM athlete_skeletons s
           JOIN athlete_profiles ap ON ap.user_id = s.athlete_id
          WHERE s.status = 'pending_review' AND ap.coach_id = $1
          ORDER BY s.athlete_id, s.created_at DESC
       ) t
      ORDER BY created_at ASC`,
    [coachId],
  );
  return rows;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npm test -- tests/integration/admin-rutinas.test.ts -t 'one row per athlete'`
Expected: PASS.

- [ ] **Step 5: Run the full admin-rutinas file to catch regressions**

Run: `cd backend && npm test -- tests/integration/admin-rutinas.test.ts`
Expected: PASS — existing pending-list tests still green (single-pending-per-athlete cases are unaffected).

- [ ] **Step 6: Commit**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web
git add backend/src/services/skeleton.service.ts backend/tests/integration/admin-rutinas.test.ts
git commit -m "feat(rutinas): dedup admin cola to latest pending per athlete"
```

---

## Task 4: App — expose `pendingReview` from useAthleteProfile

**Files:**
- Modify: `tr-fit-app/lib/athlete-profile.ts:30-52`
- Test: `tr-fit-app/__tests__/athlete-profile.test.ts`

**Interfaces:**
- Consumes: `GET /athlete/me` now returns `pendingReview: boolean` (Task 2).
- Produces: `useAthleteProfile()` returns `{ profile: AthleteProfileData | null; loading: boolean; pendingReview: boolean }` (`pendingReview` defaults to `false`).

- [ ] **Step 1: Update + add failing tests**

In `tr-fit-app/__tests__/athlete-profile.test.ts`:

(a) The existing assertion on line 78 checks the exact hook shape and will break. Change it to include the new field:

```typescript
    expect(result.current).toEqual({ profile: null, loading: true, pendingReview: false });
```

(b) Add `pendingReview` to `PROFILE_PAYLOAD` (line 40-53) — set it to `true`:

```typescript
  skeletonStatus: 'approved',
  blockedReason: null,
  pendingReview: true,
```

(c) Add a new case in the `useAthleteProfile` describe block:

```typescript
  it('exposes pendingReview from the API payload', async () => {
    (api.apiGet as jest.Mock).mockResolvedValueOnce(PROFILE_PAYLOAD);
    const { result } = renderHook(() => useAthleteProfile());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.pendingReview).toBe(true);
  });

  it('defaults pendingReview to false on API error', async () => {
    (api.apiGet as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useAthleteProfile());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.pendingReview).toBe(false);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app && npm test -- __tests__/athlete-profile.test.ts`
Expected: FAIL — `pendingReview` is `undefined` on the hook result; shape assertion mismatch.

- [ ] **Step 3: Implement in the hook**

In `tr-fit-app/lib/athlete-profile.ts`, add `pendingReview` to `MeResponse` (line 30-35):

```typescript
interface MeResponse {
  profile: AthleteProfileData | null;
  programState: unknown;
  skeletonStatus: string | null;
  pendingReview?: boolean;
  blockedReason: string | null;
}
```

Update the hook (line 37-52):

```typescript
export function useAthleteProfile(): {
  profile: AthleteProfileData | null;
  loading: boolean;
  pendingReview: boolean;
} {
  const [profile, setProfile] = useState<AthleteProfileData | null>(null);
  const [pendingReview, setPendingReview] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    apiGet<MeResponse>('/athlete/me')
      .then((r) => {
        if (cancelled) return;
        setProfile(r.profile ?? null);
        setPendingReview(r.pendingReview ?? false);
      })
      .catch(() => {
        if (cancelled) return;
        setProfile(null);
        setPendingReview(false);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  return { profile, loading, pendingReview };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app && npm test -- __tests__/athlete-profile.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app
git add lib/athlete-profile.ts __tests__/athlete-profile.test.ts
git commit -m "feat(profile): expose pendingReview from useAthleteProfile"
```

---

## Task 5: App — disable "Regenerar plan" when a rutina is pending

**Files:**
- Modify: `tr-fit-app/components/ui/SettingsRow.tsx`
- Modify: `tr-fit-app/app/(app)/athlete/profile.tsx` (button block ~352-359; `performRegen` 152-170; hook usage line 83)

**Interfaces:**
- Consumes: `useAthleteProfile()` → `pendingReview: boolean` (Task 4); `SettingsRow` gains `disabled?: boolean`.
- Produces: user-facing behavior only (no new exports).

- [ ] **Step 1: Add a `disabled` prop to SettingsRow**

In `tr-fit-app/components/ui/SettingsRow.tsx`, add `disabled?: boolean` to `Props`, dim the row and block press when set:

```typescript
interface Props {
  icon: LucideIcon;
  label: string;
  sub?: string;
  tone?: 'default' | 'brand';
  divider?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}

export function SettingsRow({
  icon,
  label,
  sub,
  tone = 'default',
  divider,
  disabled,
  onPress,
}: Props) {
```

Wrap the returned `content` view opacity and guard the Pressable:

```typescript
  const content = (
    <View
      className={`flex-row items-center gap-3 px-3.5 py-3 ${
        divider ? 'border-t border-border' : ''
      } ${disabled ? 'opacity-40' : ''}`}
    >
```

and at the end:

```typescript
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} disabled={disabled}>
      {content}
    </Pressable>
  );
```

- [ ] **Step 2: Wire pendingReview into the profile screen**

In `tr-fit-app/app/(app)/athlete/profile.tsx`, read the flag from the hook (line 83):

```typescript
  const { profile, loading: profileLoading, pendingReview } = useAthleteProfile();
```

Update `handleRegen` (line 172) to short-circuit when pending, and update the button. Replace the `SettingsRow` for "Regenerar plan" (lines 352-359) with:

```tsx
        <SettingsRow
          icon={RefreshCw}
          label="Regenerar plan"
          sub={
            pendingReview
              ? 'Rutina en revisión'
              : regenerating
                ? 'Generando…'
                : 'Crear un plan nuevo automáticamente'
          }
          tone="brand"
          divider
          disabled={pendingReview}
          onPress={pendingReview ? notifyPendingReview : handleRegen}
        />
```

Add the info-alert helper near `handleRegen`:

```typescript
  function notifyPendingReview() {
    Alert.alert(
      'Rutina en revisión',
      'Ya tenés una rutina en revisión. Esperá la aprobación de tu coach.',
    );
  }
```

- [ ] **Step 3: Add the 409 backstop to performRegen**

In `performRegen` (lines 157-166), add a `409` branch (in case the button is stale and the backend rejects):

```typescript
      if (e.status === 403) Alert.alert('No disponible', msg);
      else if (e.status === 409) Alert.alert('Rutina en revisión', msg);
      else if (e.status === 429) Alert.alert('Esperá un poco', msg);
      else Alert.alert('Error', 'Reintentá más tarde.');
```

- [ ] **Step 4: Type-check / lint the app**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app && npx tsc --noEmit && npm run lint`
Expected: no type errors, no new lint errors. (No component render test is added — the screen has no existing unit test and its heavy dependency graph — expo-router, nativewind, image-picker — makes one high-cost; the hook + backend tests cover the logic. If the repo later adds a screen harness, add a render test asserting the disabled state.)

- [ ] **Step 5: Commit**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app
git add components/ui/SettingsRow.tsx "app/(app)/athlete/profile.tsx"
git commit -m "feat(profile): disable regenerate button while a rutina is in review"
```

---

## Task 6: Full regression pass

**Files:** none (verification only).

- [ ] **Step 1: Backend full suite**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web/backend && npm test`
Expected: PASS. If any pre-existing pending-list or regen assertion elsewhere assumed multiple pendings per athlete or unconditional regen success, reconcile it with the new single-pending behavior.

- [ ] **Step 2: App full suite**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app && npm test`
Expected: PASS.

- [ ] **Step 3: Lint both**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web && npm run lint` and `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app && npm run lint`
Expected: no errors.

---

## Self-Review Notes

- **Spec coverage:** 409 guard → Task 1; `pendingReview` on `/me` → Task 2; admin cola one-per-user → Task 3; app hook flag → Task 4; app button disable + 409 backstop → Task 5. All spec sections mapped.
- **Behavior change captured:** the pre-existing concurrency test that expected both concurrent regens to succeed is explicitly rewritten in Task 1 Step 5 (one wins, one 409s).
- **Types:** `PendingReviewExistsError` (Task 1) is the single error type consumed by the route; `pendingReview: boolean` name is identical across backend response (Task 2), app `MeResponse`/hook (Task 4), and screen usage (Task 5).
