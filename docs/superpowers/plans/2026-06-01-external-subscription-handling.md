# External Subscription / Membership Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add time-bound athlete memberships (paid through a date) on top of the existing admin-approval gate, with a daily cron, manual payment ledger, an admin register-payment endpoint, and renewal/expiry emails — backend only, no mobile-app changes.

**Architecture:** Two orthogonal access axes — *approval* (`users.status`, from Part 1) and *payment* (`memberships.paid_until`). An athlete logs in only if `status='approved'` AND has an active membership. A `node-cron` worker derives `expiring`/`expired` status from `paid_until` and sends emails. The admin "register payment" action logs a payment, extends `paid_until`, and ensures approval — one step. MercadoPago tables stay dormant as a future seam.

**Tech Stack:** Node 20 + Express + TypeScript (ESM), PostgreSQL (`pg`), Jest + supertest, `node-cron`, Resend (email), Zod.

Spec: `docs/superpowers/specs/2026-06-01-external-subscription-handling-design.md`

**Conventions (verified):**
- Migrations: `src/db/migrations/NNN_name.sql`, run alphabetically; UUID PKs via `gen_random_uuid()`; latest existing = `028`. Idempotent `IF NOT EXISTS`.
- Tests: Postgres `trfit_test` on `localhost:5432`; harness auto-migrates. Run `npm test -- <pattern>`. `maxWorkers: 1`. Integration tests import modules via `await import(...)` after any mocks. `tests/integration/helpers/test-db.ts` `resetDatabase()` TRUNCATEs a fixed table list — **new tables must be added there**.
- Athlete login fixtures: `verifiedAthleteUser()` / `createAthlete()` in `tests/integration/helpers/fixtures.ts`.
- Workers: `node-cron`, started in `src/index.ts` under `if (NODE_ENV !== 'test')`. Tick fn exported for tests (see `runNotificationTick`).
- Email: `src/services/email.service.ts` `send()` + templates in `email-templates.ts`.

**Constants:** `GRACE_DAYS = 7`, default `PERIOD_DAYS = 30` (admin may override per payment).

---

## File structure

- Create `src/db/migrations/029_memberships.sql` — `memberships` + `payments` tables + approved-athlete backfill.
- Create `src/services/membership.service.ts` — membership read/mutate logic (`getMembership`, `registerPayment`, `cancelMembership`, `isActive`).
- Create `src/workers/membership-cron.ts` — daily tick deriving status + sending emails.
- Modify `src/services/auth.service.ts` — athlete payment gate in `login()` and `refresh()`.
- Modify `src/domain/types.ts` — `Membership`, `Payment`, `MembershipStatus` types.
- Modify `src/services/email.service.ts` + `src/services/email-templates.ts` — expiring/expired emails.
- Modify `src/services/admin.service.ts` — `registerPayment` reused; `getUser`/`listUsers` membership fields; deprecate `upsertManualSubscription`.
- Modify `src/routes/admin.ts` — `POST /users/:id/payments`, `POST /users/:id/membership/cancel`; deprecate `PUT /users/:id/subscription`.
- Modify `src/index.ts` — register `startMembershipCron()`.
- Modify `tests/integration/helpers/test-db.ts` — add `payments`, `memberships` to TRUNCATE list.
- Modify `tests/integration/helpers/fixtures.ts` — seed active membership for login-capable athletes; add `setMembership` helper.
- Modify `tests/integration/auth.test.ts` + `tests/integration/admin-user-status.test.ts` — reflect the payment gate.
- Create tests: `migration-029.test.ts`, `membership-service.test.ts`, `membership-cron.test.ts`, `admin-payments.test.ts`.

---

## Task 1: Migration 029 — memberships + payments tables + backfill

**Files:**
- Create: `src/db/migrations/029_memberships.sql`
- Modify: `tests/integration/helpers/test-db.ts` (TRUNCATE list)
- Test: `tests/integration/migration-029.test.ts`

- [ ] **Step 1: Write the migration SQL**

Create `src/db/migrations/029_memberships.sql`:

```sql
-- Time-bound athlete memberships + manual payment ledger.
-- Orthogonal to users.status (approval gate). paid_until is authoritative;
-- memberships.status is a cron-derived cache for dashboard/notifications.

CREATE TABLE IF NOT EXISTS memberships (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'expired'
                CHECK (status IN ('active', 'expiring', 'expired', 'cancelled')),
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_until  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_memberships_paid_until ON memberships(paid_until);
CREATE INDEX IF NOT EXISTS idx_memberships_status ON memberships(status);

CREATE TABLE IF NOT EXISTS payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paid_at       DATE NOT NULL,
  amount        NUMERIC(12,2) NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'ARS',
  method        TEXT NOT NULL DEFAULT 'transfer'
                  CHECK (method IN ('transfer', 'cash', 'mercadopago', 'other')),
  reference     TEXT,
  covers_until  TIMESTAMPTZ NOT NULL,
  recorded_by   UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id, created_at DESC);

-- Backfill: existing approved athletes keep access (infinity = always active)
-- so nobody is locked out on deploy. Admins move them to real dates over time.
INSERT INTO memberships (user_id, status, started_at, paid_until)
SELECT id, 'active', now(), 'infinity'::timestamptz
FROM users
WHERE role = 'athlete' AND status = 'approved'
ON CONFLICT (user_id) DO NOTHING;
```

- [ ] **Step 2: Add new tables to the test TRUNCATE list**

In `tests/integration/helpers/test-db.ts`, add `payments` and `memberships` near the top of the `TRUNCATE TABLE` list (before `users`, after `mp_webhook_log`):

```ts
    TRUNCATE TABLE
      mp_webhook_log,
      payments,
      memberships,
      subscriptions,
```

- [ ] **Step 3: Write the failing test**

Create `tests/integration/migration-029.test.ts`:

```ts
export {};
const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

describe('migration 029 memberships + payments', () => {
  it('memberships table exists with status check + unique user', async () => {
    const { rows } = await pool.query(
      `INSERT INTO memberships (user_id, status, paid_until)
       SELECT u.id, 'active', now() + interval '30 days'
         FROM users u LIMIT 0 RETURNING id`,
    );
    expect(Array.isArray(rows)).toBe(true);
    const reg = await pool.query(`SELECT to_regclass('public.memberships') AS t`);
    expect(reg.rows[0].t).toBe('memberships');
  });

  it('rejects invalid membership status', async () => {
    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role) VALUES ($1,'x','athlete') RETURNING id`,
      [`m-${Date.now()}@t.local`],
    );
    await expect(
      pool.query(
        `INSERT INTO memberships (user_id, status, paid_until) VALUES ($1,'bogus', now())`,
        [u.rows[0].id],
      ),
    ).rejects.toThrow();
  });

  it('payments ledger accepts a transfer row', async () => {
    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role) VALUES ($1,'x','athlete') RETURNING id`,
      [`p-${Date.now()}@t.local`],
    );
    const r = await pool.query(
      `INSERT INTO payments (user_id, paid_at, amount, method, covers_until)
       VALUES ($1, current_date, 25000, 'transfer', now() + interval '30 days') RETURNING id`,
      [u.rows[0].id],
    );
    expect(r.rows[0].id).toBeDefined();
  });

  it('backfills approved athletes with an infinity membership', async () => {
    // Insert an approved athlete, then re-run the backfill statement (idempotent).
    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ($1,'x','athlete','approved') RETURNING id`,
      [`bf-${Date.now()}@t.local`],
    );
    await pool.query(
      `INSERT INTO memberships (user_id, status, started_at, paid_until)
       SELECT id, 'active', now(), 'infinity'::timestamptz
       FROM users WHERE id = $1
       ON CONFLICT (user_id) DO NOTHING`,
      [u.rows[0].id],
    );
    const m = await pool.query<{ status: string; paid_until: string }>(
      `SELECT status, paid_until FROM memberships WHERE user_id = $1`, [u.rows[0].id],
    );
    expect(m.rows[0].status).toBe('active');
    expect(m.rows[0].paid_until).toBe('infinity');
  });
});
```

- [ ] **Step 4: Run migration + test**

Run: `npm run db:migrate && npm test -- migration-029`
Expected: migration applies; 4 tests PASS. (If `trfit_test` was already migrated, the new file applies on `ensureMigrated`.)

- [ ] **Step 5: Commit**

```bash
git add src/db/migrations/029_memberships.sql tests/integration/migration-029.test.ts tests/integration/helpers/test-db.ts
git commit -m "feat(db): add memberships + payments tables with approved-athlete backfill"
```

---

## Task 2: Domain types

**Files:**
- Modify: `src/domain/types.ts`

- [ ] **Step 1: Add types**

Append to `src/domain/types.ts`:

```ts
export type MembershipStatus = 'active' | 'expiring' | 'expired' | 'cancelled';
export type PaymentMethod = 'transfer' | 'cash' | 'mercadopago' | 'other';

export interface Membership {
  id: string;
  user_id: string;
  status: MembershipStatus;
  started_at: string;
  paid_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  user_id: string;
  paid_at: string;
  amount: string; // numeric → string from pg
  currency: string;
  method: PaymentMethod;
  reference: string | null;
  covers_until: string;
  recorded_by: string | null;
  created_at: string;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/domain/types.ts
git commit -m "feat(types): add Membership and Payment domain types"
```

---

## Task 3: membership.service — read + mutate logic

**Files:**
- Create: `src/services/membership.service.ts`
- Test: `tests/integration/membership-service.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/membership-service.test.ts`:

```ts
export {};
const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { createAdmin, createAthlete } = await import('./helpers/fixtures.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const {
  getMembership, registerPayment, cancelMembership, isActive,
} = await import('../../src/services/membership.service.js');

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

describe('membership.service', () => {
  it('registerPayment creates an active membership, payment row, and approves the user', async () => {
    const admin = await createAdmin();
    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, status, email_verified)
       VALUES ($1,'x','athlete','pending',true) RETURNING id`,
      [`rp-${Date.now()}@t.local`],
    );
    const userId = u.rows[0].id;

    const m = await registerPayment(userId, {
      amount: 25000, currency: 'ARS', method: 'transfer',
      paidAt: '2026-06-01', reference: 'transf #1', periodDays: 30,
      recordedBy: admin,
    });

    expect(m.status).toBe('active');
    expect(new Date(m.paid_until!).getTime()).toBeGreaterThan(Date.now());

    const pay = await pool.query(`SELECT * FROM payments WHERE user_id = $1`, [userId]);
    expect(pay.rowCount).toBe(1);
    expect(pay.rows[0].amount).toBe('25000.00');

    const user = await pool.query<{ status: string }>(
      `SELECT status FROM users WHERE id = $1`, [userId],
    );
    expect(user.rows[0].status).toBe('approved');
  });

  it('registerPayment extends from existing paid_until when still active', async () => {
    const admin = await createAdmin();
    const a = await createAthlete(admin); // fixture seeds active infinity membership
    // Reset to a concrete near-future date first
    await pool.query(
      `UPDATE memberships SET paid_until = now() + interval '10 days', status='active' WHERE user_id=$1`,
      [a],
    );
    const m = await registerPayment(a, {
      amount: 1, method: 'transfer', paidAt: '2026-06-01', periodDays: 30, recordedBy: admin,
    });
    // extends from current paid_until (~10d) + 30d ≈ 40 days out, not 30
    const days = (new Date(m.paid_until!).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(35);
  });

  it('registerPayment on an expired membership renews from now()', async () => {
    const admin = await createAdmin();
    const a = await createAthlete(admin);
    await pool.query(
      `UPDATE memberships SET paid_until = now() - interval '5 days', status='expired' WHERE user_id=$1`,
      [a],
    );
    const m = await registerPayment(a, {
      amount: 1, method: 'transfer', paidAt: '2026-06-01', periodDays: 30, recordedBy: admin,
    });
    const days = (new Date(m.paid_until!).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(28);
    expect(days).toBeLessThan(32);
    expect(m.status).toBe('active');
  });

  it('cancelMembership sets cancelled and paid_until=now', async () => {
    const admin = await createAdmin();
    const a = await createAthlete(admin);
    await cancelMembership(a);
    const m = await getMembership(a);
    expect(m!.status).toBe('cancelled');
    expect(isActive(m)).toBe(false);
  });

  it('isActive: infinity is active, past is not, null is not', async () => {
    expect(isActive({ paid_until: 'infinity' } as never)).toBe(true);
    expect(isActive({ paid_until: new Date(Date.now() + 86_400_000).toISOString() } as never)).toBe(true);
    expect(isActive({ paid_until: new Date(Date.now() - 86_400_000).toISOString() } as never)).toBe(false);
    expect(isActive({ paid_until: null } as never)).toBe(false);
    expect(isActive(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- membership-service`
Expected: FAIL — `Cannot find module '.../membership.service.js'`.

- [ ] **Step 3: Write the service**

Create `src/services/membership.service.ts`:

```ts
import pool from '../db/connect.js';
import type { Membership, PaymentMethod } from '../domain/types.js';

export const GRACE_DAYS = 7;
export const DEFAULT_PERIOD_DAYS = 30;

/** A membership grants access iff paid_until is in the future ('infinity' counts). */
export function isActive(m: Pick<Membership, 'paid_until'> | null): boolean {
  if (!m || !m.paid_until) return false;
  if (m.paid_until === 'infinity') return true;
  return new Date(m.paid_until).getTime() > Date.now();
}

export async function getMembership(userId: string): Promise<Membership | null> {
  const r = await pool.query<Membership>(
    `SELECT * FROM memberships WHERE user_id = $1`, [userId],
  );
  return r.rows[0] ?? null;
}

export interface RegisterPaymentInput {
  amount: number;
  currency?: string;
  method: PaymentMethod;
  paidAt: string;        // 'YYYY-MM-DD'
  reference?: string | null;
  periodDays?: number;   // default 30; ignored if coversUntil given
  coversUntil?: string;  // explicit ISO end; overrides periodDays
  recordedBy?: string | null;
}

/**
 * Records a payment, extends/creates the membership, and ensures the user is
 * approved — the single admin "enable / reactivate" operation. Transactional.
 */
export async function registerPayment(
  userId: string,
  input: RegisterPaymentInput,
): Promise<Membership> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query<{ paid_until: string | null }>(
      `SELECT paid_until FROM memberships WHERE user_id = $1 FOR UPDATE`, [userId],
    );
    // Extend from the later of current paid_until or now() (renewal vs top-up).
    const base = (() => {
      const cur = existing.rows[0]?.paid_until;
      if (cur && cur !== 'infinity' && new Date(cur).getTime() > Date.now()) {
        return new Date(cur);
      }
      return new Date();
    })();

    const coversUntil = input.coversUntil
      ? new Date(input.coversUntil)
      : new Date(base.getTime() + (input.periodDays ?? DEFAULT_PERIOD_DAYS) * 86_400_000);

    await client.query(
      `INSERT INTO payments (user_id, paid_at, amount, currency, method, reference, covers_until, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [userId, input.paidAt, input.amount, input.currency ?? 'ARS', input.method,
       input.reference ?? null, coversUntil.toISOString(), input.recordedBy ?? null],
    );

    const m = await client.query<Membership>(
      `INSERT INTO memberships (user_id, status, started_at, paid_until, updated_at)
       VALUES ($1, 'active', now(), $2, now())
       ON CONFLICT (user_id) DO UPDATE
         SET status = 'active', paid_until = $2, updated_at = now()
       RETURNING *`,
      [userId, coversUntil.toISOString()],
    );

    await client.query(`UPDATE users SET status = 'approved' WHERE id = $1`, [userId]);

    await client.query('COMMIT');
    return m.rows[0];
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function cancelMembership(userId: string): Promise<void> {
  await pool.query(
    `UPDATE memberships SET status = 'cancelled', paid_until = now(), updated_at = now()
      WHERE user_id = $1`,
    [userId],
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- membership-service`
Expected: PASS (5 tests). (Depends on fixture membership seeding from Task 4 Step 1 — apply that fixture change first if `createAthlete` rows lack a membership.)

- [ ] **Step 5: Commit**

```bash
git add src/services/membership.service.ts tests/integration/membership-service.test.ts
git commit -m "feat(membership): add membership service (register payment, cancel, isActive)"
```

---

## Task 4: Athlete payment gate at login + refresh

**Files:**
- Modify: `tests/integration/helpers/fixtures.ts` (seed active membership for login-capable athletes; add `setMembership`)
- Modify: `src/services/auth.service.ts` (`login()`, `refresh()`)
- Modify: `tests/integration/auth.test.ts` (new gate cases)
- Modify: `tests/integration/admin-user-status.test.ts` (reflect payment gate)
- Test: covered by `auth.test.ts`

- [ ] **Step 1: Seed memberships in fixtures**

In `tests/integration/helpers/fixtures.ts`:

a) Add a helper (after `createAthlete`):

```ts
export async function setMembership(
  userId: string,
  paidUntil: string | null, // ISO, 'infinity', or null
  status: 'active' | 'expiring' | 'expired' | 'cancelled' = 'active',
): Promise<void> {
  await pool.query(
    `INSERT INTO memberships (user_id, status, paid_until)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET status = $2, paid_until = $3, updated_at = now()`,
    [userId, status, paidUntil],
  );
}
```

b) At the end of `createAthlete` (before `return id;`), seed an active membership so fixture athletes can log in:

```ts
  await pool.query(
    `INSERT INTO memberships (user_id, status, paid_until)
     VALUES ($1, 'active', 'infinity') ON CONFLICT (user_id) DO NOTHING`,
    [id],
  );
  return id;
```

c) In `verifiedAthleteUser`, seed an active membership for the created user:

```ts
export async function verifiedAthleteUser(
  email: string = `vuser-${Date.now()}-${Math.random()}@test.local`,
): Promise<{ id: string; email: string; password: string }> {
  const password = 'test-pass-1234';
  const { id } = await signupUserInDb(email, password, true);
  await pool.query(
    `INSERT INTO memberships (user_id, status, paid_until)
     VALUES ($1, 'active', 'infinity') ON CONFLICT (user_id) DO NOTHING`,
    [id],
  );
  return { id, email, password };
}
```

- [ ] **Step 2: Write failing gate tests**

In `tests/integration/auth.test.ts`, add after the existing `login blocked when account is rejected` test:

```ts
it('login blocked when athlete approved but membership expired', async () => {
  const u = await verifiedAthleteUser('exp@test.local');
  await pool.query(
    `UPDATE memberships SET paid_until = now() - interval '1 day', status='expired' WHERE user_id=$1`,
    [u.id],
  );
  const r = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password });
  expect(r.status).toBe(403);
  expect(r.body.reason).toBe('not_approved');
});

it('login blocked when athlete approved but has no membership', async () => {
  const u = await verifiedAthleteUser('nomem@test.local');
  await pool.query(`DELETE FROM memberships WHERE user_id=$1`, [u.id]);
  const r = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password });
  expect(r.status).toBe(403);
  expect(r.body.reason).toBe('not_approved');
});

it('login succeeds when athlete approved and membership active', async () => {
  const u = await verifiedAthleteUser('active@test.local');
  const r = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password });
  expect(r.status).toBe(200);
  expect(typeof r.body.accessToken).toBe('string');
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- auth.test`
Expected: the "expired" and "no membership" cases FAIL (login still returns 200 — gate not implemented). "active" passes.

- [ ] **Step 4: Implement the gate in `login()`**

In `src/services/auth.service.ts`, change the login `SELECT` to left-join the membership and add the athlete gate. Replace the query + post-checks block:

```ts
  const r = await pool.query<{
    id: string; password_hash: string; role: 'athlete'|'admin'|'superadmin';
    email: string; email_verified: boolean;
    status: 'pending' | 'approved' | 'rejected';
    membership_active: boolean;
  }>(
    `SELECT u.id, u.password_hash, u.role, u.email, u.email_verified, u.status,
            COALESCE(m.paid_until > now(), false) AS membership_active
       FROM users u
       LEFT JOIN memberships m ON m.user_id = u.id
      WHERE u.email = $1`,
    [email],
  );
  const user = r.rows[0];
  if (!user) {
    await comparePassword(password, '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid');
    throw new LoginError('invalid_credentials');
  }
  const ok = await comparePassword(password, user.password_hash);
  if (!ok) throw new LoginError('invalid_credentials');
  if (!user.email_verified) throw new LoginError('email_not_verified');
  if (user.status === 'pending') throw new LoginError('not_approved');
  if (user.status === 'rejected') throw new LoginError('rejected');
  // Payment gate (athletes only — admins need no membership). An expired or
  // missing membership maps to 'not_approved' so the fixed app shows its
  // existing "pendiente de aprobación / te avisamos por email" screen.
  if (user.role === 'athlete' && !user.membership_active) {
    throw new LoginError('not_approved');
  }
```

Note: `paid_until > now()` is true for `'infinity'` in Postgres, so backfilled athletes pass.

- [ ] **Step 5: Run to verify login passes**

Run: `npm test -- auth.test`
Expected: all auth tests PASS.

- [ ] **Step 6: Gate `refresh()` too (so expired athletes can't refresh forever)**

In `src/services/auth.service.ts` `refresh()`, replace the role lookup:

```ts
    // Re-check access on refresh so a lapsed athlete can't keep minting tokens.
    const u = await client.query<{
      role: 'athlete'|'admin'|'superadmin'; status: string; membership_active: boolean;
    }>(
      `SELECT u.role, u.status, COALESCE(m.paid_until > now(), false) AS membership_active
         FROM users u LEFT JOIN memberships m ON m.user_id = u.id
        WHERE u.id = $1`,
      [row.user_id],
    );
    const acct = u.rows[0];
    const athleteBlocked = acct.role === 'athlete'
      && (acct.status !== 'approved' || !acct.membership_active);
    if (acct.status === 'rejected' || athleteBlocked) {
      // Revoke the family and force re-login (which surfaces the gate message).
      await client.query(
        `UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = $1 AND revoked_at IS NULL`,
        [row.family_id],
      );
      await client.query('COMMIT');
      throw new RefreshError('invalid');
    }
```

Then update the access-token sign to use `acct.role` instead of `u.rows[0].role`.

- [ ] **Step 7: Add refresh-gate test**

In `tests/integration/auth.test.ts`, add:

```ts
it('refresh blocked after athlete membership expires', async () => {
  const u = await verifiedAthleteUser('refexp@test.local');
  const loginR = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password });
  const refreshTok = loginR.body.refreshToken;
  await pool.query(
    `UPDATE memberships SET paid_until = now() - interval '1 day', status='expired' WHERE user_id=$1`,
    [u.id],
  );
  const r = await request(app).post('/api/auth/refresh').send({ refreshToken: refreshTok });
  expect(r.status).toBe(401);
});
```

- [ ] **Step 8: Fix the admin-user-status test for the payment gate**

In `tests/integration/admin-user-status.test.ts`:

- Import `setMembership`:
  ```ts
  const { createAdmin, signupUserInDb, setMembership } = await import('./helpers/fixtures.js');
  ```
- In `pendingVerifiedAthlete`, after creating, the user has no membership. The "approving lets login" test must also give an active membership (approval alone is no longer sufficient). Change that test so enabling = approve **and** seed an active membership:
  ```ts
  // Admin enables: approve status AND grant an active membership.
  await request(app).patch(`/api/admin/users/${athleteId}`)
    .set('Authorization', `Bearer ${adminTok}`).send({ status: 'approved' });
  await setMembership(athleteId, 'infinity', 'active');
  ```
  (Leave the audit assertion intact.)
- In `rejecting an approved athlete blocks their next login`, the athlete is created via `signupUserInDb` (approved, no membership) → would already fail the new gate before rejection. Give it a membership so the "before" login is 200:
  ```ts
  const { id: athleteId } = await signupUserInDb(email, PWD, true);
  await setMembership(athleteId, 'infinity', 'active');
  ```

- [ ] **Step 9: Run auth + admin-user-status**

Run: `npm test -- auth.test admin-user-status`
Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add src/services/auth.service.ts tests/integration/auth.test.ts tests/integration/admin-user-status.test.ts tests/integration/helpers/fixtures.ts
git commit -m "feat(auth): gate athlete login + refresh on active membership"
```

---

## Task 5: Expiry / renewal emails

**Files:**
- Modify: `src/services/email-templates.ts`
- Modify: `src/services/email.service.ts`
- Test: `tests/unit/membership-email.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/membership-email.test.ts`:

```ts
import { membershipExpiringTemplate, membershipExpiredTemplate } from '../../src/services/email-templates.js';

describe('membership email templates', () => {
  it('expiring template names the date and days left', () => {
    const html = membershipExpiringTemplate({ name: 'Mati', paidUntil: '2026-06-30', daysLeft: 5 });
    expect(html).toContain('Mati');
    expect(html).toContain('2026-06-30');
    expect(html).toMatch(/5/);
  });

  it('expired template prompts renewal', () => {
    const html = membershipExpiredTemplate({ name: 'Mati' });
    expect(html).toContain('Mati');
    expect(html.toLowerCase()).toContain('renov');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- membership-email`
Expected: FAIL — templates not exported.

- [ ] **Step 3: Add templates**

Append to `src/services/email-templates.ts`:

```ts
export function membershipExpiringTemplate(opts: {
  name: string; paidUntil: string; daysLeft: number;
}): string {
  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color:#111">
  <h2 style="margin:0 0 16px 0">Tu plan vence pronto</h2>
  <p style="line-height:1.6">Hola ${opts.name}, tu acceso a TR-FIT vence el
    <strong>${opts.paidUntil}</strong> (en ${opts.daysLeft} días).</p>
  <p style="line-height:1.6">Para renovar, coordiná el pago con tu coach. Una vez
    confirmado, tu cuenta sigue activa sin interrupciones.</p>
  <p style="color:#999;font-size:12px;margin-top:24px">— FORMA</p>
</div>`;
}

export function membershipExpiredTemplate(opts: { name: string }): string {
  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color:#111">
  <h2 style="margin:0 0 16px 0">Tu plan venció</h2>
  <p style="line-height:1.6">Hola ${opts.name}, tu acceso a TR-FIT venció.
    Para renovarlo y volver a entrenar, coordiná el pago con tu coach.</p>
  <p style="color:#999;font-size:12px;margin-top:24px">— FORMA</p>
</div>`;
}
```

- [ ] **Step 4: Add email.service senders**

Append to `src/services/email.service.ts` (and add the two names to the existing import from `./email-templates.js`):

```ts
export async function sendMembershipExpiringEmail(opts: {
  email: string; name: string; paidUntil: string; daysLeft: number;
}): Promise<void> {
  await send({
    to: opts.email,
    subject: 'Tu plan TR-FIT vence pronto',
    html: membershipExpiringTemplate({ name: opts.name, paidUntil: opts.paidUntil, daysLeft: opts.daysLeft }),
  });
}

export async function sendMembershipExpiredEmail(opts: {
  email: string; name: string;
}): Promise<void> {
  await send({
    to: opts.email,
    subject: 'Tu plan TR-FIT venció',
    html: membershipExpiredTemplate({ name: opts.name }),
  });
}
```

Update the import line at the top of `email.service.ts`:

```ts
import {
  verifyTemplate, resetCodeTemplate, painAlertTemplate,
  membershipExpiringTemplate, membershipExpiredTemplate,
} from './email-templates.js';
```

- [ ] **Step 5: Run to verify pass**

Run: `npm test -- membership-email && npx tsc --noEmit`
Expected: 2 tests PASS, typecheck exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/services/email-templates.ts src/services/email.service.ts tests/unit/membership-email.test.ts
git commit -m "feat(email): add membership expiring/expired email templates"
```

---

## Task 6: Daily membership cron

**Files:**
- Create: `src/workers/membership-cron.ts`
- Modify: `src/index.ts`
- Test: `tests/integration/membership-cron.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/membership-cron.test.ts`:

```ts
import { jest } from '@jest/globals';

const sendExpiring = jest.fn<(o: never) => Promise<void>>().mockResolvedValue();
const sendExpired = jest.fn<(o: never) => Promise<void>>().mockResolvedValue();
jest.unstable_mockModule('../../src/services/email.service.js', () => ({
  sendMembershipExpiringEmail: sendExpiring,
  sendMembershipExpiredEmail: sendExpired,
}));

const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { createAdmin, createAthlete, setMembership } = await import('./helpers/fixtures.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const { runMembershipTick } = await import('../../src/workers/membership-cron.js');

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); sendExpiring.mockClear(); sendExpired.mockClear(); });
afterAll(async () => { await closePool(); });

async function status(userId: string): Promise<string> {
  const r = await pool.query<{ status: string }>(`SELECT status FROM memberships WHERE user_id=$1`, [userId]);
  return r.rows[0].status;
}

describe('runMembershipTick', () => {
  it('flips active→expiring within grace window and emails once', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    await setMembership(a, new Date(Date.now() + 3 * 86_400_000).toISOString(), 'active');
    await runMembershipTick();
    expect(await status(a)).toBe('expiring');
    expect(sendExpiring).toHaveBeenCalledTimes(1);

    // second tick: already expiring → no duplicate email
    await runMembershipTick();
    expect(sendExpiring).toHaveBeenCalledTimes(1);
  });

  it('flips to expired past paid_until and emails once', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    await setMembership(a, new Date(Date.now() - 86_400_000).toISOString(), 'active');
    await runMembershipTick();
    expect(await status(a)).toBe('expired');
    expect(sendExpired).toHaveBeenCalledTimes(1);

    await runMembershipTick();
    expect(sendExpired).toHaveBeenCalledTimes(1);
  });

  it('leaves far-future active memberships alone', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    await setMembership(a, new Date(Date.now() + 60 * 86_400_000).toISOString(), 'active');
    await runMembershipTick();
    expect(await status(a)).toBe('active');
    expect(sendExpiring).not.toHaveBeenCalled();
  });

  it('never resurrects a cancelled membership', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    await setMembership(a, new Date(Date.now() - 86_400_000).toISOString(), 'cancelled');
    await runMembershipTick();
    expect(await status(a)).toBe('cancelled');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- membership-cron`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the worker**

Create `src/workers/membership-cron.ts`:

```ts
import cron from 'node-cron';
import pool from '../db/connect.js';
import logger from '../utils/logger.js';
import { GRACE_DAYS } from '../services/membership.service.js';
import {
  sendMembershipExpiringEmail, sendMembershipExpiredEmail,
} from '../services/email.service.js';

interface Row {
  user_id: string; email: string; name: string | null; paid_until: string;
}

/**
 * Derives membership.status from paid_until and sends one email per transition.
 * Emails fire only on the status change (active→expiring, *→expired), so the
 * one-time UPDATE is the dedupe — no separate log needed. Cancelled is never touched.
 */
export async function runMembershipTick(): Promise<void> {
  // 1. expired: past paid_until, not cancelled/expired yet
  const expired = await pool.query<Row>(
    `UPDATE memberships m
        SET status = 'expired', updated_at = now()
       FROM users u
      WHERE m.user_id = u.id
        AND m.status NOT IN ('expired', 'cancelled')
        AND m.paid_until IS NOT NULL
        AND m.paid_until <> 'infinity'
        AND m.paid_until < now()
      RETURNING m.user_id, u.email,
                (SELECT name FROM athlete_profiles WHERE user_id = m.user_id) AS name,
                m.paid_until`,
  );

  // 2. expiring: within grace window, currently active
  const expiring = await pool.query<Row>(
    `UPDATE memberships m
        SET status = 'expiring', updated_at = now()
       FROM users u
      WHERE m.user_id = u.id
        AND m.status = 'active'
        AND m.paid_until IS NOT NULL
        AND m.paid_until <> 'infinity'
        AND m.paid_until >= now()
        AND m.paid_until <= now() + ($1 || ' days')::interval
      RETURNING m.user_id, u.email,
                (SELECT name FROM athlete_profiles WHERE user_id = m.user_id) AS name,
                m.paid_until`,
    [String(GRACE_DAYS)],
  );

  // 3. re-activate: renewed beyond grace but still flagged expiring/expired
  await pool.query(
    `UPDATE memberships
        SET status = 'active', updated_at = now()
      WHERE status IN ('expiring', 'expired')
        AND paid_until IS NOT NULL
        AND (paid_until = 'infinity' OR paid_until > now() + ($1 || ' days')::interval)`,
    [String(GRACE_DAYS)],
  );

  for (const r of expired.rows) {
    try {
      await sendMembershipExpiredEmail({ email: r.email, name: r.name ?? 'atleta' });
    } catch (e) { logger.error({ err: e, userId: r.user_id }, 'membership expired email failed'); }
  }
  for (const r of expiring.rows) {
    const daysLeft = Math.max(
      0, Math.ceil((new Date(r.paid_until).getTime() - Date.now()) / 86_400_000),
    );
    try {
      await sendMembershipExpiringEmail({
        email: r.email, name: r.name ?? 'atleta',
        paidUntil: new Date(r.paid_until).toISOString().slice(0, 10), daysLeft,
      });
    } catch (e) { logger.error({ err: e, userId: r.user_id }, 'membership expiring email failed'); }
  }

  logger.info(
    { expired: expired.rowCount, expiring: expiring.rowCount },
    'membership tick complete',
  );
}

let task: ReturnType<typeof cron.schedule> | null = null;

export function startMembershipCron(): void {
  if (task) return;
  // Daily at 09:00 server time.
  task = cron.schedule('0 9 * * *', () => {
    runMembershipTick().catch((e) => logger.error({ err: e }, 'membership cron failed'));
  });
  logger.info('membership cron scheduled');
}
```

- [ ] **Step 4: Register the cron in `index.ts`**

In `src/index.ts`, add the import and start call:

```ts
import { startMembershipCron } from './workers/membership-cron.js';
```
```ts
if (process.env.NODE_ENV !== 'test') {
  startProgressionCron();
  startNotificationCron();
  startMembershipCron();
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npm test -- membership-cron && npx tsc --noEmit`
Expected: 4 tests PASS, typecheck exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/workers/membership-cron.ts src/index.ts tests/integration/membership-cron.test.ts
git commit -m "feat(cron): daily membership status derivation + expiry emails"
```

---

## Task 7: Admin register-payment + cancel endpoints

**Files:**
- Modify: `src/routes/admin.ts`
- Modify: `src/services/admin.service.ts` (audit type union if needed; deprecate `upsertManualSubscription`)
- Test: `tests/integration/admin-payments.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/admin-payments.test.ts`:

```ts
export {};
const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { signToken } = await import('../../src/middleware/auth.js');
const { createAdmin, signupUserInDb, setMembership } = await import('./helpers/fixtures.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const requestMod = await import('supertest');
const request = requestMod.default;
const appMod = await import('../../src/app.js');
const app = appMod.default;

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

describe('POST /api/admin/users/:id/payments', () => {
  it('registers a payment, activates membership, approves user, audits', async () => {
    const adminId = await createAdmin();
    const tok = signToken({ id: adminId, role: 'admin' });
    const { id: athleteId } = await signupUserInDb('payme@test.local', 'pwd-test-1234', true);
    await pool.query(`UPDATE users SET status='pending' WHERE id=$1`, [athleteId]);

    const r = await request(app)
      .post(`/api/admin/users/${athleteId}/payments`)
      .set('Authorization', `Bearer ${tok}`)
      .send({ amount: 25000, method: 'transfer', paid_at: '2026-06-01', period_days: 30 });
    expect(r.status).toBe(201);
    expect(r.body.membership.status).toBe('active');

    const user = await pool.query<{ status: string }>(`SELECT status FROM users WHERE id=$1`, [athleteId]);
    expect(user.rows[0].status).toBe('approved');

    const pay = await pool.query(`SELECT * FROM payments WHERE user_id=$1`, [athleteId]);
    expect(pay.rowCount).toBe(1);
    expect(pay.rows[0].recorded_by).toBe(adminId);

    const audit = await pool.query(
      `SELECT 1 FROM admin_audit_log WHERE target_id=$1 AND type='payment_registered'`, [athleteId],
    );
    expect(audit.rowCount).toBe(1);
  });

  it('rejects invalid payload', async () => {
    const adminId = await createAdmin();
    const tok = signToken({ id: adminId, role: 'admin' });
    const { id: athleteId } = await signupUserInDb('bad@test.local', 'pwd-test-1234', true);
    const r = await request(app)
      .post(`/api/admin/users/${athleteId}/payments`)
      .set('Authorization', `Bearer ${tok}`)
      .send({ amount: -5, method: 'bitcoin' });
    expect(r.status).toBe(400);
  });

  it('non-admin is rejected', async () => {
    const { id: athleteId } = await signupUserInDb('atk@test.local', 'pwd-test-1234', true);
    const tok = signToken({ id: athleteId, role: 'athlete' });
    const r = await request(app)
      .post(`/api/admin/users/${athleteId}/payments`)
      .set('Authorization', `Bearer ${tok}`)
      .send({ amount: 1, method: 'transfer', paid_at: '2026-06-01' });
    expect(r.status).toBe(403);
  });

  it('cancel endpoint sets membership cancelled', async () => {
    const adminId = await createAdmin();
    const tok = signToken({ id: adminId, role: 'admin' });
    const { id: athleteId } = await signupUserInDb('cxl@test.local', 'pwd-test-1234', true);
    await setMembership(athleteId, 'infinity', 'active');
    const r = await request(app)
      .post(`/api/admin/users/${athleteId}/membership/cancel`)
      .set('Authorization', `Bearer ${tok}`).send({});
    expect(r.status).toBe(200);
    const m = await pool.query<{ status: string }>(`SELECT status FROM memberships WHERE user_id=$1`, [athleteId]);
    expect(m.rows[0].status).toBe('cancelled');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- admin-payments`
Expected: FAIL — routes return 404.

- [ ] **Step 3: Add the routes**

In `src/routes/admin.ts`, add imports:

```ts
import { registerPayment, cancelMembership } from '../services/membership.service.js';
```

Add routes (place after the existing `PUT /users/:id/subscription` block):

```ts
const paymentBody = z.object({
  amount: z.number().positive(),
  currency: z.string().min(1).max(8).optional(),
  method: z.enum(['transfer', 'cash', 'mercadopago', 'other']),
  paid_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reference: z.string().max(200).optional(),
  period_days: z.number().int().min(1).max(366).optional(),
  covers_until: z.string().datetime().optional(),
});

router.post('/users/:id/payments', async (req: Request, res: Response) => {
  const parsed = paymentBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
  const before = await getUser(req.params.id);
  if (!before) return res.status(404).json({ error: 'not_found' });

  const membership = await registerPayment(req.params.id, {
    amount: parsed.data.amount,
    currency: parsed.data.currency,
    method: parsed.data.method,
    paidAt: parsed.data.paid_at,
    reference: parsed.data.reference ?? null,
    periodDays: parsed.data.period_days,
    coversUntil: parsed.data.covers_until,
    recordedBy: req.user!.id,
  });

  await logAudit({
    type: 'payment_registered',
    actor: await actorEmail(req),
    target: before.email,
    target_id: req.params.id,
    severity: 'brand',
    meta: { amount: parsed.data.amount, method: parsed.data.method, paid_until: membership.paid_until },
  });

  res.status(201).json({ membership });
});

router.post('/users/:id/membership/cancel', async (req: Request, res: Response) => {
  const before = await getUser(req.params.id);
  if (!before) return res.status(404).json({ error: 'not_found' });
  await cancelMembership(req.params.id);
  await logAudit({
    type: 'membership_cancelled',
    actor: await actorEmail(req),
    target: before.email,
    target_id: req.params.id,
    severity: 'destructive',
  });
  res.json({ ok: true });
});
```

- [ ] **Step 4: Allow new audit types**

In `src/services/admin.service.ts`, find the `logAudit` `type` parameter union and add `'payment_registered'` and `'membership_cancelled'`. (Search for `subscription_cancelled` — the union listing audit event types — and extend it.)

- [ ] **Step 5: Deprecate the old manual-subscription path**

Above `router.put('/users/:id/subscription', ...)` in `src/routes/admin.ts`, add:

```ts
// @deprecated Superseded by POST /users/:id/payments (membership model). The
// tier concept it carries no longer gates anything. Remove once the admin
// dashboard uses register-payment.
```
And add a matching `@deprecated` JSDoc above `upsertManualSubscription` and `cancelSubscription` in `src/services/admin.service.ts`. (No behavior change — keep them working until the frontend migrates.)

- [ ] **Step 6: Run to verify pass**

Run: `npm test -- admin-payments && npx tsc --noEmit`
Expected: 4 tests PASS, typecheck exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/routes/admin.ts src/services/admin.service.ts tests/integration/admin-payments.test.ts
git commit -m "feat(admin): register-payment + cancel-membership endpoints; deprecate manual subscription path"
```

---

## Task 8: Surface membership in the admin user query

**Files:**
- Modify: `src/services/admin.service.ts` (`AdminUserRow`, `listUsers`, `getUser`)
- Test: `tests/integration/admin-payments.test.ts` (add a case) or `operations-athletes.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/integration/admin-payments.test.ts`:

```ts
it('admin user row exposes membership_status and paid_until', async () => {
  const adminId = await createAdmin();
  const tok = signToken({ id: adminId, role: 'admin' });
  const { id: athleteId } = await signupUserInDb('row@test.local', 'pwd-test-1234', true);
  await setMembership(athleteId, new Date(Date.now() + 5 * 86_400_000).toISOString(), 'expiring');

  const r = await request(app).get(`/api/admin/users/${athleteId}`)
    .set('Authorization', `Bearer ${tok}`);
  expect(r.status).toBe(200);
  expect(r.body.membership_status).toBe('expiring');
  expect(r.body.paid_until).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- admin-payments`
Expected: the new case FAILS (`membership_status` undefined).

- [ ] **Step 3: Extend `AdminUserRow` + both queries**

In `src/services/admin.service.ts`:

a) Add to the `AdminUserRow` interface:

```ts
  membership_status: 'active' | 'expiring' | 'expired' | 'cancelled' | null;
  paid_until: string | null;
```

b) In **both** `listUsers` and `getUser` SQL, add a membership left-join and select. In the `SELECT` list add:

```sql
      mem.status AS membership_status,
      mem.paid_until AS paid_until,
```

and add the join (alongside the existing `LEFT JOIN`s):

```sql
    LEFT JOIN memberships mem ON mem.user_id = u.id
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- admin-payments && npx tsc --noEmit`
Expected: all PASS, typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/services/admin.service.ts tests/integration/admin-payments.test.ts
git commit -m "feat(admin): expose membership_status + paid_until on admin user rows"
```

---

## Task 9: Full-suite regression check

- [ ] **Step 1: Run the whole backend suite**

Run: `npm test 2>&1 | grep -E "^FAIL|Tests:|Test Suites:"`
Expected: the 7 pre-existing env-bound failures only (`onboarding`, `session-routes`, `session`, `sync`, `engine.service` integration, `openai.service`, `push.service` — OpenAI `.parse` / Firebase env). No new failing suites. All membership/auth/admin suites green.

- [ ] **Step 2: Typecheck + lint changed files**

Run: `npx tsc --noEmit`
Expected: exit 0. (Lint has pre-existing `parserOptions.project` errors on test files — ignore those; ensure no new errors in changed `src/` files.)

- [ ] **Step 3: Final commit if anything pending**

```bash
git add -A && git commit -m "test: membership feature full-suite green (pre-existing env failures excluded)"
```

---

## Out of scope (sibling plan)

The React **admin dashboard UI** (spec §7.3) — membership badges, expiring/expired filters, payment-history view, and the register-payment form — is a separate subsystem (`frontend/`, Vitest). The backend here exposes everything it needs (`membership_status`, `paid_until` on user rows; `POST /users/:id/payments`; `POST /users/:id/membership/cancel`). Write `docs/superpowers/plans/2026-06-01-admin-membership-dashboard.md` after this lands.

## Self-review notes

- **Spec coverage:** §3 data model → T1, T2; §4 lifecycle → T6; §5 enforcement → T4 (login+refresh), T6 (cron); §6 expired→not_approved reason → T4 Step 4; §7 admin workflow → T7, T8; §8 MP seam → untouched (verified, `method='mercadopago'` allowed in T1); §9 testing → each task; §10 rollout → T1 backfill + additive migrations; dashboard §7.3 → sibling plan.
- **Type consistency:** `registerPayment(userId, {paidAt, periodDays, coversUntil, recordedBy})` signature identical across T3 (def), T7 (caller). `isActive`, `getMembership`, `cancelMembership`, `GRACE_DAYS` names consistent T3↔T6. `membership_active` alias used in both `login()` and `refresh()` (T4).
- **No placeholders:** every code step has full code.
```
