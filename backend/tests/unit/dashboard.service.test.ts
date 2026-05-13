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

interface FakeQueryResult {
  rows: unknown[];
  rowCount: number;
}

type Handler = (sql: string, params?: unknown[]) => FakeQueryResult;
const handlers: Handler[] = [];

function pushHandler(matcher: (sql: string) => boolean, rows: unknown[]) {
  handlers.push((sql) => (matcher(sql) ? { rows, rowCount: rows.length } : { rows: [], rowCount: 0 }));
}

const fakePool = {
  async query(sql: string, params?: unknown[]) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    for (const h of handlers) {
      const r = h(normalized, params);
      if (r.rowCount > 0) return r;
    }
    return { rows: [], rowCount: 0 };
  },
  async connect() {
    return {
      async query(sql: string, params?: unknown[]) {
        return fakePool.query(sql, params);
      },
      release() {},
    };
  },
};

jest.unstable_mockModule('../../src/db/connect.js', () => ({
  default: fakePool,
}));

const { computeStreak, projectNextSessions } = await import('../../src/services/dashboard.service.js');

beforeEach(() => {
  handlers.length = 0;
});

function isoDays(offsets: number[]): string[] {
  const today = new Date();
  return offsets.map((n) => {
    const d = new Date(today);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  });
}

describe('computeStreak', () => {
  it('returns 0 when there are no finished sessions', async () => {
    const r = await computeStreak('athlete-1');
    expect(r).toBe(0);
  });

  it('counts a single completed day today as 1', async () => {
    const [today] = isoDays([0]);
    pushHandler((s) => s.includes('FROM session_logs'), [{ day: today }]);
    const r = await computeStreak('athlete-1');
    expect(r).toBe(1);
  });

  it('counts today + yesterday as 2', async () => {
    const days = isoDays([0, 1]);
    pushHandler((s) => s.includes('FROM session_logs'),
      days.map((day) => ({ day })));
    const r = await computeStreak('athlete-1');
    expect(r).toBe(2);
  });

  it('returns 0 when most recent log is older than yesterday', async () => {
    const days = isoDays([3, 4, 5]);
    pushHandler((s) => s.includes('FROM session_logs'),
      days.map((day) => ({ day })));
    const r = await computeStreak('athlete-1');
    expect(r).toBe(0);
  });

  it('stops at the first gap (today, yesterday, gap, more)', async () => {
    const days = isoDays([0, 1, 3, 4]);
    pushHandler((s) => s.includes('FROM session_logs'),
      days.map((day) => ({ day })));
    const r = await computeStreak('athlete-1');
    expect(r).toBe(2);
  });
});

describe('projectNextSessions', () => {
  const FIXED_NOW = new Date('2026-05-13T12:00:00Z'); // Wed

  it('returns 3 entries — mix of training days and rest days', () => {
    // days_specific = lun, mie, vie. Today = Wed. Next 3: Thu(rest), Fri(train), Sat(rest).
    const r = projectNextSessions({
      now: FIXED_NOW,
      daysSpecific: ['lun', 'mie', 'vie'],
      slotsByDay: { 1: 5, 3: 6, 5: 4 },
      focusByDay: { 1: 'Pecho', 3: 'Espalda', 5: 'Piernas' },
      estimatedMin: 60,
    });
    expect(r).toHaveLength(3);
    expect(r[0]?.rest).toBe(true);
    expect(r[1]?.rest).toBe(false);
    expect(r[1]?.focus).toBe('Piernas');
    expect(r[1]?.exerciseCount).toBe(4);
    expect(r[2]?.rest).toBe(true);
  });

  it('uses null focus when skeleton_days is missing for that day', () => {
    const r = projectNextSessions({
      now: FIXED_NOW,
      daysSpecific: ['jue'],
      slotsByDay: { 4: 5 },
      focusByDay: {},
      estimatedMin: 60,
    });
    expect(r[0]?.rest).toBe(false);
    expect(r[0]?.focus).toBeNull();
  });

  it('formats date as "<Weekday> <DOM>" in Spanish (3 letter)', () => {
    const r = projectNextSessions({
      now: FIXED_NOW,
      daysSpecific: ['jue'],
      slotsByDay: { 4: 5 },
      focusByDay: { 4: 'Brazos' },
      estimatedMin: 60,
    });
    // Tomorrow from 2026-05-13 = 2026-05-14 = Thursday (Jue 14)
    expect(r[0]?.date).toBe('Jue 14');
  });
});
