import { jest } from '@jest/globals';

process.env.OWNER_COACH_EMAIL ??= 'owner-test@example.local';
process.env.DATABASE_URL ??= 'postgres://user:password@localhost:5433/mydb';
process.env.JWT_SECRET ??= 'jwt-test-secret-12345';
process.env.OPENAI_API_KEY ??= 'sk-test-12345';
process.env.RESEND_API_KEY ??= 'rk-test-12345';
process.env.MP_ACCESS_TOKEN ??= 'mp-test';
process.env.MP_WEBHOOK_SECRET ??= 'mp-webhook-test';
process.env.MP_PLAN_ID_BASICO ??= 'plan-b';
process.env.MP_PLAN_ID_FULL ??= 'plan-f';
process.env.MP_PLAN_ID_PREMIUM ??= 'plan-p';

interface FakeQueryResult { rows: unknown[]; rowCount: number }
type Handler = (sql: string, params?: unknown[]) => FakeQueryResult | null;
const handlers: Handler[] = [];

function pushHandler(matcher: (sql: string) => boolean, rows: unknown[]) {
  handlers.push((sql) => (matcher(sql) ? { rows, rowCount: rows.length } : null));
}

const fakePool = {
  async query(sql: string, params?: unknown[]) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    for (const h of handlers) {
      const r = h(normalized, params);
      if (r !== null) return r;
    }
    return { rows: [], rowCount: 0 };
  },
};

jest.unstable_mockModule('../../src/db/connect.js', () => ({
  default: fakePool,
}));

const { computeNextPendingDay } = await import('../../src/services/engine.service.js');

beforeEach(() => {
  handlers.length = 0;
});

function seed(opts: {
  currentWeek?: number;
  activeSkeletonId?: string | null;
  daysPerWeek?: number;
  lastDay?: number;
}) {
  pushHandler(
    (s) => s.startsWith('SELECT current_week, active_skeleton_id FROM athlete_program_state'),
    [{
      current_week: opts.currentWeek ?? 1,
      active_skeleton_id: opts.activeSkeletonId === undefined ? 'sk-1' : opts.activeSkeletonId,
    }],
  );
  pushHandler(
    (s) => s.startsWith('SELECT days_per_week FROM athlete_profiles'),
    [{ days_per_week: 'daysPerWeek' in opts ? (opts.daysPerWeek ?? null) : 4 }],
  );
  pushHandler(
    (s) => s.startsWith('SELECT COALESCE(MAX(day_of_week), 0)'),
    [{ last_day: opts.lastDay ?? 0 }],
  );
}

describe('computeNextPendingDay', () => {
  it('returns 1 when no sessions finished', async () => {
    seed({ lastDay: 0 });
    expect(await computeNextPendingDay('athlete-1')).toBe(1);
  });

  it('returns lastDay + 1 within the program week', async () => {
    seed({ lastDay: 2, daysPerWeek: 4 });
    expect(await computeNextPendingDay('athlete-1')).toBe(3);
  });

  it('wraps to 1 after finishing the last day', async () => {
    seed({ lastDay: 4, daysPerWeek: 4 });
    expect(await computeNextPendingDay('athlete-1')).toBe(1);
  });

  it('returns 1 when athlete has no program_state row', async () => {
    pushHandler(
      (s) => s.startsWith('SELECT days_per_week FROM athlete_profiles'),
      [{ days_per_week: 4 }],
    );
    expect(await computeNextPendingDay('ghost')).toBe(1);
  });

  it('treats missing days_per_week as 7', async () => {
    seed({ daysPerWeek: undefined, lastDay: 7 });
    // last 7, days_per_week defaults to 7 → (7 % 7) + 1 = 1
    expect(await computeNextPendingDay('athlete-1')).toBe(1);
  });
});
