import { jest } from '@jest/globals';

process.env.OWNER_COACH_EMAIL ??= 'owner-test@example.local';
process.env.DATABASE_URL ??= 'postgres://postgres@localhost:5432/trfit_test';
process.env.JWT_SECRET ??= 'jwt-test-secret-12345';
process.env.OPENAI_API_KEY ??= 'sk-test-12345';
process.env.RESEND_API_KEY ??= 'rk-test-12345';

type Row = Record<string, unknown>;
const handlers: Array<
  (sql: string, p?: unknown[]) => { rows: Row[]; rowCount: number } | null
> = [];
const fakePool = {
  async query(sql: string, params?: unknown[]) {
    const s = sql.replace(/\s+/g, ' ').trim();
    for (const h of handlers) {
      const r = h(s, params);
      if (r) return r;
    }
    return { rows: [], rowCount: 0 };
  },
};
jest.unstable_mockModule('../../src/db/connect.js', () => ({
  default: fakePool,
}));
jest.unstable_mockModule(
  '../../src/services/equipment-units.service.js',
  () => ({
    resolveUnit: async () => 'kg',
  })
);
jest.unstable_mockModule(
  '../../src/services/weekly-overrides.service.js',
  () => ({
    applyOverridesToSlots: async (
      _a: string,
      _w: number,
      _d: number,
      slots: unknown[]
    ) => slots,
  })
);

const { buildTodaySession } =
  await import('../../src/services/engine.service.js');

const WEEK10 = {
  week_number: 10,
  block_label: 'TESTEO RM',
  is_rm_test: true,
  is_deload: false,
  is_amrap: false,
  principal_series: 1,
  principal_reps: '1',
  principal_descanso: '5 min',
  principal_pct_rm: null,
  principal_rm_source: null,
  principal_use_casilleros: false,
  accesorio_series: 3,
  accesorio_reps: '10 a 12',
  accesorio_descanso: '60 a 90 seg',
  notes: null,
};

const EX = {
  id: 7,
  name: 'Hip thrust',
  muscle_group: 'gluteos',
  equipment: 'barra',
  movement_pattern: 'hinge',
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

function baseHandlers(opts: {
  currentWeek?: number;
  alreadyTested?: boolean;
  aewKg?: number | null;
}) {
  handlers.length = 0;
  const week = opts.currentWeek ?? 10;
  handlers.push((s) =>
    s.startsWith('SELECT current_week, active_skeleton_id')
      ? {
          rows: [{ current_week: week, active_skeleton_id: 'sk-1' }],
          rowCount: 1,
        }
      : null
  );
  handlers.push((s) =>
    s.startsWith('SELECT * FROM periodization_config')
      ? { rows: [{ ...WEEK10, week_number: week }], rowCount: 1 }
      : null
  );
  handlers.push((s) =>
    s.startsWith('SELECT * FROM skeleton_slots')
      ? {
          rows: [
            {
              id: 's1',
              skeleton_id: 'sk-1',
              day_of_week: 3,
              slot_index: 1,
              exercise_id: 7,
              role: 'principal',
              notes: null,
            },
          ],
          rowCount: 1,
        }
      : null
  );
  handlers.push((s) =>
    s.startsWith('SELECT * FROM exercises') ? { rows: [EX], rowCount: 1 } : null
  );
  handlers.push((s) =>
    s.includes('FROM athlete_exercise_weights')
      ? {
          rows:
            opts.aewKg == null
              ? []
              : [
                  {
                    exercise_id: 7,
                    scheme: 'normal',
                    current_value: opts.aewKg,
                    unit: 'kg',
                    current_weight_kg: opts.aewKg,
                    current_reps_text: null,
                  },
                ],
          rowCount: opts.aewKg == null ? 0 : 1,
        }
      : null
  );
  handlers.push((s) =>
    s.includes('FROM rm_tests')
      ? {
          rows: opts.alreadyTested ? [{ exercise_id: 7, value_kg: '120' }] : [],
          rowCount: opts.alreadyTested ? 1 : 0,
        }
      : null
  );
}

describe('buildTodaySession — RM already tested this week', () => {
  it('does not re-ask RM; prescribes 3×8 with last logged weight', async () => {
    baseHandlers({ alreadyTested: true, aewKg: 80 });
    const items = await buildTodaySession('athlete-1', 3);
    const principal = items.find((i) => i.role === 'principal')!;
    expect(principal.flag).toBe('rm_already_done');
    expect(principal.series).toBe(3);
    expect(principal.reps).toBe('8');
    expect(principal.descanso).toBe('3 min');
    expect(principal.suggested_value).toBe(80);
  });

  it('still flags rm_test when this exercise has no RM this week', async () => {
    baseHandlers({ alreadyTested: false, aewKg: 80 });
    const items = await buildTodaySession('athlete-1', 3);
    const principal = items.find((i) => i.role === 'principal')!;
    expect(principal.flag).toBe('rm_test');
    expect(principal.series).toBe(1);
    expect(principal.reps).toBe('1');
    expect(principal.suggested_value).toBeNull();
  });

  it('allows a free weight when there is no logged working weight', async () => {
    baseHandlers({ alreadyTested: true, aewKg: null });
    const items = await buildTodaySession('athlete-1', 3);
    const principal = items.find((i) => i.role === 'principal')!;
    expect(principal.flag).toBe('rm_already_done');
    expect(principal.suggested_value).toBeNull();
    expect(principal.reps).toBe('8');
  });

  it('applies the same rule on week 30', async () => {
    baseHandlers({ currentWeek: 30, alreadyTested: true, aewKg: 90 });
    const items = await buildTodaySession('athlete-1', 3);
    const principal = items.find((i) => i.role === 'principal')!;
    expect(principal.flag).toBe('rm_already_done');
    expect(principal.series).toBe(3);
    expect(principal.reps).toBe('8');
    expect(principal.suggested_value).toBe(90);
  });
});
