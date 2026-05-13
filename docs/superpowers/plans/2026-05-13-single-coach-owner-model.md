# Single-Coach Owner Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route every new athlete to a single configured owner coach (`OWNER_COACH_EMAIL`), backfill existing rows to the same owner, and fail loudly if the owner account is missing — so the admin login always sees every athlete.

**Architecture:** A new required env var pins the owner. The onboarding route looks up the coach by email instead of `ORDER BY created_at LIMIT 1`. A standalone idempotent script ensures the owner user + `coach_profiles` row exist, then backfills `athlete_profiles.coach_id` and `coach_alerts.coach_id`.

**Tech Stack:** Node.js 20, Express 4, TypeScript (ES modules), PostgreSQL 15 via `pg`, zod for env validation, bcrypt via `hashPassword` (already in `auth.service`), Jest for tests.

**Spec:** `docs/superpowers/specs/2026-05-13-single-coach-owner-model-design.md`

---

## File Structure

**New (2):**
- `backend/src/scripts/setup-owner-coach.ts` — idempotent setup + backfill.
- `backend/tests/unit/setup-owner-coach.test.ts` — idempotency test.

**Modified (4):**
- `backend/env.example` — document the new key.
- `backend/src/config/env.ts` — validate `OWNER_COACH_EMAIL`.
- `backend/src/routes/onboarding.ts` — replace the coach-selection SQL.
- `backend/tests/integration/onboarding.test.ts` — assert assignment to env-configured coach.

---

## Task 1: Add `OWNER_COACH_EMAIL` env var

**Files:**
- Modify: `backend/env.example`
- Modify: `backend/src/config/env.ts`

- [ ] **Step 1: Add the key to `env.example`**

Open `backend/env.example`. After the existing `MP_NOTIFICATION_URL=...` block (end of file), append:

```bash

# Single owner coach (athletes route here on onboarding). Required.
# Create the user via: npx tsx src/scripts/setup-owner-coach.ts <password>
OWNER_COACH_EMAIL=owner@example.com
```

- [ ] **Step 2: Add to the zod schema**

Open `backend/src/config/env.ts`. Inside the `schema = z.object({...})` body, after the last `MP_*` entry and before the closing `})`, add:

```ts
  OWNER_COACH_EMAIL: z.string().email(),
```

- [ ] **Step 3: Set the value in your local `.env`**

The plan execution environment uses `backend/.env`. Append:

```
OWNER_COACH_EMAIL=tatoroblesfit@gmail.com
```

(If running tests without `.env`, the integration test sets it via
`process.env` before importing.)

- [ ] **Step 4: Type-check**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web/backend && npx tsc --noEmit`
Expected: no errors in `config/env.ts`.

- [ ] **Step 5: Commit**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web
git add backend/env.example backend/src/config/env.ts
git commit -m "feat(backend): add required OWNER_COACH_EMAIL env"
```

---

## Task 2: Route onboarding to the owner coach

**Files:**
- Modify: `backend/src/routes/onboarding.ts`

- [ ] **Step 1: Read the current coach-selection block**

Open `backend/src/routes/onboarding.ts` and locate this exact block (around line 28):

```ts
  // Auto-assign first coach (Fase 1: single-coach model per spec Open Q #1)
  const coachR = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE role = 'coach' ORDER BY created_at ASC LIMIT 1`,
  );
  const coachId = coachR.rows[0]?.id ?? null;
```

- [ ] **Step 2: Replace with env-driven lookup**

Add `import { env } from '../config/env.js';` near the existing top-of-file imports (only if not already imported).

Replace the block above with:

```ts
  // Single-coach owner model: route to the configured OWNER_COACH_EMAIL.
  const coachR = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE email = $1 AND role = 'coach'`,
    [env.OWNER_COACH_EMAIL],
  );
  const coachId = coachR.rows[0]?.id;
  if (!coachId) {
    logger.error(
      { ownerEmail: env.OWNER_COACH_EMAIL },
      'owner coach missing — run src/scripts/setup-owner-coach.ts',
    );
    return res.status(500).json({ error: 'owner_coach_missing' });
  }
```

`logger` is already imported. `env` import is required.

- [ ] **Step 3: Type-check**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web/backend && npx tsc --noEmit`
Expected: no errors in `routes/onboarding.ts`.

- [ ] **Step 4: Commit**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web
git add backend/src/routes/onboarding.ts
git commit -m "feat(backend): onboarding routes athletes to OWNER_COACH_EMAIL"
```

---

## Task 3: Update integration test for owner-coach assignment

**Files:**
- Modify: `backend/tests/integration/onboarding.test.ts`

- [ ] **Step 1: Set `OWNER_COACH_EMAIL` before the test imports take effect**

At the top of `backend/tests/integration/onboarding.test.ts`, BEFORE any `import` lines, add:

```ts
process.env.OWNER_COACH_EMAIL = 'owner-test@example.local';
```

(The env zod schema runs at module load; setting the variable
before imports ensures it is present.)

- [ ] **Step 2: Create the owner-coach user in the existing `beforeAll`**

Locate the `beforeAll` block in the test file. Inside it, after the
existing setup (likely `await ensureMigrated()` or similar), add:

```ts
import bcrypt from 'bcrypt';

// Create the configured owner coach so onboarding has a valid target.
const ownerHash = await bcrypt.hash('owner-test-pass', 4);
await pool.query(
  `INSERT INTO users (email, password_hash, role, email_verified, email_verified_at)
   VALUES ($1, $2, 'coach', TRUE, NOW())
   ON CONFLICT (email) DO NOTHING`,
  ['owner-test@example.local', ownerHash],
);
const { rows: ownerRows } = await pool.query<{ id: string }>(
  `SELECT id FROM users WHERE email = $1`,
  ['owner-test@example.local'],
);
const ownerCoachId = ownerRows[0].id;
await pool.query(
  `INSERT INTO coach_profiles (user_id, name) VALUES ($1, 'Owner Test')
   ON CONFLICT (user_id) DO NOTHING`,
  [ownerCoachId],
);
```

If `bcrypt` is already imported at the top of the file, do not
import it again. If `ownerCoachId` should be reused inside `it(...)`
blocks, hoist it to module scope and assign inside `beforeAll`:

```ts
let ownerCoachId: string;
beforeAll(async () => {
  // … existing setup …
  // … owner-coach insert from above …
  ownerCoachId = ownerRows[0].id;
});
```

- [ ] **Step 3: Replace the loose `toBeTruthy()` assertion**

Find this block (around line 102):

```ts
const prof = await pool.query<{ coach_id: string | null }>(
  `SELECT coach_id FROM athlete_profiles WHERE user_id = $1`, [u],
);
expect(prof.rows[0].coach_id).toBeTruthy();
```

Replace with:

```ts
const prof = await pool.query<{ coach_id: string | null }>(
  `SELECT coach_id FROM athlete_profiles WHERE user_id = $1`, [u],
);
expect(prof.rows[0].coach_id).toBe(ownerCoachId);
```

- [ ] **Step 4: Run the test**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web/backend && npm test -- tests/integration/onboarding.test.ts`

Expected: the assignment test passes. If the test DB (`trfit_test`)
is not configured locally, the suite will fail to connect — that is
a pre-existing environmental issue and is acceptable. Note in the
commit message if so. (Other suites in this repo were already
failing for the same reason before this change.)

- [ ] **Step 5: Commit**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web
git add backend/tests/integration/onboarding.test.ts
git commit -m "test(backend): onboarding asserts owner-coach assignment"
```

---

## Task 4: Idempotent setup-owner-coach script

**Files:**
- Create: `backend/src/scripts/setup-owner-coach.ts`

- [ ] **Step 1: Create the script**

Create `backend/src/scripts/setup-owner-coach.ts` with this content:

```ts
import 'dotenv/config';
import pool from '../db/connect.js';
import { hashPassword } from '../services/auth.service.js';
import { env } from '../config/env.js';

interface SetupResult {
  ownerId: string;
  created: boolean;
  athletesBackfilled: number;
  alertsBackfilled: number;
}

/**
 * Ensure a coach user exists for `OWNER_COACH_EMAIL` and re-route every
 * athlete and historical alert to that user. Idempotent: re-running with
 * the user already present is a no-op for creation and a 0-row UPDATE
 * for the backfill.
 *
 * CLI:  npx tsx src/scripts/setup-owner-coach.ts <password>
 * `<password>` is only consumed when the user does not yet exist.
 */
export async function setupOwnerCoach(passwordIfMissing: string | undefined): Promise<SetupResult> {
  const email = env.OWNER_COACH_EMAIL;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const found = await client.query<{ id: string; role: string }>(
      `SELECT id, role FROM users WHERE email = $1`,
      [email],
    );

    let ownerId: string;
    let created = false;

    if (found.rowCount === 0) {
      if (!passwordIfMissing) {
        throw new Error(
          `User ${email} does not exist. Pass a password as the first CLI arg.`,
        );
      }
      const hash = await hashPassword(passwordIfMissing);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, role, email_verified, email_verified_at)
         VALUES ($1, $2, 'coach', TRUE, NOW()) RETURNING id`,
        [email, hash],
      );
      ownerId = inserted.rows[0].id;
      await client.query(
        `INSERT INTO coach_profiles (user_id, name) VALUES ($1, $2)
         ON CONFLICT (user_id) DO NOTHING`,
        [ownerId, 'Owner'],
      );
      created = true;
    } else {
      const row = found.rows[0];
      if (row.role !== 'coach') {
        throw new Error(
          `User ${email} exists but has role='${row.role}'. Refusing to mutate.`,
        );
      }
      ownerId = row.id;
      // Ensure a coach_profiles row exists for legacy users.
      await client.query(
        `INSERT INTO coach_profiles (user_id, name) VALUES ($1, $2)
         ON CONFLICT (user_id) DO NOTHING`,
        [ownerId, 'Owner'],
      );
    }

    const athleteUpd = await client.query(
      `UPDATE athlete_profiles SET coach_id = $1
       WHERE coach_id IS DISTINCT FROM $1`,
      [ownerId],
    );

    const alertUpd = await client.query(
      `UPDATE coach_alerts SET coach_id = $1
       WHERE coach_id IS DISTINCT FROM $1`,
      [ownerId],
    );

    await client.query('COMMIT');
    return {
      ownerId,
      created,
      athletesBackfilled: athleteUpd.rowCount ?? 0,
      alertsBackfilled: alertUpd.rowCount ?? 0,
    };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function main() {
  const password = process.argv[2];
  const result = await setupOwnerCoach(password);
  if (result.created) {
    console.log(`Created owner coach ${env.OWNER_COACH_EMAIL} (id=${result.ownerId})`);
  } else {
    console.log(`Owner coach already exists (id=${result.ownerId})`);
  }
  console.log(
    `Backfilled athletes=${result.athletesBackfilled} alerts=${result.alertsBackfilled}`,
  );
  await pool.end();
}

// Only run main() when invoked directly (not when imported by tests).
const invokedDirectly = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  return entry.endsWith('setup-owner-coach.ts') || entry.endsWith('setup-owner-coach.js');
})();

if (invokedDirectly) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
```

- [ ] **Step 2: Type-check**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web/backend && npx tsc --noEmit`
Expected: no errors in `scripts/setup-owner-coach.ts`.

- [ ] **Step 3: Commit**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web
git add backend/src/scripts/setup-owner-coach.ts
git commit -m "feat(backend): idempotent setup-owner-coach script"
```

---

## Task 5: Unit test setup-owner-coach idempotency

**Files:**
- Create: `backend/tests/unit/setup-owner-coach.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/setup-owner-coach.test.ts`:

```ts
import { jest } from '@jest/globals';

process.env.OWNER_COACH_EMAIL = 'owner-test@example.local';

// Stub the env-required keys so the module loads without a real .env
process.env.DATABASE_URL ??= 'postgres://user:password@localhost:5433/mydb';
process.env.JWT_SECRET ??= 'jwt-test-secret-12345';
process.env.OPENAI_API_KEY ??= 'sk-test-12345';
process.env.RESEND_API_KEY ??= 'rk-test-12345';
process.env.MP_ACCESS_TOKEN ??= 'mp-test';
process.env.MP_WEBHOOK_SECRET ??= 'mp-webhook-test';
process.env.MP_PLAN_ID_BASICO ??= 'plan-b';
process.env.MP_PLAN_ID_FULL ??= 'plan-f';
process.env.MP_PLAN_ID_PREMIUM ??= 'plan-p';

// In-memory pool stub modelling just enough behavior for the script.
interface FakeUser { id: string; email: string; role: string }
interface FakeCoachProfile { user_id: string; name: string }
const state = {
  users: [] as FakeUser[],
  coachProfiles: [] as FakeCoachProfile[],
  athleteCoachIds: new Map<string, string | null>(),
  alertCoachIds: new Map<string, string | null>(),
  nextUuid: 0,
};

function uuid(): string {
  state.nextUuid += 1;
  return `uuid-${state.nextUuid}`;
}

const fakeClient = {
  async query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }> {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('BEGIN') || s.startsWith('COMMIT') || s.startsWith('ROLLBACK')) {
      return { rows: [], rowCount: 0 };
    }
    if (s.startsWith('SELECT id, role FROM users WHERE email')) {
      const u = state.users.find((x) => x.email === (params![0] as string));
      return u ? { rows: [u] as unknown as T[], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (s.startsWith('INSERT INTO users')) {
      const id = uuid();
      state.users.push({ id, email: params![0] as string, role: 'coach' });
      return { rows: [{ id }] as unknown as T[], rowCount: 1 };
    }
    if (s.startsWith('INSERT INTO coach_profiles')) {
      const userId = params![0] as string;
      const exists = state.coachProfiles.some((p) => p.user_id === userId);
      if (!exists) state.coachProfiles.push({ user_id: userId, name: params![1] as string });
      return { rows: [], rowCount: exists ? 0 : 1 };
    }
    if (s.startsWith('UPDATE athlete_profiles SET coach_id')) {
      const newId = params![0] as string;
      let n = 0;
      for (const [k, v] of state.athleteCoachIds) {
        if (v !== newId) {
          state.athleteCoachIds.set(k, newId);
          n += 1;
        }
      }
      return { rows: [], rowCount: n };
    }
    if (s.startsWith('UPDATE coach_alerts SET coach_id')) {
      const newId = params![0] as string;
      let n = 0;
      for (const [k, v] of state.alertCoachIds) {
        if (v !== newId) {
          state.alertCoachIds.set(k, newId);
          n += 1;
        }
      }
      return { rows: [], rowCount: n };
    }
    throw new Error(`Unhandled query in fake pool: ${s}`);
  },
  release() {},
};

const fakePool = {
  async connect() { return fakeClient; },
  async end() {},
  async query() { return { rows: [], rowCount: 0 }; },
};

jest.unstable_mockModule('../../src/db/connect.js', () => ({
  default: fakePool,
}));

jest.unstable_mockModule('../../src/services/auth.service.js', () => ({
  hashPassword: jest.fn(async (p: string) => `hashed:${p}`),
}));

const { setupOwnerCoach } = await import('../../src/scripts/setup-owner-coach.js');

beforeEach(() => {
  state.users = [];
  state.coachProfiles = [];
  state.athleteCoachIds = new Map([
    ['ath1', 'old-coach'],
    ['ath2', 'old-coach'],
  ]);
  state.alertCoachIds = new Map([['alert1', 'old-coach']]);
  state.nextUuid = 0;
});

it('creates owner user + backfills on first run', async () => {
  const r = await setupOwnerCoach('Init-Pass-9!');
  expect(r.created).toBe(true);
  expect(state.users).toHaveLength(1);
  expect(state.users[0]!.email).toBe('owner-test@example.local');
  expect(state.coachProfiles).toHaveLength(1);
  expect(r.athletesBackfilled).toBe(2);
  expect(r.alertsBackfilled).toBe(1);
});

it('is idempotent on a second run (no creation, zero backfill)', async () => {
  await setupOwnerCoach('Init-Pass-9!');
  const second = await setupOwnerCoach('Init-Pass-9!');
  expect(second.created).toBe(false);
  expect(second.athletesBackfilled).toBe(0);
  expect(second.alertsBackfilled).toBe(0);
  expect(state.users).toHaveLength(1);
  expect(state.coachProfiles).toHaveLength(1);
});

it('throws when user is missing and no password is provided', async () => {
  await expect(setupOwnerCoach(undefined)).rejects.toThrow(/does not exist/i);
});

it('throws when an existing user has the wrong role', async () => {
  state.users = [{ id: 'u1', email: 'owner-test@example.local', role: 'athlete' }];
  await expect(setupOwnerCoach('whatever')).rejects.toThrow(/Refusing to mutate/i);
});
```

- [ ] **Step 2: Run the test, verify it passes**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web/backend && npm test -- tests/unit/setup-owner-coach.test.ts`
Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web
git add backend/tests/unit/setup-owner-coach.test.ts
git commit -m "test(backend): setup-owner-coach idempotency"
```

---

## Task 6: Run the script against the dev DB

**Files:** none (one-shot setup against the live dev database).

- [ ] **Step 1: Confirm env**

Ensure `backend/.env` contains:

```
OWNER_COACH_EMAIL=tatoroblesfit@gmail.com
```

- [ ] **Step 2: Pick a starter password**

Use a temporary password of at least 12 characters that the owner
will rotate immediately. For this run, the executor should ASK the
user for the desired password. If the user defers, use this
placeholder and tell the user to reset via the reset-password flow:

```
ChangeMeNow!2026
```

- [ ] **Step 3: Run the script**

Run:

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web/backend
npx tsx src/scripts/setup-owner-coach.ts '<password>'
```

Expected stdout, first run:

```
Created owner coach tatoroblesfit@gmail.com (id=<uuid>)
Backfilled athletes=<n> alerts=<m>
```

- [ ] **Step 4: Verify in DB**

```bash
docker exec tr-fit-web-postgres-1 psql -U user -d mydb -c \
  "SELECT id, email, role FROM users WHERE email='tatoroblesfit@gmail.com';"

docker exec tr-fit-web-postgres-1 psql -U user -d mydb -c \
  "SELECT count(*)::int AS n, coach_id FROM athlete_profiles GROUP BY coach_id;"
```

Expected: tatoroblesfit row has `role='coach'`. Every
`athlete_profiles.coach_id` matches that id.

- [ ] **Step 5: Smoke test the admin login**

Log into the web admin at `http://localhost:3000` with
`tatoroblesfit@gmail.com` + chosen password. Confirm the recently
onboarded athlete is visible in the dashboard.

- [ ] **Step 6: No commit (data-only step).**

---

## Acceptance checklist (run at the end)

- [ ] `npm test -- tests/unit/setup-owner-coach.test.ts` → 4 PASS.
- [ ] Onboarding integration test asserts assignment to owner.
- [ ] `OWNER_COACH_EMAIL` is required at boot; backend fails to start
      without it.
- [ ] Running `setup-owner-coach.ts` twice leaves DB in same state.
- [ ] Web admin (`tatoroblesfit@gmail.com`) sees onboarded athletes.
