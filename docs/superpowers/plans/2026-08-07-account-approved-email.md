# Account Approved Email Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.
> **auto-build host:** Claude plans+reviews; Grok implements via headless CLI.
> <!-- auto-build plan · 2026-08-07 · source: claude+writing-plans -->

**Goal:** When an admin approves a pending account (either admin action that flips
`users.status` to `approved`), the user receives an email telling them their account
is ready — fulfilling the signup promise "Te avisamos por email cuando esté lista."

**Architecture:** The repo already has a working Resend-backed email layer
(`backend/src/services/email.service.ts` + `email-templates.ts`). Add one template
and one send function there, then call it from the two — and only two — admin route
handlers that can transition a user from non-approved to approved:
`PATCH /api/admin/users/:id` (status field) and `POST /api/admin/users/:id/payments`
(`registerPayment` forces `status='approved'` as the "enable / reactivate" action).
Both handlers already load `before` via `getUser()`, so the pending→approved
transition guard is free. The send is awaited inside a try/catch that logs and
swallows errors — a Resend outage must never fail the admin's approve request, and
awaiting (rather than fire-and-forget) keeps integration tests deterministic.

**Tech Stack:** Node 20, TypeScript ESM, Express 4, Resend v6, Jest (ts-jest ESM
preset, `jest.unstable_mockModule`), supertest, PostgreSQL 15.

## Global Constraints

- Do not open PRs, push, or commit unless the user explicitly requested it for this
  /auto-build run. **The user did NOT request it — skip every commit step.**
- Minimal diffs. No drive-by refactors of `email.service.ts`, `email-templates.ts`,
  or `admin.ts` beyond what these tasks name.
- All user-facing copy in **Spanish (rioplatense, voseo)** — match the existing
  templates: "Hola X, ...", "coordiná", "podés".
- Backend files are ESM: **relative imports must end in `.js`** (e.g.
  `../services/email.service.js`) even though the source is `.ts`.
- Prettier config: semicolons, single quotes, 80 print width, 2-space indent.
- Do NOT add a new npm dependency. `resend` is already installed.
- Do NOT create a new notification type / push notification. Email only.
- Do NOT touch `frontend/`. This is backend-only.
- Integration tests need a live Postgres. If `TEST_DATABASE_URL` is unset or the DB
  is unreachable, still write the test file, run the unit tests, and report the
  integration run as "not run — no test DB" rather than deleting the test.

---

### Task 1: Email template + send function

**Files:**
- Modify: `backend/src/services/email-templates.ts` (append a new exported function
  after `membershipExpiredTemplate`, which ends at line 98)
- Modify: `backend/src/services/email.service.ts` (add the template to the existing
  import block at lines 4-7; append a new exported send function at end of file)
- Test: `backend/tests/unit/account-approved-email.test.ts` (create)

**Interfaces:**
- Consumes: the module-private `layout(inner: string): string` helper and the
  `brandName` constant already in `email-templates.ts`; the module-private
  `send(opts: { to: string; subject: string; html: string }): Promise<void>` helper
  already in `email.service.ts`.
- Produces:
  - `accountApprovedTemplate(opts: { name: string }): string` exported from
    `backend/src/services/email-templates.ts`
  - `sendAccountApprovedEmail(opts: { email: string; name: string }): Promise<void>`
    exported from `backend/src/services/email.service.ts` — Task 2 imports this exact
    name and signature.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/account-approved-email.test.ts`:

```ts
import { jest } from '@jest/globals';

jest.unstable_mockModule('resend', () => {
  const send = jest.fn();
  return {
    Resend: jest.fn().mockImplementation(() => ({
      emails: { send },
    })),
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

const resendMod = (await import('resend')) as unknown as { __mockSend: MockSend };
const { sendAccountApprovedEmail } = await import(
  '../../src/services/email.service.js'
);
const { accountApprovedTemplate } = await import(
  '../../src/services/email-templates.js'
);

beforeEach(() => resendMod.__mockSend.mockReset());

it('accountApprovedTemplate greets the athlete and says the account is ready', () => {
  const html = accountApprovedTemplate({ name: 'Mati' });
  expect(html).toContain('Mati');
  expect(html).toMatch(/cuenta/i);
  expect(html).toMatch(/activ|lista/i);
});

it('sendAccountApprovedEmail sends to the user with an approval subject', async () => {
  resendMod.__mockSend.mockResolvedValue({ id: 'msg_ok' });
  await sendAccountApprovedEmail({ email: 'user@test.local', name: 'Mati' });
  expect(resendMod.__mockSend).toHaveBeenCalledTimes(1);
  const call = resendMod.__mockSend.mock.calls[0]?.[0] as unknown as {
    to: string;
    subject: string;
    html: string;
  };
  expect(call.to).toBe('user@test.local');
  expect(call.subject).toMatch(/cuenta/i);
  expect(call.html).toContain('Mati');
});

it('sendAccountApprovedEmail rejects when Resend fails', async () => {
  resendMod.__mockSend.mockResolvedValue({
    data: null,
    error: { message: 'resend down' },
  } as never);
  await expect(
    sendAccountApprovedEmail({ email: 'x@y.z', name: 'Mati' })
  ).rejects.toThrow('resend down');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest tests/unit/account-approved-email.test.ts
```

Expected: FAIL — `sendAccountApprovedEmail is not a function` /
`accountApprovedTemplate is not a function` (the exports do not exist yet).

- [ ] **Step 3: Add the template**

Append to `backend/src/services/email-templates.ts`, after
`membershipExpiredTemplate`:

```ts
export function accountApprovedTemplate(opts: { name: string }): string {
  return layout(`
  <h2 style="margin:0 0 16px 0">Tu cuenta ya está activa</h2>
  <p style="line-height:1.6">Hola ${opts.name}, tu cuenta de ${brandName} fue
    aprobada. Ya podés entrar a la app y empezar a entrenar.</p>
  <p style="line-height:1.6">Si tenés alguna duda, escribile a tu coach.</p>`);
}
```

- [ ] **Step 4: Add the send function**

In `backend/src/services/email.service.ts`, add `accountApprovedTemplate,` to the
existing import from `'./email-templates.js'` (the block at lines 4-7), then append
at the end of the file:

```ts
export async function sendAccountApprovedEmail(opts: {
  email: string;
  name: string;
}): Promise<void> {
  await send({
    to: opts.email,
    subject: 'Tu cuenta TR-FIT ya está activa',
    html: accountApprovedTemplate({ name: opts.name }),
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd backend && npx jest tests/unit/account-approved-email.test.ts
```

Expected: PASS — 3 passed.

- [ ] **Step 6: Typecheck**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

---

### Task 2: Fire the email on both admin approval paths

**Files:**
- Modify: `backend/src/routes/admin.ts`
  - add the import of `sendAccountApprovedEmail`
  - add a module-level helper `notifyApproved(...)` after the existing `actorEmail`
    helper (which ends at line 41)
  - call it in the `PATCH /users/:id` handler (approval branch at lines 239-247)
  - call it in the `POST /users/:id/payments` handler (after `registerPayment`,
    around lines 448-457)
- Test: `backend/tests/integration/admin-approval-email.test.ts` (create)

**Interfaces:**
- Consumes: `sendAccountApprovedEmail(opts: { email: string; name: string }): Promise<void>`
  from Task 1; the existing `getUser(id)` result shape (`{ email: string; name: string | null; status: string; ... }`);
  the existing `logger` default export at `../utils/logger.js`.
- Produces: nothing consumed by a later task.

**Behaviour contract (this is what the tests pin down):**

1. `PATCH /api/admin/users/:id` with `{ status: 'approved' }` on a user whose
   previous status was NOT `'approved'` → exactly one email to that user's address.
2. Same PATCH on a user already `'approved'` → **no** email (no duplicate on re-save).
3. `PATCH` with `{ status: 'rejected' }` → no email.
4. `POST /api/admin/users/:id/payments` on a `pending` user (registerPayment forces
   `status='approved'`) → exactly one email.
5. `POST /api/admin/users/:id/payments` on an already-`approved` user (a plain
   renewal) → **no** email.
6. A throwing `sendAccountApprovedEmail` must NOT change the HTTP response: PATCH
   still returns 200, payments still returns 201.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/integration/admin-approval-email.test.ts`:

```ts
import { jest } from '@jest/globals';

const sendApproved = jest
  .fn<(o: never) => Promise<void>>()
  .mockResolvedValue(undefined);
const noop = () => jest.fn<(o: never) => Promise<void>>().mockResolvedValue(undefined);
// The factory REPLACES the whole module, and this test imports app.ts — whose
// route tree pulls in auth.service (sendVerifyEmail, sendPasswordResetEmail) and
// alert.service (sendCoachPainAlert). Every export of email.service must be
// present here or ESM fails the import with "does not provide an export named".
jest.unstable_mockModule('../../src/services/email.service.js', () => ({
  sendAccountApprovedEmail: sendApproved,
  sendVerifyEmail: noop(),
  sendPasswordResetEmail: noop(),
  sendCoachPainAlert: noop(),
  sendMembershipExpiringEmail: noop(),
  sendMembershipExpiredEmail: noop(),
}));

const { resetDatabase, ensureMigrated, closePool } = await import(
  './helpers/test-db.js'
);
const { signToken } = await import('../../src/middleware/auth.js');
const { createAdmin, signupUserInDb } = await import('./helpers/fixtures.js');
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
  sendApproved.mockClear();
  sendApproved.mockResolvedValue(undefined);
});
afterAll(async () => {
  await closePool();
});

const PWD = 'pwd-test-1234';

async function pendingAthlete(email: string): Promise<string> {
  const { id } = await signupUserInDb(email, PWD, true);
  await pool.query(`UPDATE users SET status = 'pending' WHERE id = $1`, [id]);
  return id;
}

function adminToken(id: string): string {
  return signToken({ id, role: 'admin' });
}

const PAYMENT = {
  amount: 30000,
  method: 'transfer' as const,
  paid_at: '2026-08-07',
};

describe('approval email', () => {
  it('emails the user when a pending account is approved via PATCH', async () => {
    const tok = adminToken(await createAdmin());
    const email = 'approve-mail@test.local';
    const id = await pendingAthlete(email);

    const res = await request(app)
      .patch(`/api/admin/users/${id}`)
      .set('Authorization', `Bearer ${tok}`)
      .send({ status: 'approved' });

    expect(res.status).toBe(200);
    expect(sendApproved).toHaveBeenCalledTimes(1);
    const arg = sendApproved.mock.calls[0]?.[0] as unknown as {
      email: string;
      name: string;
    };
    expect(arg.email).toBe(email);
    expect(typeof arg.name).toBe('string');
    expect(arg.name.length).toBeGreaterThan(0);
  });

  it('does not re-email when an already-approved user is patched', async () => {
    const tok = adminToken(await createAdmin());
    // signupUserInDb leaves status at its DB default (approved)
    const { id } = await signupUserInDb('already@test.local', PWD, true);
    await pool.query(`UPDATE users SET status = 'approved' WHERE id = $1`, [id]);

    const res = await request(app)
      .patch(`/api/admin/users/${id}`)
      .set('Authorization', `Bearer ${tok}`)
      .send({ status: 'approved' });

    expect(res.status).toBe(200);
    expect(sendApproved).not.toHaveBeenCalled();
  });

  it('does not email on rejection', async () => {
    const tok = adminToken(await createAdmin());
    const id = await pendingAthlete('reject-mail@test.local');

    const res = await request(app)
      .patch(`/api/admin/users/${id}`)
      .set('Authorization', `Bearer ${tok}`)
      .send({ status: 'rejected' });

    expect(res.status).toBe(200);
    expect(sendApproved).not.toHaveBeenCalled();
  });

  it('emails when registering a payment enables a pending account', async () => {
    const tok = adminToken(await createAdmin());
    const email = 'pay-enable@test.local';
    const id = await pendingAthlete(email);

    const res = await request(app)
      .post(`/api/admin/users/${id}/payments`)
      .set('Authorization', `Bearer ${tok}`)
      .send(PAYMENT);

    expect(res.status).toBe(201);
    expect(sendApproved).toHaveBeenCalledTimes(1);
    const arg = sendApproved.mock.calls[0]?.[0] as unknown as { email: string };
    expect(arg.email).toBe(email);
  });

  it('does not email on a renewal payment for an approved user', async () => {
    const tok = adminToken(await createAdmin());
    const { id } = await signupUserInDb('renew@test.local', PWD, true);
    await pool.query(`UPDATE users SET status = 'approved' WHERE id = $1`, [id]);

    const res = await request(app)
      .post(`/api/admin/users/${id}/payments`)
      .set('Authorization', `Bearer ${tok}`)
      .send(PAYMENT);

    expect(res.status).toBe(201);
    expect(sendApproved).not.toHaveBeenCalled();
  });

  it('a failing email does not fail the approve request', async () => {
    const tok = adminToken(await createAdmin());
    const id = await pendingAthlete('mail-down@test.local');
    sendApproved.mockRejectedValue(new Error('resend down') as never);

    const res = await request(app)
      .patch(`/api/admin/users/${id}`)
      .set('Authorization', `Bearer ${tok}`)
      .send({ status: 'approved' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest tests/integration/admin-approval-email.test.ts
```

Expected: FAIL — the "emails the user…" and "emails when registering a payment…"
cases fail with `expect(sendApproved).toHaveBeenCalledTimes(1)` receiving 0 calls,
because nothing sends the email yet.

If this errors out with a DB connection failure instead, the test DB is not up —
see the Global Constraints note, report it, and continue to Step 3.

- [ ] **Step 3: Add the import and the helper in `admin.ts`**

Add after the existing `getLoggedSessions` import (line 30):

```ts
import { sendAccountApprovedEmail } from '../services/email.service.js';
import logger from '../utils/logger.js';
```

Check first whether `logger` is already imported in `admin.ts`; if it is, do not add
a second import.

Then add this helper right after the `actorEmail` function (which ends at line 41):

```ts
// Both admin enablement paths (status patch and register-payment) can flip an
// account from non-approved to approved. Only the transition mails the user, so a
// re-save or a renewal never re-sends. A dead mailer must not fail the request.
async function notifyApproved(
  beforeStatus: string,
  user: { email: string; name: string | null } | null
): Promise<void> {
  if (beforeStatus === 'approved' || !user) return;
  try {
    await sendAccountApprovedEmail({
      email: user.email,
      name: user.name ?? 'atleta',
    });
  } catch (e) {
    logger.error({ err: e, email: user.email }, 'account approved email failed');
  }
}
```

- [ ] **Step 4: Call it from the PATCH handler**

In `router.patch('/users/:id', ...)`, inside the existing
`if (parsed.data.status && parsed.data.status !== before.status) {` block, in the
`if (parsed.data.status === 'approved') {` branch — after the existing
`await logAudit({ type: 'user_approved', ... })` call and before the closing brace of
that branch — add:

```ts
      await notifyApproved(before.status, fresh ?? before);
```

Do not restructure the surrounding branch; this is a one-line insertion.

- [ ] **Step 5: Call it from the payments handler**

In `router.post('/users/:id/payments', ...)`, after the existing
`await logAudit({ type: 'payment_registered', ... })` call and before
`res.status(201).json({ membership });`, add:

```ts
  await notifyApproved(before.status, before);
```

`before` is already loaded and 404-guarded at the top of that handler, and it carries
the pre-payment status — which is exactly the transition signal, since
`registerPayment` sets `status='approved'` unconditionally.

- [ ] **Step 6: Run the integration test to verify it passes**

```bash
cd backend && npx jest tests/integration/admin-approval-email.test.ts
```

Expected: PASS — 6 passed.

- [ ] **Step 7: Typecheck, lint and format**

```bash
cd backend && npx tsc --noEmit && npx eslint src tests && npx prettier --check src tests
```

Expected: no errors. If prettier reports the touched files, run
`npx prettier --write` on those files only (`src/routes/admin.ts`,
`src/services/email.service.ts`, `src/services/email-templates.ts`, and the two new
test files) — do not reformat the whole tree.

- [ ] **Step 8: Run the neighbouring suites for regressions**

```bash
cd backend && npx jest tests/unit/email.service.test.ts tests/unit/membership-email.test.ts tests/integration/admin-user-status.test.ts tests/integration/admin-payments.test.ts
```

Expected: all PASS. `admin-user-status.test.ts` and `admin-payments.test.ts` do NOT
mock the email service, so they will hit the real `sendAccountApprovedEmail` with the
test `RESEND_API_KEY` — the `notifyApproved` try/catch is what keeps them green. If
either goes red, the swallow-and-log is wrong; fix `notifyApproved`, not the tests.

---

## Out of scope (do not implement)

- Any deep link / login button in the approval email — the existing membership
  emails carry no CTA link and there is no verified app URL to point at.
- A push notification for approval (no `NotificationType` for it; email only).
- Retry / queueing on send failure — a logged error is the accepted ceiling here,
  same as every other email in this codebase.
- Changing the signup copy in the frontend; it already promises the email.
