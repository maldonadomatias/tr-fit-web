import { jest } from '@jest/globals';

process.env.OWNER_COACH_EMAIL ??= 'owner-test@example.local';
process.env.DATABASE_URL ??= 'postgres://postgres:postgres@localhost:5432/trfit_test';
process.env.JWT_SECRET ??= 'jwt-test-secret-12345';
process.env.OPENAI_API_KEY ??= 'sk-test-12345';
process.env.RESEND_API_KEY ??= 'rk-test-12345';
process.env.MP_ACCESS_TOKEN ??= 'mp-test';
process.env.MP_WEBHOOK_SECRET ??= 'mp-webhook-test';
process.env.MP_PLAN_ID_BASICO ??= 'plan-b';
process.env.MP_PLAN_ID_FULL ??= 'plan-f';
process.env.MP_PLAN_ID_PREMIUM ??= 'plan-p';

type Row = Record<string, unknown>;
const handlers: Array<(sql: string, p?: unknown[]) => { rows: Row[]; rowCount: number } | null> = [];
const fakePool = {
  async query(sql: string, params?: unknown[]) {
    const s = sql.replace(/\s+/g, ' ').trim();
    for (const h of handlers) { const r = h(s, params); if (r) return r; }
    return { rows: [], rowCount: 0 };
  },
};
jest.unstable_mockModule('../../src/db/connect.js', () => ({ default: fakePool }));
jest.unstable_mockModule('../../src/services/equipment-units.service.js', () => ({
  resolveUnit: async () => 'kg',
}));
jest.unstable_mockModule('../../src/services/weekly-overrides.service.js', () => ({
  applyOverridesToSlots: async (_a: string, _w: number, _d: number, slots: unknown[]) => slots,
}));

const { buildTodaySession } = await import('../../src/services/engine.service.js');

const WEEK20 = {
  week_number: 20, block_label: 'TESTEO RM', is_rm_test: false, is_deload: false,
  is_amrap: true, principal_series: 1, principal_reps: 'AMRAP', principal_descanso: '3 a 5 min',
  principal_pct_rm: 0.85, principal_rm_source: 10, principal_use_casilleros: false,
  accesorio_series: 3, accesorio_reps: '10 a 12', accesorio_descanso: '60 a 90 seg', notes: null,
};
const EX = {
  id: 7, name: 'Sentadilla', muscle_group: 'piernas', equipment: 'barra',
  movement_pattern: 'squat', is_principal: true, is_unilateral: false, level_min: 'principiante',
  contraindicated_for: [], default_increment_kg: 2.5, alternatives_ids: [],
  video_url: null, illustration_url: null, modality: 'reps', default_target: null,
};

function baseHandlers(rm10: number | null) {
  handlers.length = 0;
  handlers.push((s) => s.startsWith('SELECT current_week, rm_test_blocking')
    ? { rows: [{ current_week: 20, rm_test_blocking: false, active_skeleton_id: 'sk-1' }], rowCount: 1 } : null);
  handlers.push((s) => s.startsWith('SELECT * FROM periodization_config')
    ? { rows: [WEEK20], rowCount: 1 } : null);
  handlers.push((s) => s.startsWith('SELECT * FROM skeleton_slots')
    ? { rows: [{ id: 's1', skeleton_id: 'sk-1', day_of_week: 1, slot_index: 1, exercise_id: 7, role: 'principal', notes: null }], rowCount: 1 } : null);
  handlers.push((s) => s.startsWith('SELECT * FROM exercises')
    ? { rows: [EX], rowCount: 1 } : null);
  handlers.push((s) => s.includes('FROM athlete_exercise_weights')
    ? { rows: [], rowCount: 0 } : null);
  handlers.push((s) => s.includes('FROM rm_tests')
    ? { rows: rm10 === null ? [] : [{ exercise_id: 7, value_kg: String(rm10) }], rowCount: rm10 === null ? 0 : 1 } : null);
}

describe('buildTodaySession — week 20 AMRAP', () => {
  it('prescribes 85% of RM10 with amrap flag', async () => {
    baseHandlers(100); // RM10=100 → 100 × 0.85 = 85 → nearest 2.5 → 85
    const items = await buildTodaySession('athlete-1', 1);
    const principal = items.find((i) => i.role === 'principal')!;
    expect(principal.flag).toBe('amrap');
    expect(principal.suggested_value).toBe(85);
    expect(principal.reps).toBe('AMRAP');
  });

  it('flags missing_rm when RM10 absent', async () => {
    baseHandlers(null);
    const items = await buildTodaySession('athlete-1', 1);
    const principal = items.find((i) => i.role === 'principal')!;
    expect(principal.flag).toBe('missing_rm');
    expect(principal.suggested_value).toBeNull();
  });
});
