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
  async connect() {
    return {
      query: (sql: string, params?: unknown[]) => fakePool.query(sql, params),
      release: () => {},
    };
  },
};

jest.unstable_mockModule('../../src/db/connect.js', () => ({
  default: fakePool,
}));

const { listActiveAthletes, getActiveRutina, createSlot, updateSlot, deleteSlot, reorderSlots, AdminRutinaError } =
  await import('../../src/services/admin-rutina.service.js');

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

describe('createSlot', () => {
  it('inserts slot and seeds athlete_exercise_weights', async () => {
    const athleteId = 'athlete-uuid-cs';
    const skId = 'skeleton-uuid-cs';
    const exerciseId = 99;
    const fakeSlot = {
      id: 'slot-uuid-new',
      skeleton_id: skId,
      day_of_week: 2,
      slot_index: 1,
      exercise_id: exerciseId,
      role: 'principal',
      notes: null,
    };

    let weightInsertInvoked = false;

    // BEGIN
    pushHandler((s) => s === 'BEGIN', []);
    // active-skeleton SELECT
    pushHandler(
      (s) => s.includes('athlete_program_state') && s.includes('athlete_skeletons') && s.includes('skeleton_id'),
      [{ skeleton_id: skId }],
    );
    // exercise availability SELECT
    pushHandler(
      (s) => s.includes('exercises') && s.includes('archived_at IS NULL'),
      [{ id: exerciseId }],
    );
    // INSERT skeleton_slots
    pushHandler(
      (s) => s.includes('INSERT INTO skeleton_slots'),
      [fakeSlot],
    );
    // INSERT athlete_exercise_weights
    handlers.push((sql) => {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.includes('INSERT INTO athlete_exercise_weights')) {
        weightInsertInvoked = true;
        return { rows: [], rowCount: 0 };
      }
      return null;
    });
    // COMMIT
    pushHandler((s) => s === 'COMMIT', []);

    const result = await createSlot(athleteId, {
      day_of_week: 2,
      slot_index: 1,
      exercise_id: exerciseId,
      role: 'principal',
      notes: null,
    });

    expect(result).toMatchObject({
      id: 'slot-uuid-new',
      skeleton_id: skId,
      exercise_id: exerciseId,
      role: 'principal',
    });
    expect(weightInsertInvoked).toBe(true);
  });

  it('throws rutina_not_active when athlete has no approved active skeleton', async () => {
    const athleteId = 'athlete-no-skeleton';
    let rollbackCalled = false;

    // BEGIN
    pushHandler((s) => s === 'BEGIN', []);
    // active-skeleton SELECT returns empty
    pushHandler(
      (s) => s.includes('athlete_program_state') && s.includes('athlete_skeletons') && s.includes('skeleton_id'),
      [],
    );
    // ROLLBACK
    handlers.push((sql) => {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized === 'ROLLBACK') {
        rollbackCalled = true;
        return { rows: [], rowCount: 0 };
      }
      return null;
    });

    const promise = createSlot(athleteId, {
      day_of_week: 1,
      slot_index: 1,
      exercise_id: 1,
      role: 'principal',
      notes: null,
    });
    await expect(promise).rejects.toBeInstanceOf(AdminRutinaError);
    await expect(promise).rejects.toMatchObject({ code: 'rutina_not_active' });
    expect(rollbackCalled).toBe(true);
  });

  it('throws invalid_exercise when exercise is archived or missing', async () => {
    const athleteId = 'athlete-bad-exercise';
    const skId = 'skeleton-uuid-bad-ex';
    let rollbackCalled = false;

    // BEGIN
    pushHandler((s) => s === 'BEGIN', []);
    // active-skeleton SELECT returns a skeleton
    pushHandler(
      (s) => s.includes('athlete_program_state') && s.includes('athlete_skeletons') && s.includes('skeleton_id'),
      [{ skeleton_id: skId }],
    );
    // exercise availability SELECT returns empty (archived/missing)
    pushHandler(
      (s) => s.includes('exercises') && s.includes('archived_at IS NULL'),
      [],
    );
    // ROLLBACK
    handlers.push((sql) => {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized === 'ROLLBACK') {
        rollbackCalled = true;
        return { rows: [], rowCount: 0 };
      }
      return null;
    });

    await expect(
      createSlot(athleteId, {
        day_of_week: 3,
        slot_index: 2,
        exercise_id: 999,
        role: 'accesorio',
      }),
    ).rejects.toMatchObject({ code: 'invalid_exercise' });
    expect(rollbackCalled).toBe(true);
  });
});

describe('updateSlot', () => {
  it('patches notes only', async () => {
    const slotId = 'slot-uuid-patch-notes';
    const athleteId = 'athlete-uuid-patch';
    const skeletonId = 'skeleton-uuid-patch';
    const updatedSlot = {
      id: slotId,
      skeleton_id: skeletonId,
      day_of_week: 1,
      slot_index: 1,
      exercise_id: 10,
      role: 'principal',
      notes: 'nueva nota',
    };

    // BEGIN
    pushHandler((s) => s === 'BEGIN', []);
    // slot-in-active-skeleton SELECT
    pushHandler(
      (s) => s.includes('skeleton_slots sl') && s.includes('athlete_skeletons s') && s.includes('athlete_program_state ps'),
      [{ athlete_id: athleteId, skeleton_id: skeletonId }],
    );
    // UPDATE skeleton_slots
    pushHandler(
      (s) => s.includes('UPDATE skeleton_slots'),
      [updatedSlot],
    );
    // COMMIT
    pushHandler((s) => s === 'COMMIT', []);

    const result = await updateSlot(slotId, { notes: 'nueva nota' });
    expect(result.notes).toBe('nueva nota');
  });

  it('swaps exercise and seeds weight row for new exercise', async () => {
    const slotId = 'slot-uuid-swap-ex';
    const athleteId = 'athlete-uuid-swap';
    const skeletonId = 'skeleton-uuid-swap';
    const newExerciseId = 77;
    const updatedSlot = {
      id: slotId,
      skeleton_id: skeletonId,
      day_of_week: 2,
      slot_index: 2,
      exercise_id: newExerciseId,
      role: 'accesorio',
      notes: null,
    };
    let weightInsertInvoked = false;

    // BEGIN
    pushHandler((s) => s === 'BEGIN', []);
    // slot-in-active-skeleton SELECT
    pushHandler(
      (s) => s.includes('skeleton_slots sl') && s.includes('athlete_skeletons s') && s.includes('athlete_program_state ps'),
      [{ athlete_id: athleteId, skeleton_id: skeletonId }],
    );
    // exercise availability SELECT
    pushHandler(
      (s) => s.includes('exercises') && s.includes('archived_at IS NULL'),
      [{ id: newExerciseId }],
    );
    // UPDATE skeleton_slots
    pushHandler(
      (s) => s.includes('UPDATE skeleton_slots'),
      [updatedSlot],
    );
    // INSERT athlete_exercise_weights
    handlers.push((sql) => {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.includes('INSERT INTO athlete_exercise_weights')) {
        weightInsertInvoked = true;
        return { rows: [], rowCount: 0 };
      }
      return null;
    });
    // COMMIT
    pushHandler((s) => s === 'COMMIT', []);

    await updateSlot(slotId, { exercise_id: newExerciseId });
    expect(weightInsertInvoked).toBe(true);
  });

  it('throws rutina_not_active when slot is not in active approved skeleton', async () => {
    const slotId = 'slot-uuid-inactive';
    let rollbackCalled = false;

    // BEGIN
    pushHandler((s) => s === 'BEGIN', []);
    // slot-in-active-skeleton SELECT returns empty
    pushHandler(
      (s) => s.includes('skeleton_slots sl') && s.includes('athlete_skeletons s') && s.includes('athlete_program_state ps'),
      [],
    );
    // ROLLBACK
    handlers.push((sql) => {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized === 'ROLLBACK') {
        rollbackCalled = true;
        return { rows: [], rowCount: 0 };
      }
      return null;
    });

    const promise = updateSlot(slotId, { notes: 'test' });
    await expect(promise).rejects.toBeInstanceOf(AdminRutinaError);
    await expect(promise).rejects.toMatchObject({ code: 'rutina_not_active' });
    expect(rollbackCalled).toBe(true);
  });
});

describe('deleteSlot', () => {
  it('removes slot when in active skeleton', async () => {
    const slotId = 'slot-uuid-delete';
    const athleteId = 'athlete-uuid-delete';
    const skeletonId = 'skeleton-uuid-delete';
    let deleteInvoked = false;

    // BEGIN
    pushHandler((s) => s === 'BEGIN', []);
    // slot-in-active-skeleton SELECT returns valid
    pushHandler(
      (s) => s.includes('skeleton_slots sl') && s.includes('athlete_skeletons s') && s.includes('athlete_program_state ps'),
      [{ athlete_id: athleteId, skeleton_id: skeletonId }],
    );
    // DELETE skeleton_slots
    handlers.push((sql) => {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.includes('DELETE FROM skeleton_slots')) {
        deleteInvoked = true;
        return { rows: [], rowCount: 1 };
      }
      return null;
    });
    // COMMIT
    pushHandler((s) => s === 'COMMIT', []);

    await deleteSlot(slotId);
    expect(deleteInvoked).toBe(true);
  });
});

describe('reorderSlots', () => {
  it('reorders slots across days', async () => {
    const athleteId = 'athlete-uuid-reorder';
    const skId = 'skeleton-uuid-reorder';
    const inputSlots = [
      { slot_id: 'slot-uuid-r1', day_of_week: 2, slot_index: 1 },
      { slot_id: 'slot-uuid-r2', day_of_week: 3, slot_index: 1 },
    ];
    let perSlotInsertCount = 0;

    // BEGIN
    pushHandler((s) => s === 'BEGIN', []);
    // active-skeleton SELECT
    pushHandler(
      (s) => s.includes('athlete_program_state') && s.includes('athlete_skeletons') && s.includes('skeleton_id'),
      [{ skeleton_id: skId }],
    );
    // total-count SELECT — returns same count as input slots (complete set)
    pushHandler(
      (s) => s.includes('COUNT(*)::int AS c') && s.includes('skeleton_slots'),
      [{ c: inputSlots.length }],
    );
    // slot-membership check SELECT — returns same number of rows as input slots
    pushHandler(
      (s) => s.includes('skeleton_slots') && s.includes('ANY($1::uuid[])') && s.includes('skeleton_id = $2'),
      [{ id: 'slot-uuid-r1' }, { id: 'slot-uuid-r2' }],
    );
    // DELETE targeted slots RETURNING their data for subsequent re-insertion
    pushHandler(
      (s) => s.includes('DELETE FROM skeleton_slots') && s.includes('RETURNING id, exercise_id, role, notes'),
      [
        { id: 'slot-uuid-r1', exercise_id: 10, role: 'principal', notes: null },
        { id: 'slot-uuid-r2', exercise_id: 20, role: 'accesorio', notes: null },
      ],
    );
    // per-slot INSERTs preserving UUIDs with new positions
    handlers.push((sql) => {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.includes('INSERT INTO skeleton_slots') && normalized.includes('day_of_week')) {
        perSlotInsertCount++;
        return { rows: [], rowCount: 1 };
      }
      return null;
    });
    // COMMIT
    pushHandler((s) => s === 'COMMIT', []);

    await reorderSlots(athleteId, { slots: inputSlots });
    expect(perSlotInsertCount).toBe(inputSlots.length);
  });

  it('throws not_found when slot does not belong to active skeleton', async () => {
    const athleteId = 'athlete-uuid-reorder-bad';
    const skId = 'skeleton-uuid-reorder-bad';
    const inputSlots = [
      { slot_id: 'slot-uuid-bad1', day_of_week: 1, slot_index: 1 },
      { slot_id: 'slot-uuid-bad2', day_of_week: 2, slot_index: 1 },
    ];
    let rollbackCalled = false;

    // BEGIN
    pushHandler((s) => s === 'BEGIN', []);
    // active-skeleton SELECT
    pushHandler(
      (s) => s.includes('athlete_program_state') && s.includes('athlete_skeletons') && s.includes('skeleton_id'),
      [{ skeleton_id: skId }],
    );
    // total-count SELECT — returns same count as input slots (passes the complete-set check)
    pushHandler(
      (s) => s.includes('COUNT(*)::int AS c') && s.includes('skeleton_slots'),
      [{ c: inputSlots.length }],
    );
    // membership check returns FEWER rows than input slots (only 1 of 2)
    pushHandler(
      (s) => s.includes('skeleton_slots') && s.includes('ANY($1::uuid[])') && s.includes('skeleton_id = $2'),
      [{ id: 'slot-uuid-bad1' }],
    );
    // ROLLBACK
    handlers.push((sql) => {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized === 'ROLLBACK') {
        rollbackCalled = true;
        return { rows: [], rowCount: 0 };
      }
      return null;
    });

    const promise = reorderSlots(athleteId, { slots: inputSlots });
    await expect(promise).rejects.toBeInstanceOf(AdminRutinaError);
    await expect(promise).rejects.toMatchObject({ code: 'not_found' });
    expect(rollbackCalled).toBe(true);
  });

  it('throws not_found when payload is a subset of the skeleton', async () => {
    let rollbackCalled = false;
    // BEGIN
    pushHandler((s) => /^begin$/i.test(s.trim()), []);
    // active-skeleton SELECT (returns skId)
    pushHandler(
      (s) => s.toLowerCase().includes('from athlete_program_state'),
      [{ skeleton_id: 'sk-1' }],
    );
    // total-count SELECT — skeleton has 3 slots but input only has 2
    pushHandler(
      (s) => s.toLowerCase().includes('count(*)') && s.toLowerCase().includes('skeleton_slots'),
      [{ c: 3 }],
    );
    // ROLLBACK
    handlers.push((sql) => {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (/^rollback$/i.test(normalized)) {
        rollbackCalled = true;
        return { rows: [], rowCount: 0 };
      }
      return null;
    });

    const promise = reorderSlots('any-athlete', {
      slots: [
        { slot_id: '00000000-0000-0000-0000-000000000001', day_of_week: 1, slot_index: 1 },
        { slot_id: '00000000-0000-0000-0000-000000000002', day_of_week: 1, slot_index: 2 },
      ],
    });
    await expect(promise).rejects.toBeInstanceOf(AdminRutinaError);
    await expect(promise).rejects.toMatchObject({ code: 'not_found' });
    expect(rollbackCalled).toBe(true);
  });
});
