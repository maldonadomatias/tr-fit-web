import { jest } from '@jest/globals';

process.env.OWNER_COACH_EMAIL ??= 'owner-test@example.local';
process.env.DATABASE_URL ??= 'postgres://postgres:postgres@localhost:5432/trfit_test';
process.env.JWT_SECRET ??= 'jwt-test-secret-12345';
process.env.OPENAI_API_KEY ??= 'sk-test-12345';
process.env.RESEND_API_KEY ??= 'rk-test-12345';

const queries: Array<{ sql: string; params?: unknown[] }> = [];
const fakeClient = {
  async query(sql: string, params?: unknown[]) {
    const s = sql.replace(/\s+/g, ' ').trim();
    queries.push({ sql: s, params });
    if (s.startsWith('SELECT equipment FROM exercises')) return { rows: [{ equipment: 'barra' }], rowCount: 1 };
    if (s.startsWith('INSERT INTO rm_tests')) return { rows: [{ id: 'rm-1' }], rowCount: 1 };
    if (s.startsWith('SELECT active_skeleton_id')) return { rows: [{ active_skeleton_id: null }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  },
  release() {},
};
const fakePool = {
  async connect() { return fakeClient; },
  async query(sql: string) {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('SELECT equipment FROM exercises')) return { rows: [{ equipment: 'barra' }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  },
};
jest.unstable_mockModule('../../src/db/connect.js', () => ({ default: fakePool }));
jest.unstable_mockModule('../../src/services/equipment-units.service.js', () => ({
  resolveUnit: async () => 'kg',
}));

const { recordAmrap } = await import('../../src/services/rm.service.js');

beforeEach(() => { queries.length = 0; });

describe('recordAmrap', () => {
  it('computes Epley and stores it at week 20 with audit fields', async () => {
    // 100kg × 8 reps barra → 126.67 → roundToNearest25 → 127.5
    const out = await recordAmrap({ athleteId: 'a1', exerciseId: 7, weightUsed: 100, reps: 8 });
    expect(out.estimated1RM).toBe(127.5);
    const insert = queries.find((q) => q.sql.startsWith('INSERT INTO rm_tests'));
    expect(insert).toBeDefined();
    expect(insert!.params).toContain(20);     // program_week
    expect(insert!.params).toContain(127.5);  // value_kg
    expect(insert!.params).toContain(100);    // amrap_weight
    expect(insert!.params).toContain(8);      // amrap_reps
  });
});
