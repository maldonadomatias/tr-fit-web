import { jest } from '@jest/globals';

process.env.OWNER_COACH_EMAIL ??= 'owner-test@example.local';
process.env.DATABASE_URL ??= 'postgres://postgres:postgres@localhost:5432/trfit_test';
process.env.JWT_SECRET ??= 'jwt-test-secret-12345';
process.env.OPENAI_API_KEY ??= 'sk-test-12345';
process.env.RESEND_API_KEY ??= 'rk-test-12345';

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
  daysSpecific?: string[] | null;
  exerciseMinutes?: number;
  daysPerWeek?: number;
  currentWeek?: number;
  activeSkeletonId?: string | null;
  startDate?: string | null;
  periodization?: Array<{
    week_number: number;
    block_label: string;
    is_deload?: boolean;
    is_rm_test?: boolean;
  }>;
  slotCounts?: Array<{ day_of_week: number; n: number }>;
  focuses?: Array<{ day_of_week: number; focus: string }>;
  doneLogs?: Array<{ program_week: number; day_of_week: number }>;
}) {
  pushHandler(
    (s) => s.startsWith('SELECT name, days_specific, exercise_minutes FROM athlete_profiles')
         || s.startsWith('SELECT name, days_per_week, days_specific, exercise_minutes'),
    [{
      name: 'Test',
      days_specific:
        opts.daysSpecific === undefined ? ['lun', 'mar', 'jue', 'sab'] : opts.daysSpecific,
      exercise_minutes: opts.exerciseMinutes ?? 60,
      days_per_week: opts.daysPerWeek ?? 4,
    }],
  );
  pushHandler(
    (s) => s.startsWith('SELECT current_week, active_skeleton_id')
        && s.includes('FROM athlete_program_state'),
    [{
      current_week: opts.currentWeek ?? 5,
      active_skeleton_id: opts.activeSkeletonId === undefined ? 'sk-1' : opts.activeSkeletonId,
      start_date: opts.startDate === undefined ? '2026-03-02' : opts.startDate,
    }],
  );
  pushHandler(
    (s) => s.startsWith('SELECT week_number, block_label')
        && s.includes('FROM periodization_config'),
    (opts.periodization ?? [
      { week_number: 1, block_label: 'Hipertrofia' },
      { week_number: 2, block_label: 'Hipertrofia' },
      { week_number: 3, block_label: 'Hipertrofia' },
      { week_number: 4, block_label: 'Hipertrofia' },
      { week_number: 5, block_label: 'Fuerza' },
      { week_number: 6, block_label: 'Fuerza' },
      { week_number: 7, block_label: 'Fuerza' },
      { week_number: 8, block_label: 'Fuerza' },
    ]).map((row) => ({ is_deload: false, is_rm_test: false, ...row })),
  );
  pushHandler(
    (s) => s.startsWith('SELECT day_of_week, COUNT(*)::int AS n FROM skeleton_slots'),
    opts.slotCounts ?? [
      { day_of_week: 1, n: 6 }, { day_of_week: 2, n: 5 },
      { day_of_week: 3, n: 6 }, { day_of_week: 4, n: 4 },
    ],
  );
  pushHandler(
    (s) => s.startsWith('SELECT day_of_week, focus FROM skeleton_days'),
    opts.focuses ?? [
      { day_of_week: 1, focus: 'Pecho' }, { day_of_week: 2, focus: 'Espalda' },
      { day_of_week: 3, focus: 'Piernas' }, { day_of_week: 4, focus: 'Hombros' },
    ],
  );
  pushHandler(
    (s) => s.startsWith('SELECT program_week, day_of_week FROM session_logs'),
    opts.doneLogs ?? [],
  );
}

describe('buildPlan', () => {
  it('splits repeated labels into contiguous blocks', async () => {
    seedBasicFixtures({
      periodization: [
        { week_number: 1, block_label: 'Hipertrofia' },
        { week_number: 2, block_label: 'Hipertrofia' },
        { week_number: 3, block_label: 'Descarga', is_deload: true },
        { week_number: 4, block_label: 'Hipertrofia' },
      ],
    });
    const r = await buildPlan('athlete-1');
    expect(r.blocks).toHaveLength(3);
    expect(r.blocks.map((b) => b.name)).toEqual(['Hipertrofia', 'Descarga', 'Hipertrofia']);
    expect(r.blocks.map((b) => b.weeks.map((w) => w.weekNumber))).toEqual([[1, 2], [3], [4]]);
  });

  it('gives each contiguous block a unique id and keeps the label as name and tag', async () => {
    seedBasicFixtures({
      periodization: [
        { week_number: 1, block_label: 'Hipertrofia' },
        { week_number: 2, block_label: 'Descarga', is_deload: true },
        { week_number: 3, block_label: 'Hipertrofia' },
      ],
    });
    const r = await buildPlan('athlete-1');
    const ids = r.blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(['Hipertrofia#1', 'Descarga#2', 'Hipertrofia#3']);
    expect(r.blocks[2]!.name).toBe('Hipertrofia');
    expect(r.blocks[2]!.tag).toBe('Hipertrofia');
  });

  it('points currentBlockId at the contiguous block holding current_week', async () => {
    seedBasicFixtures({
      currentWeek: 3,
      periodization: [
        { week_number: 1, block_label: 'Hipertrofia' },
        { week_number: 2, block_label: 'Descarga', is_deload: true },
        { week_number: 3, block_label: 'Hipertrofia' },
      ],
    });
    const r = await buildPlan('athlete-1');
    expect(r.currentBlockId).toBe('Hipertrofia#3');
  });

  it('marks a block as test when any of its weeks is an RM test', async () => {
    seedBasicFixtures({
      periodization: [{ week_number: 1, block_label: 'Testeo RM', is_rm_test: true }],
    });
    const r = await buildPlan('athlete-1');
    expect(r.blocks[0]!.kind).toBe('test');
  });

  it('marks a block as deload when any of its weeks is a deload', async () => {
    seedBasicFixtures({
      periodization: [
        { week_number: 1, block_label: 'Descarga - pre RM', is_deload: true },
      ],
    });
    const r = await buildPlan('athlete-1');
    expect(r.blocks[0]!.kind).toBe('deload');
  });

  it('defaults a block to work', async () => {
    seedBasicFixtures({});
    const r = await buildPlan('athlete-1');
    expect(r.blocks.every((b) => b.kind === 'work')).toBe(true);
  });

  it('sets currentBlockId from current_week', async () => {
    seedBasicFixtures({ currentWeek: 5 });
    const r = await buildPlan('athlete-1');
    expect(r.currentBlockId).toBe('Fuerza#5');
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
      startDate: null,
    });
  });

  it('returns the program start date as YYYY-MM-DD', async () => {
    seedBasicFixtures({ startDate: '2026-03-02' });
    const r = await buildPlan('athlete-1');
    expect(r.startDate).toBe('2026-03-02');
  });

  it('returns startDate null when the program state has no start date', async () => {
    seedBasicFixtures({ startDate: null });
    const r = await buildPlan('athlete-1');
    expect(r.startDate).toBeNull();
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

  it('iterates 1..days_per_week so exerciseCount matches slot counts', async () => {
    seedBasicFixtures({});
    const r = await buildPlan('athlete-1');
    // days_per_week=4, slot counts = {1:6, 2:5, 3:6, 4:4}
    const week1 = r.blocks[0]!.weeks[0]!;
    expect(week1.sessions.map((s) => s.exerciseCount)).toEqual([6, 5, 6, 4]);
  });

  it('maps each session to its real weekday from days_specific', async () => {
    seedBasicFixtures({ daysSpecific: ['lun', 'mar', 'jue', 'sab'], daysPerWeek: 4 });
    const r = await buildPlan('athlete-1');
    const week1 = r.blocks[0]!.weeks[0]!;
    expect(week1.sessions.map((s) => s.weekday)).toEqual([0, 1, 3, 5]);
  });

  it('returns weekday null when the profile has no days_specific', async () => {
    // El perfil viejo guarda days_per_week pero no la lista de días.
    seedBasicFixtures({ daysSpecific: null, daysPerWeek: 3 });
    const r = await buildPlan('athlete-1');
    const week1 = r.blocks[0]!.weeks[0]!;
    expect(week1.sessions.map((s) => s.weekday)).toEqual([null, null, null]);
  });

  it('returns weekday null for sessions beyond the stored days', async () => {
    // days_per_week quedó en 4 pero days_specific sólo tiene 2 días.
    seedBasicFixtures({ daysSpecific: ['mie', 'vie'], daysPerWeek: 4 });
    const r = await buildPlan('athlete-1');
    const week1 = r.blocks[0]!.weeks[0]!;
    expect(week1.sessions.map((s) => s.weekday)).toEqual([2, 4, null, null]);
  });
});
