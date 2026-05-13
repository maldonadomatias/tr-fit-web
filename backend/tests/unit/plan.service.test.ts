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

const { buildPlan } = await import('../../src/services/plan.service.js');

beforeEach(() => {
  handlers.length = 0;
});

function seedBasicFixtures(opts: {
  daysSpecific?: string[];
  exerciseMinutes?: number;
  currentWeek?: number;
  activeSkeletonId?: string | null;
  periodization?: Array<{ week_number: number; block_label: string }>;
  slotCounts?: Array<{ day_of_week: number; n: number }>;
  focuses?: Array<{ day_of_week: number; focus: string }>;
  doneLogs?: Array<{ program_week: number; day_of_week: number }>;
}) {
  pushHandler(
    (s) => s.startsWith('SELECT name, days_specific, exercise_minutes FROM athlete_profiles'),
    [{
      name: 'Test', days_specific: opts.daysSpecific ?? ['lun', 'mar', 'jue', 'sab'],
      exercise_minutes: opts.exerciseMinutes ?? 60,
    }],
  );
  pushHandler(
    (s) => s.startsWith('SELECT current_week, active_skeleton_id FROM athlete_program_state'),
    [{
      current_week: opts.currentWeek ?? 5,
      active_skeleton_id: opts.activeSkeletonId === undefined ? 'sk-1' : opts.activeSkeletonId,
    }],
  );
  pushHandler(
    (s) => s.startsWith('SELECT week_number, block_label FROM periodization_config'),
    opts.periodization ?? [
      { week_number: 1, block_label: 'Hipertrofia' },
      { week_number: 2, block_label: 'Hipertrofia' },
      { week_number: 3, block_label: 'Hipertrofia' },
      { week_number: 4, block_label: 'Hipertrofia' },
      { week_number: 5, block_label: 'Fuerza' },
      { week_number: 6, block_label: 'Fuerza' },
      { week_number: 7, block_label: 'Fuerza' },
      { week_number: 8, block_label: 'Fuerza' },
    ],
  );
  pushHandler(
    (s) => s.startsWith('SELECT day_of_week, COUNT(*)::int AS n FROM skeleton_slots'),
    opts.slotCounts ?? [
      { day_of_week: 1, n: 6 }, { day_of_week: 2, n: 5 },
      { day_of_week: 4, n: 6 }, { day_of_week: 6, n: 4 },
    ],
  );
  pushHandler(
    (s) => s.startsWith('SELECT day_of_week, focus FROM skeleton_days'),
    opts.focuses ?? [
      { day_of_week: 1, focus: 'Pecho' }, { day_of_week: 2, focus: 'Espalda' },
      { day_of_week: 4, focus: 'Piernas' }, { day_of_week: 6, focus: 'Hombros' },
    ],
  );
  pushHandler(
    (s) => s.startsWith('SELECT program_week, day_of_week FROM session_logs'),
    opts.doneLogs ?? [],
  );
}

describe('buildPlan', () => {
  it('groups weeks by block_label preserving first-seen order', async () => {
    seedBasicFixtures({});
    const r = await buildPlan('athlete-1');
    expect(r.totalWeeks).toBe(8);
    expect(r.blocks).toHaveLength(2);
    expect(r.blocks[0]!.id).toBe('Hipertrofia');
    expect(r.blocks[0]!.weeks.map((w) => w.weekNumber)).toEqual([1, 2, 3, 4]);
    expect(r.blocks[1]!.id).toBe('Fuerza');
    expect(r.blocks[1]!.weeks.map((w) => w.weekNumber)).toEqual([5, 6, 7, 8]);
  });

  it('sets currentBlockId from current_week', async () => {
    seedBasicFixtures({ currentWeek: 5 });
    const r = await buildPlan('athlete-1');
    expect(r.currentBlockId).toBe('Fuerza');
    expect(r.currentWeekNumber).toBe(5);
  });

  it('marks a session done when a finished log row matches', async () => {
    seedBasicFixtures({
      doneLogs: [{ program_week: 3, day_of_week: 1 }],
    });
    const r = await buildPlan('athlete-1');
    const week3 = r.blocks[0]!.weeks.find((w) => w.weekNumber === 3)!;
    const session1 = week3.sessions.find((s) => s.day === 1)!;
    expect(session1.done).toBe(true);
    const session2 = week3.sessions.find((s) => s.day === 2)!;
    expect(session2.done).toBe(false);
  });

  it('uses "Día N" without focus suffix when no skeleton_days row', async () => {
    seedBasicFixtures({ focuses: [] });
    const r = await buildPlan('athlete-1');
    const titles = r.blocks[0]!.weeks[0]!.sessions.map((s) => s.title);
    expect(titles).toEqual(['Día 1', 'Día 2', 'Día 3', 'Día 4']);
  });

  it('returns zero defaults when no profile exists', async () => {
    // No handlers seeded — fakePool returns empty rows for everything.
    const r = await buildPlan('ghost');
    expect(r).toEqual({
      totalWeeks: 0,
      currentBlockId: null,
      currentWeekNumber: 0,
      blocks: [],
    });
  });

  it('renders sessions with exerciseCount=0 when no active skeleton', async () => {
    seedBasicFixtures({ activeSkeletonId: null, slotCounts: [], focuses: [] });
    const r = await buildPlan('athlete-1');
    const week1 = r.blocks[0]!.weeks[0]!;
    expect(week1.sessions).toHaveLength(4);
    for (const s of week1.sessions) {
      expect(s.exerciseCount).toBe(0);
      expect(s.title).toMatch(/^Día \d+$/);
    }
  });
});
