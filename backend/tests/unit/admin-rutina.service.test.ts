import { jest } from '@jest/globals';

process.env.DATABASE_URL ??= 'postgres://user:password@localhost:5433/mydb';

interface FakeQueryResult {
  rows: unknown[];
  rowCount: number;
}
type Handler = (sql: string, params?: unknown[]) => FakeQueryResult | null;
const handlers: Handler[] = [];

function pushHandler(
  matcher: (sql: string) => boolean,
  rows: unknown[],
) {
  handlers.push((sql) =>
    matcher(sql) ? { rows, rowCount: rows.length } : null,
  );
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

const { listActiveAthletes, getActiveRutina } = await import(
  '../../src/services/admin-rutina.service.js'
);

beforeEach(() => {
  handlers.length = 0;
});

describe('listActiveAthletes', () => {
  it('returns only athletes with approved active skeleton', async () => {
    const aid = 'athlete-uuid-1';
    const skid = 'skeleton-uuid-1';

    // First call: COUNT query
    pushHandler(
      (s) => s.includes('COUNT(*)::int AS c'),
      [{ c: 1 }],
    );
    // Second call: data query
    pushHandler(
      (s) => s.includes('SELECT s.athlete_id'),
      [
        {
          athlete_id: aid,
          name: 'Juan',
          skeleton_id: skid,
          reviewed_at: null,
          days_per_week: 4,
        },
      ],
    );

    const result = await listActiveAthletes({});
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      athlete_id: aid,
      name: 'Juan',
      skeleton_id: skid,
      days_per_week: 4,
    });
  });

  it('filters by name search — passes LIKE param and returns only matched row', async () => {
    const aid = 'athlete-uuid-ana';
    const skid = 'skeleton-uuid-ana';

    let capturedCountParams: unknown[] | undefined;
    let capturedDataParams: unknown[] | undefined;

    handlers.push((sql, params) => {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.includes('COUNT(*)::int AS c')) {
        capturedCountParams = params;
        return { rows: [{ c: 1 }], rowCount: 1 };
      }
      return null;
    });
    handlers.push((sql, params) => {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.includes('SELECT s.athlete_id')) {
        capturedDataParams = params;
        return {
          rows: [
            {
              athlete_id: aid,
              name: 'Ana',
              skeleton_id: skid,
              reviewed_at: null,
              days_per_week: 4,
            },
          ],
          rowCount: 1,
        };
      }
      return null;
    });

    const result = await listActiveAthletes({ q: 'ana' });

    // Should have passed the LIKE param
    expect(capturedCountParams).toContain('%ana%');
    expect(capturedDataParams).toContain('%ana%');

    expect(result.total).toBe(1);
    expect(result.items[0].name).toBe('Ana');
  });

  it('returns empty when no approved skeletons exist', async () => {
    pushHandler(
      (s) => s.includes('COUNT(*)::int AS c'),
      [{ c: 0 }],
    );
    pushHandler(
      (s) => s.includes('SELECT s.athlete_id'),
      [],
    );

    const result = await listActiveAthletes({});
    expect(result.total).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it('applies default limit=50 and offset=0', async () => {
    let capturedParams: unknown[] | undefined;

    handlers.push((sql, _params) => {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.includes('COUNT(*)::int AS c')) {
        return { rows: [{ c: 0 }], rowCount: 1 };
      }
      return null;
    });
    handlers.push((sql, params) => {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.includes('SELECT s.athlete_id')) {
        capturedParams = params;
        return { rows: [], rowCount: 0 };
      }
      return null;
    });

    await listActiveAthletes({});

    // No q → params are just [limit, offset]
    expect(capturedParams).toEqual([50, 0]);
  });
});

describe('getActiveRutina', () => {
  it('returns null when athlete has no program_state row', async () => {
    pushHandler(
      (s) => s.includes('athlete_program_state'),
      [],
    );

    const result = await getActiveRutina('athlete-no-state');
    expect(result).toBeNull();
  });

  it('returns null when active_skeleton_id is null', async () => {
    pushHandler(
      (s) => s.includes('athlete_program_state'),
      [{ active_skeleton_id: null }],
    );

    const result = await getActiveRutina('athlete-null-skeleton');
    expect(result).toBeNull();
  });

  it('returns null when skeleton is not approved', async () => {
    pushHandler(
      (s) => s.includes('athlete_program_state'),
      [{ active_skeleton_id: 'skeleton-uuid-superseded' }],
    );
    // Skeleton query returns no rows because status != 'approved'
    pushHandler(
      (s) => s.includes('athlete_skeletons'),
      [],
    );

    const result = await getActiveRutina('athlete-superseded-skeleton');
    expect(result).toBeNull();
  });

  it('returns RutinaDetail with slots, days, profile, has_active_session', async () => {
    const athleteId = 'athlete-uuid-full';
    const skId = 'skeleton-uuid-full';

    const fakeSkeleton = {
      id: skId,
      athlete_id: athleteId,
      status: 'approved',
      generated_by: 'ai',
      generation_prompt: {},
      generation_rationale: null,
      rejection_feedback: null,
      created_at: '2026-01-01T00:00:00Z',
      reviewed_at: '2026-01-02T00:00:00Z',
      reviewed_by: 'admin-uuid',
    };

    const fakeSlots = [
      {
        id: 'slot-1',
        skeleton_id: skId,
        day_of_week: 1,
        slot_index: 0,
        exercise_id: 42,
        role: 'principal',
        notes: null,
        exercise_name: 'Sentadilla',
        muscle_group: 'cuadriceps',
        equipment: 'barra',
      },
    ];

    const fakeDays = [
      { day_of_week: 1, focus: 'Piernas' },
      { day_of_week: 3, focus: 'Espalda' },
    ];

    const fakeProfile = {
      user_id: athleteId,
      name: 'Juan',
      days_per_week: 3,
    };

    // 1. program_state query
    pushHandler(
      (s) => s.includes('athlete_program_state'),
      [{ active_skeleton_id: skId }],
    );
    // 2. skeleton query
    pushHandler(
      (s) => s.includes('athlete_skeletons'),
      [fakeSkeleton],
    );
    // 3. slots query
    pushHandler(
      (s) => s.includes('skeleton_slots'),
      fakeSlots,
    );
    // 4. days query
    pushHandler(
      (s) => s.includes('skeleton_days'),
      fakeDays,
    );
    // 5. profile query
    pushHandler(
      (s) => s.includes('athlete_profiles'),
      [fakeProfile],
    );
    // 6. session_logs EXISTS query
    pushHandler(
      (s) => s.includes('session_logs'),
      [{ exists: true }],
    );

    const result = await getActiveRutina(athleteId);

    expect(result).not.toBeNull();
    expect(result!.skeleton).toMatchObject({ id: skId, status: 'approved' });
    expect(result!.slots).toHaveLength(1);
    expect(result!.slots[0]).toMatchObject({
      exercise_id: 42,
      exercise_name: 'Sentadilla',
    });
    expect(result!.days).toHaveLength(2);
    expect(result!.days[0]).toEqual({ day_of_week: 1, focus: 'Piernas' });
    expect(result!.profile).toMatchObject({
      user_id: athleteId,
      name: 'Juan',
      days_per_week: 3,
    });
    expect(result!.has_active_session).toBe(true);
  });

  it('returns null when athlete profile is missing', async () => {
    const athleteId = 'athlete-uuid-no-profile';
    const skId = 'skeleton-uuid-no-profile';

    // 1. state query — returns valid active_skeleton_id
    pushHandler(
      (s) => s.includes('athlete_program_state'),
      [{ active_skeleton_id: skId }],
    );
    // 2. skeleton query — returns an approved skeleton row
    pushHandler(
      (s) => s.includes('athlete_skeletons'),
      [
        {
          id: skId,
          athlete_id: athleteId,
          status: 'approved',
          generated_by: 'ai',
          generation_prompt: {},
          generation_rationale: null,
          rejection_feedback: null,
          created_at: '2026-01-01T00:00:00Z',
          reviewed_at: '2026-01-02T00:00:00Z',
          reviewed_by: 'admin-uuid',
        },
      ],
    );
    // 3. profile query — returns [] (missing profile)
    pushHandler(
      (s) => s.includes('athlete_profiles'),
      [],
    );
    // 4. slots query — returns []
    pushHandler(
      (s) => s.includes('skeleton_slots'),
      [],
    );
    // 5. days query — returns []
    pushHandler(
      (s) => s.includes('skeleton_days'),
      [],
    );

    const result = await getActiveRutina(athleteId);
    expect(result).toBeNull();
  });
});
