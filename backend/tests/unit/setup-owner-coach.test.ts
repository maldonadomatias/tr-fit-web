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
