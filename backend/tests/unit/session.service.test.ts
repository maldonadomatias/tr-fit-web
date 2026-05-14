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

// Stub engine.service so we don't pull in its DB dependencies.
const mockBuildToday = jest.fn(async (_a: string, _d: number) => [
  {
    exercise: { id: 1, name: 'Sentadilla', muscle_group: 'piernas', equipment: 'barra' },
    series: 3, reps: 8, weight_kg: 100, descanso: '02:00',
    slot_index: 1, role: 'principal', flag: null,
  },
  {
    exercise: { id: 2, name: 'Curl', muscle_group: 'brazos', equipment: 'mancuerna' },
    series: 2, reps: 12, weight_kg: 10, descanso: '01:00',
    slot_index: 2, role: 'accesorio', flag: null,
  },
]);
jest.unstable_mockModule('../../src/services/engine.service.js', () => ({
  buildTodaySession: mockBuildToday,
  TodayBlockedError: class TodayBlockedError extends Error {
    constructor(public reason: string) { super(reason); }
  },
}));

const { getActive } = await import('../../src/services/session.service.js');

beforeEach(() => {
  handlers.length = 0;
  mockBuildToday.mockClear();
});

describe('getActive', () => {
  it('returns null when no active session_log row', async () => {
    const r = await getActive('athlete-1');
    expect(r).toEqual({ session: null });
  });

  it('returns full payload with current_slot_index=0 when no sets', async () => {
    pushHandler(
      (s) => s.startsWith('SELECT id, day_of_week, started_at FROM session_logs'),
      [{ id: 'sess-1', day_of_week: 1, started_at: '2026-05-13T10:00:00Z' }],
    );
    pushHandler(
      (s) => s.startsWith('SELECT * FROM set_logs'),
      [],
    );
    const r = await getActive('athlete-1');
    expect(r.session).toMatchObject({
      id: 'sess-1',
      day_of_week: 1,
      current_slot_index: 0,
      sets: [],
    });
    expect(r.session?.items).toHaveLength(2);
  });

  it('advances current_slot_index by one after the first item meets series', async () => {
    pushHandler(
      (s) => s.startsWith('SELECT id, day_of_week, started_at FROM session_logs'),
      [{ id: 'sess-1', day_of_week: 1, started_at: '2026-05-13T10:00:00Z' }],
    );
    pushHandler(
      (s) => s.startsWith('SELECT * FROM set_logs'),
      [
        { exercise_id: 1, completed: true, set_index: 1 },
        { exercise_id: 1, completed: true, set_index: 2 },
        { exercise_id: 1, completed: true, set_index: 3 },
      ],
    );
    const r = await getActive('athlete-1');
    expect(r.session?.current_slot_index).toBe(1);
  });

  it('caps current_slot_index at items.length when all complete', async () => {
    pushHandler(
      (s) => s.startsWith('SELECT id, day_of_week, started_at FROM session_logs'),
      [{ id: 'sess-1', day_of_week: 1, started_at: '2026-05-13T10:00:00Z' }],
    );
    pushHandler(
      (s) => s.startsWith('SELECT * FROM set_logs'),
      [
        { exercise_id: 1, completed: true, set_index: 1 },
        { exercise_id: 1, completed: true, set_index: 2 },
        { exercise_id: 1, completed: true, set_index: 3 },
        { exercise_id: 2, completed: true, set_index: 1 },
        { exercise_id: 2, completed: true, set_index: 2 },
      ],
    );
    const r = await getActive('athlete-1');
    expect(r.session?.current_slot_index).toBe(2); // items.length
  });

  it('ignores incomplete sets when counting', async () => {
    pushHandler(
      (s) => s.startsWith('SELECT id, day_of_week, started_at FROM session_logs'),
      [{ id: 'sess-1', day_of_week: 1, started_at: '2026-05-13T10:00:00Z' }],
    );
    pushHandler(
      (s) => s.startsWith('SELECT * FROM set_logs'),
      [
        { exercise_id: 1, completed: true, set_index: 1 },
        { exercise_id: 1, completed: false, set_index: 2 },
        { exercise_id: 1, completed: true, set_index: 3 },
      ],
    );
    const r = await getActive('athlete-1');
    // 2 completed out of 3 series → first item NOT complete → stays at 0
    expect(r.session?.current_slot_index).toBe(0);
  });
});
