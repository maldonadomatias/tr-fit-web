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

const { computeNextPendingDay, buildTodaySession } = await import('../../src/services/engine.service.js');

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

// ---------------------------------------------------------------------------
// Shared fixtures for buildTodaySession tests
// ---------------------------------------------------------------------------
const exA = {
  id: 101,
  name: 'ExA',
  muscle_group: 'chest',
  equipment: 'barra',
  movement_pattern: 'push_h',
  is_principal: true,
  is_unilateral: false,
  level_min: 'principiante',
  contraindicated_for: [],
  default_increment_kg: 2.5,
  alternatives_ids: [],
  video_url: null,
  illustration_url: null,
  modality: 'reps',
  default_target: null,
};

const exB = {
  id: 102,
  name: 'ExB',
  muscle_group: 'chest',
  equipment: 'barra',
  movement_pattern: 'push_h',
  is_principal: true,
  is_unilateral: false,
  level_min: 'principiante',
  contraindicated_for: [],
  default_increment_kg: 2.5,
  alternatives_ids: [],
  video_url: null,
  illustration_url: null,
  modality: 'reps',
  default_target: null,
};

const baseSlot = {
  id: 'slot-1',
  skeleton_id: 'sk-excl',
  day_of_week: 1,
  slot_index: 1,
  exercise_id: exA.id,
  role: 'principal',
  notes: null,
};

const basePeriodizationConfig = {
  week_number: 1,
  block_label: 'base',
  is_rm_test: false,
  is_deload: false,
  is_amrap: false,
  principal_series: 3,
  principal_reps: '8',
  principal_descanso: '2 min',
  principal_pct_rm: null,
  principal_rm_source: null,
  principal_use_casilleros: true,
  accesorio_series: 3,
  accesorio_reps: '12',
  accesorio_descanso: '1 min',
  notes: null,
};

/**
 * Seeds all queries that buildTodaySession fires for a 1-slot day.
 * exclusionRows: rows returned from athlete_excluded_exercises.
 * exerciseRows:  rows returned from exercises WHERE id = ANY(…).
 */
function seedBuildSession(
  exclusionRows: { exercise_id: number; replacement_exercise_id: number | null }[],
  exerciseRows: unknown[],
) {
  // 1. program_state — week 1, active skeleton sk-excl
  pushHandler(
    (s) => s.startsWith('SELECT current_week, rm_test_blocking, active_skeleton_id FROM athlete_program_state'),
    [{ current_week: 1, rm_test_blocking: false, active_skeleton_id: 'sk-excl' }],
  );
  // 2. periodization_config
  pushHandler(
    (s) => s.startsWith('SELECT * FROM periodization_config'),
    [basePeriodizationConfig],
  );
  // 3. skeleton_slots — one slot with exA on day 1
  pushHandler(
    (s) => s.startsWith('SELECT * FROM skeleton_slots'),
    [baseSlot],
  );
  // 4. athlete_excluded_exercises (getExclusionMap)
  pushHandler(
    (s) => s.startsWith('SELECT exercise_id, replacement_exercise_id FROM athlete_excluded_exercises'),
    exclusionRows,
  );
  // 5. weekly_overrides (applyOverridesToSlots)
  pushHandler(
    (s) => s.startsWith('SELECT * FROM weekly_overrides'),
    [],
  );
  // 6. exercises lookup
  pushHandler(
    (s) => s.startsWith('SELECT * FROM exercises WHERE id = ANY'),
    exerciseRows,
  );
  // 7. athlete_exercise_weights
  pushHandler(
    (s) => s.startsWith('SELECT exercise_id,'),
    [],
  );
  // 8. athlete_equipment_units (resolveUnit) — returns empty so default ('kg') is used
  pushHandler(
    (s) => s.startsWith('SELECT unit FROM athlete_equipment_units'),
    [],
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

// ---------------------------------------------------------------------------
// Helpers for missing-RM principal tests
// ---------------------------------------------------------------------------
const exRM = {
  id: 201,
  name: 'ExRM',
  muscle_group: 'legs',
  equipment: 'barra',
  movement_pattern: 'squat',
  is_principal: true,
  is_unilateral: false,
  level_min: 'principiante',
  contraindicated_for: [],
  default_increment_kg: 2.5,
  alternatives_ids: [],
  video_url: null,
  illustration_url: null,
  modality: 'reps',
  default_target: null,
};

const rmSlot = {
  id: 'slot-rm-1',
  skeleton_id: 'sk-rm',
  day_of_week: 1,
  slot_index: 1,
  exercise_id: exRM.id,
  role: 'principal',
  notes: null,
};

const pctRmConfig = {
  week_number: 2,
  block_label: 'strength',
  is_rm_test: false,
  is_deload: false,
  is_amrap: false,
  principal_series: 4,
  principal_reps: '5',
  principal_descanso: '3 min',
  principal_pct_rm: 0.8,
  principal_rm_source: 10,
  principal_use_casilleros: false,
  accesorio_series: 3,
  accesorio_reps: '12',
  accesorio_descanso: '1 min',
  notes: null,
};

/**
 * Seeds all queries that buildTodaySession fires for a 1-slot pct_rm day
 * (no RM test for the exercise).
 * @param aewRow - row to return from athlete_exercise_weights (or null for none)
 */
function seedMissingRmSession(aewRow: object | null) {
  // 1. program_state
  pushHandler(
    (s) => s.startsWith('SELECT current_week, rm_test_blocking, active_skeleton_id FROM athlete_program_state'),
    [{ current_week: 2, rm_test_blocking: false, active_skeleton_id: 'sk-rm' }],
  );
  // 2. periodization_config — pct_rm branch, no amrap, no rm_test
  pushHandler(
    (s) => s.startsWith('SELECT * FROM periodization_config'),
    [pctRmConfig],
  );
  // 3. skeleton_slots
  pushHandler(
    (s) => s.startsWith('SELECT * FROM skeleton_slots'),
    [rmSlot],
  );
  // 4. athlete_excluded_exercises (getExclusionMap)
  pushHandler(
    (s) => s.startsWith('SELECT exercise_id, replacement_exercise_id FROM athlete_excluded_exercises'),
    [],
  );
  // 5. weekly_overrides (applyOverridesToSlots)
  pushHandler(
    (s) => s.startsWith('SELECT * FROM weekly_overrides'),
    [],
  );
  // 6. exercises lookup
  pushHandler(
    (s) => s.startsWith('SELECT * FROM exercises WHERE id = ANY'),
    [exRM],
  );
  // 7. athlete_exercise_weights
  pushHandler(
    (s) => s.startsWith('SELECT exercise_id,'),
    aewRow ? [aewRow] : [],
  );
  // 8. rm_tests — no RM test row for this exercise
  pushHandler(
    (s) => s.startsWith('SELECT exercise_id, value_kg'),
    [],
  );
  // 9. athlete_equipment_units (resolveUnit)
  pushHandler(
    (s) => s.startsWith('SELECT unit FROM athlete_equipment_units'),
    [],
  );
}

describe('buildTodaySession — missing-RM principal fallback', () => {
  it('Case A: uses last logged weight as suggested_value and keeps missing_rm flag', async () => {
    seedMissingRmSession({
      exercise_id: exRM.id,
      current_value: 55,
      unit: 'kg',
      current_weight_kg: 55,
      current_reps_text: null,
    });

    const items = await buildTodaySession('athlete-rm', 1);
    expect(items).toHaveLength(1);
    const item = items[0];
    expect(item.suggested_value).toBe(55);
    expect(item.flag).toBe('missing_rm');
  });

  it('Case B: no logged weight → suggested_value is null, flag is missing_rm', async () => {
    seedMissingRmSession(null);

    const items = await buildTodaySession('athlete-rm', 1);
    expect(items).toHaveLength(1);
    const item = items[0];
    expect(item.suggested_value).toBeNull();
    expect(item.flag).toBe('missing_rm');
  });
});

describe('buildTodaySession — exclusions', () => {
  it('excluded exercise with replacement → slot uses replacement exercise', async () => {
    // exA excluded, replaced by exB
    seedBuildSession(
      [{ exercise_id: exA.id, replacement_exercise_id: exB.id }],
      [exB],
    );

    const items = await buildTodaySession('athlete-excl', 1);
    const ids = items.map((i) => i.exercise.id);
    expect(ids).toContain(exB.id);
    expect(ids).not.toContain(exA.id);
  });

  it('excluded exercise with null replacement → slot is dropped', async () => {
    // exA excluded, no replacement (null)
    seedBuildSession(
      [{ exercise_id: exA.id, replacement_exercise_id: null }],
      [],
    );

    const items = await buildTodaySession('athlete-excl', 1);
    const ids = items.map((i) => i.exercise.id);
    expect(ids).not.toContain(exA.id);
    expect(items).toHaveLength(0);
  });

  it('no exclusions → slot uses original exercise', async () => {
    // no exclusions
    seedBuildSession([], [exA]);

    const items = await buildTodaySession('athlete-excl', 1);
    const ids = items.map((i) => i.exercise.id);
    expect(ids).toContain(exA.id);
    expect(ids).not.toContain(exB.id);
  });
});

describe('buildTodaySession — per-accessory prescription (migration 038)', () => {
  // Seeds a single accessory slot with the given prescription + optional logged
  // reps, mirroring seedBuildSession's query order.
  function seedAccessory(
    prescription: { series: number | null; reps: string | null; descanso: string | null },
    weightRows: unknown[] = [],
  ) {
    pushHandler(
      (s) => s.startsWith('SELECT current_week, rm_test_blocking, active_skeleton_id FROM athlete_program_state'),
      [{ current_week: 1, rm_test_blocking: false, active_skeleton_id: 'sk-acc' }],
    );
    pushHandler((s) => s.startsWith('SELECT * FROM periodization_config'), [basePeriodizationConfig]);
    pushHandler((s) => s.startsWith('SELECT * FROM skeleton_slots'), [
      { ...baseSlot, id: 'slot-acc', role: 'accesorio', exercise_id: exA.id, ...prescription },
    ]);
    pushHandler((s) => s.startsWith('SELECT exercise_id, replacement_exercise_id FROM athlete_excluded_exercises'), []);
    pushHandler((s) => s.startsWith('SELECT * FROM weekly_overrides'), []);
    pushHandler((s) => s.startsWith('SELECT * FROM exercises WHERE id = ANY'), [exA]);
    pushHandler((s) => s.startsWith('SELECT exercise_id,'), weightRows);
    pushHandler((s) => s.startsWith('SELECT unit FROM athlete_equipment_units'), []);
  }

  it('uses the slot prescription over periodization defaults', async () => {
    seedAccessory({ series: 2, reps: '10x10x10', descanso: '2 min' });
    const [item] = await buildTodaySession('athlete-acc', 1);
    expect(item!.series).toBe(2);
    expect(item!.reps).toBe('10x10x10');
    expect(item!.descanso).toBe('2 min');
  });

  it('falls back to periodization defaults when prescription is null', async () => {
    seedAccessory({ series: null, reps: null, descanso: null });
    const [item] = await buildTodaySession('athlete-acc', 1);
    expect(item!.series).toBe(basePeriodizationConfig.accesorio_series);
    expect(item!.reps).toBe(basePeriodizationConfig.accesorio_reps);
    expect(item!.descanso).toBe(basePeriodizationConfig.accesorio_descanso);
  });

  it('progressed current_reps_text still wins over the slot reps', async () => {
    seedAccessory(
      { series: 2, reps: '10x10x10', descanso: '2 min' },
      [{ exercise_id: exA.id, current_value: null, unit: null, current_weight_kg: null, current_reps_text: '12x12x12' }],
    );
    const [item] = await buildTodaySession('athlete-acc', 1);
    expect(item!.reps).toBe('12x12x12'); // progression overrides the seed
    expect(item!.series).toBe(2); // series still from the slot
  });
});
