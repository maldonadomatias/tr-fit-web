# Admin "Reenviar email de verificación" Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.
> **auto-build host:** Claude plans+reviews; Grok implements via headless CLI.
> <!-- auto-build plan · 2026-08-07 · source: claude+writing-plans -->

**Goal:** Make the "Reenviar email de verificación" button in the admin user detail Soporte panel actually resend the verification email to *that user*, audited, instead of being a dead button.

**Architecture:** The existing `POST /api/auth/resend-verification` route is `requireAuth` and resends for `req.user.id` — the **caller's own** account. An admin hitting it would email *themselves*, so it cannot be reused from the admin panel. Add a thin admin route `POST /api/admin/users/:id/resend-verification` that calls the already-existing `resendVerification(userId)` service for the target user and writes an audit row, mirroring the existing `force-logout` admin route. Frontend gets a `useResendVerification(id)` mutation hook and wires the button, mirroring `useSendPasswordReset` which was wired in the previous commit.

**Tech Stack:** Express 4 + TypeScript (backend), Jest + supertest (backend tests), React 19 + TanStack Query + sonner toasts (frontend), Vitest + @testing-library/react (frontend tests).

## Global Constraints

- Do not open PRs, push, or commit. The user did not request it for this run.
- Minimal diffs. No drive-by refactors, no renaming existing symbols, no reformatting untouched lines.
- Do **not** create a DB migration. `admin_audit_log.type` is a plain `text` column with no CHECK constraint — a new audit type value needs no schema change.
- Do **not** add a rate limiter to the new admin route. It is behind `requireAuth, requireAdmin` (applied router-wide at `backend/src/routes/admin.ts:34`); the existing `resendVerifyLimiter` is keyed for the self-serve route and is not wanted here.
- Follow Prettier config: semicolons, single quotes, 80 print width, 2-space indent, ES5 trailing commas.
- Backend and frontend are ES modules — backend relative imports must carry the `.js` extension.
- All Spanish user-facing copy stays in Spanish (rioplatense, like the surrounding UI).

## File Structure

- Modify `backend/src/routes/admin.ts` — add the new route + import `resendVerification`.
- Modify `backend/src/services/admin.service.ts` — add `'verification_resent'` to the `AuditType` union and to `CATEGORY_TYPES.auth`.
- Create `backend/tests/integration/admin-resend-verification.test.ts` — integration coverage for the new route.
- Modify `frontend/src/types/api.ts` — add `'verification_resent'` to the frontend `AuditType` union.
- Modify `frontend/src/lib/activity.ts` — add the label for the new audit type (`LABELS` is a `Record<AuditType, string>`; TypeScript fails to compile without it).
- Modify `frontend/src/hooks/useAdminUsers.ts` — add `useResendVerification(id)`.
- Modify `frontend/src/hooks/useAdminUsers.test.tsx` — add hook tests.
- Modify `frontend/src/pages/admin/UserDetail.tsx` — wire the button inside `ResumenTab`.

---

### Task 1: Backend admin resend-verification route

**Files:**
- Modify: `backend/src/services/admin.service.ts` (the `AuditType` union ending at line ~368, and `CATEGORY_TYPES` at line ~584)
- Modify: `backend/src/routes/admin.ts` (import block line ~13, new route right after the `force-logout` route which ends around line ~548)
- Test: `backend/tests/integration/admin-resend-verification.test.ts` (create)

**Interfaces:**
- Consumes: `resendVerification(userId: string): Promise<{ emailSendFailed: boolean; alreadyVerified?: boolean }>` from `backend/src/services/auth.service.ts` (already exported, line ~404). `getUser`, `logAudit`, `actorEmail` already used by neighbouring routes in `admin.ts`.
- Produces: `POST /api/admin/users/:id/resend-verification` returning `200 { ok: true, emailSendFailed: boolean, alreadyVerified?: boolean }`, `404 { error: 'not_found' }` for an unknown user, `403` for non-admins. Audit row type `'verification_resent'`. The frontend hook in Task 2 depends on this exact shape.

- [ ] **Step 1: Write the failing integration test**

Create `backend/tests/integration/admin-resend-verification.test.ts`. It mirrors the module-mock style of `backend/tests/integration/auth.test.ts` (the Resend SDK must be mocked before `app.js` is imported) and the fixture style of `backend/tests/integration/admin-force-logout.test.ts`:

```ts
import { jest } from '@jest/globals';

jest.unstable_mockModule('resend', () => {
  const send = jest.fn();
  return {
    Resend: jest.fn().mockImplementation(() => ({ emails: { send } })),
    __mockSend: send,
  };
});

type MockSend = jest.Mock<
  (opts: {
    to: string;
    subject: string;
    html: string;
    from: string;
  }) => Promise<{ id: string }>
>;
const resendMod = (await import('resend')) as unknown as {
  __mockSend: MockSend;
};

const { resetDatabase, ensureMigrated, closePool } = await import(
  './helpers/test-db.js'
);
const { signToken } = await import('../../src/middleware/auth.js');
const { createAdmin, signupUserInDb, verifiedAthleteUser } = await import(
  './helpers/fixtures.js'
);
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const requestMod = await import('supertest');
const request = requestMod.default;
const appMod = await import('../../src/app.js');
const app = appMod.default;

beforeAll(async () => {
  await ensureMigrated();
});
beforeEach(async () => {
  await resetDatabase();
  resendMod.__mockSend.mockReset();
  resendMod.__mockSend.mockResolvedValue({ id: 'msg' });
});
afterAll(async () => {
  await closePool();
});

describe('POST /api/admin/users/:id/resend-verification', () => {
  it('emails a fresh verification token to the target user and audits it', async () => {
    const adminId = await createAdmin();
    const adminTok = signToken({ id: adminId, role: 'admin' });
    const email = `unverified-${Date.now()}@test.local`;
    const { id } = await signupUserInDb(email, 'test-pass-1234', false);

    const r = await request(app)
      .post(`/api/admin/users/${id}/resend-verification`)
      .set('Authorization', `Bearer ${adminTok}`);

    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.alreadyVerified).toBeUndefined();
    expect(r.body.emailSendFailed).toBe(false);

    // The email went to the athlete, not to the admin.
    expect(resendMod.__mockSend).toHaveBeenCalledTimes(1);
    expect(resendMod.__mockSend.mock.calls[0][0].to).toBe(email);

    // Exactly one live verification token, and the older one was invalidated.
    const live = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM email_verifications
        WHERE user_id = $1 AND used_at IS NULL`,
      [id]
    );
    expect(live.rows[0].n).toBe(1);

    const audit = await pool.query<{ type: string }>(
      `SELECT type FROM admin_audit_log
        WHERE target_id = $1 AND type = 'verification_resent'`,
      [id]
    );
    expect(audit.rowCount).toBe(1);
  });

  it('is a no-op for an already verified user', async () => {
    const adminId = await createAdmin();
    const adminTok = signToken({ id: adminId, role: 'admin' });
    const u = await verifiedAthleteUser();

    const r = await request(app)
      .post(`/api/admin/users/${u.id}/resend-verification`)
      .set('Authorization', `Bearer ${adminTok}`);

    expect(r.status).toBe(200);
    expect(r.body.alreadyVerified).toBe(true);
    expect(resendMod.__mockSend).not.toHaveBeenCalled();

    const audit = await pool.query(
      `SELECT 1 FROM admin_audit_log
        WHERE target_id = $1 AND type = 'verification_resent'`,
      [u.id]
    );
    expect(audit.rowCount).toBe(0);
  });

  it('returns 404 for an unknown user', async () => {
    const adminId = await createAdmin();
    const adminTok = signToken({ id: adminId, role: 'admin' });
    const r = await request(app)
      .post(
        '/api/admin/users/00000000-0000-0000-0000-000000000000/resend-verification'
      )
      .set('Authorization', `Bearer ${adminTok}`);
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('not_found');
  });

  it('a non-admin cannot resend anyone else’s verification', async () => {
    const u = await verifiedAthleteUser();
    const victim = await verifiedAthleteUser();
    const athleteTok = signToken({ id: u.id, role: 'athlete' });
    const r = await request(app)
      .post(`/api/admin/users/${victim.id}/resend-verification`)
      .set('Authorization', `Bearer ${athleteTok}`);
    expect(r.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
docker start tr-fit-web-postgres-1
cd backend && TEST_DATABASE_URL='postgres://<user>:<pass>@localhost:5433/trfit_test' npx jest tests/integration/admin-resend-verification.test.ts
```

Expected: FAIL — the route does not exist, so the first three cases get `404` from the Express fallback and the audit/email assertions never pass.

Note: `TEST_DATABASE_URL` is required; the `jest.setup.ts` default (the 5432 default) does not match the local container.

- [ ] **Step 3: Add the audit type**

In `backend/src/services/admin.service.ts`, extend the `AuditType` union (it currently ends with `| 'force_logout';`):

```ts
  | 'athlete_rm_changed'
  | 'force_logout'
  | 'verification_resent';
```

And add it to the `auth` category in `CATEGORY_TYPES` so the Actividad filter shows it:

```ts
  auth: [
    'email_verified',
    'email_unverified',
    'role_changed',
    'force_logout',
    'verification_resent',
  ],
```

- [ ] **Step 4: Add the admin route**

In `backend/src/routes/admin.ts`, extend the existing auth.service import (currently `import { forceLogout } from '../services/auth.service.js';`):

```ts
import { forceLogout, resendVerification } from '../services/auth.service.js';
```

Then add the route immediately after the `POST /users/:id/force-logout` handler:

```ts
// Resend the verification email to a user from the admin panel. Reuses the
// same single-use token flow the athlete triggers from the app — the
// self-serve /auth/resend-verification route only works on the caller's own
// account, so it can't be used here.
router.post(
  '/users/:id/resend-verification',
  async (req: Request, res: Response) => {
    const before = await getUser(req.params.id);
    if (!before) return res.status(404).json({ error: 'not_found' });

    const out = await resendVerification(req.params.id);
    if (!out.alreadyVerified) {
      await logAudit({
        type: 'verification_resent',
        actor: await actorEmail(req),
        target: before.email,
        target_id: req.params.id,
      });
    }
    res.json({ ok: true, ...out });
  }
);
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd backend && TEST_DATABASE_URL='postgres://<user>:<pass>@localhost:5433/trfit_test' npx jest tests/integration/admin-resend-verification.test.ts
```

Expected: PASS, 4/4.

- [ ] **Step 6: Verify nothing else broke**

```bash
cd backend && npx tsc --noEmit
cd backend && TEST_DATABASE_URL='postgres://<user>:<pass>@localhost:5433/trfit_test' npx jest tests/integration/admin-force-logout.test.ts tests/integration/auth.test.ts
```

Expected: `tsc` prints nothing; both existing suites pass.

---

### Task 2: Wire the frontend button

**Files:**
- Modify: `frontend/src/types/api.ts` (the `AuditType` union at line ~165)
- Modify: `frontend/src/lib/activity.ts` (the `LABELS` record at line ~3)
- Modify: `frontend/src/hooks/useAdminUsers.ts` (add hook next to `useSendPasswordReset`)
- Modify: `frontend/src/hooks/useAdminUsers.test.tsx` (add a describe block)
- Modify: `frontend/src/pages/admin/UserDetail.tsx` (`ResumenTab`, Soporte panel)

**Interfaces:**
- Consumes: `POST /admin/users/:id/resend-verification` from Task 1, response `{ ok: true; emailSendFailed: boolean; alreadyVerified?: boolean }`.
- Produces: `useResendVerification(id: string)` — a TanStack `useMutation` whose `mutateAsync`/`onSuccess` payload is `{ emailSendFailed: boolean; alreadyVerified?: boolean }`.

- [ ] **Step 1: Write the failing hook test**

In `frontend/src/hooks/useAdminUsers.test.tsx`, add `useResendVerification` to the existing import from `./useAdminUsers`, then add this describe block right after the `useSendPasswordReset` block:

```tsx
describe('useResendVerification', () => {
  it('POSTs to /admin/users/:id/resend-verification and returns the payload', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { ok: true, emailSendFailed: false },
    });
    const { result } = renderHook(() => useResendVerification('u1'), {
      wrapper,
    });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.post).toHaveBeenCalledWith(
      '/admin/users/u1/resend-verification'
    );
    expect(result.current.data).toEqual({ ok: true, emailSendFailed: false });
  });

  it('surfaces errors from the API', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useResendVerification('u1'), {
      wrapper,
    });
    result.current.mutate();
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && npx vitest run src/hooks/useAdminUsers.test.tsx
```

Expected: FAIL — `useResendVerification` is not exported from `./useAdminUsers`.

- [ ] **Step 3: Add the hook**

In `frontend/src/hooks/useAdminUsers.ts`, add right after `useSendPasswordReset`:

```ts
// The self-serve /auth/resend-verification route acts on the caller's own
// account, so the admin panel needs its own endpoint.
export function useResendVerification(id: string) {
  return useMutation({
    mutationFn: async (): Promise<{
      ok: true;
      emailSendFailed: boolean;
      alreadyVerified?: boolean;
    }> => {
      const r = await api.post<{
        ok: true;
        emailSendFailed: boolean;
        alreadyVerified?: boolean;
      }>(`/admin/users/${id}/resend-verification`);
      return r.data;
    },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && npx vitest run src/hooks/useAdminUsers.test.tsx
```

Expected: PASS, 8/8 in that file.

- [ ] **Step 5: Add the frontend audit type and label**

In `frontend/src/types/api.ts`, extend the `AuditType` union (it currently ends with `| 'force_logout';`):

```ts
  | 'force_logout'
  | 'verification_resent';
```

In `frontend/src/lib/activity.ts`, add the label inside `LABELS` (it is a `Record<AuditType, string>`, so the build fails without it):

```ts
  verification_resent: 'Verificación reenviada',
```

- [ ] **Step 6: Wire the button**

In `frontend/src/pages/admin/UserDetail.tsx`:

1. Add `useResendVerification` to the existing `@/hooks/useAdminUsers` import list (keep it alphabetical: it goes right after `useResumeMembership`).
2. In `ResumenTab`, next to the existing `sendReset` mutation, add:

```tsx
  const resendVerify = useResendVerification(user.id);
  const onResendVerify = () =>
    resendVerify.mutate(undefined, {
      onSuccess: (r) => {
        if (r.alreadyVerified) toast.info('El email ya estaba verificado');
        else if (r.emailSendFailed)
          toast.error('No se pudo enviar el email de verificación');
        else toast.success(`Email de verificación enviado a ${user.email}`);
      },
      onError: (e) =>
        toast.error(`No se pudo reenviar: ${(e as Error).message}`),
    });
```

3. Replace the dead button (the one with the `Mail` icon and the text `Reenviar email de verificación`) with:

```tsx
            <Button
              variant="outline"
              size="sm"
              className="justify-start"
              disabled={resendVerify.isPending || user.email_verified}
              onClick={onResendVerify}
            >
              <Mail data-icon="inline-start" />
              {user.email_verified
                ? 'Email ya verificado'
                : 'Reenviar email de verificación'}
            </Button>
```

- [ ] **Step 7: Verify the frontend**

```bash
cd frontend && npx tsc --noEmit
cd frontend && npx vitest run
cd frontend && npx prettier --check src/pages/admin/UserDetail.tsx src/hooks/useAdminUsers.ts src/hooks/useAdminUsers.test.tsx src/lib/activity.ts src/types/api.ts
```

Expected: `tsc` prints nothing; the full Vitest suite passes; Prettier reports all files formatted (run `npx prettier --write` on the listed files if it complains).

---

## Out of scope

- The third dead button in the same panel, "Abrir como usuario" (no impersonation backend exists). Leave it exactly as-is.
- The hardcoded `0%` / `0 días` / `Donut value={0}` stats in the same `ResumenTab` column. Leave them as-is.
- Any change to `POST /api/auth/resend-verification` or to the mobile app flow.
