import { jest, describe, it, expect, beforeEach } from '@jest/globals';

interface FakeQueryResult { rows: unknown[]; rowCount: number }
type Handler = (sql: string, params?: unknown[]) => FakeQueryResult | null;
const handlers: Handler[] = [];

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

const { resolveUnit, listUserUnits, setUserUnit, DEFAULT_UNIT_BY_EQUIPMENT } =
  await import('../../src/services/equipment-units.service.js');

beforeEach(() => { handlers.length = 0; });

describe('resolveUnit', () => {
  it('returns user preference when set', async () => {
    handlers.push((sql) =>
      sql.includes('FROM athlete_equipment_units')
        ? { rows: [{ unit: 'kg' }], rowCount: 1 }
        : null,
    );
    expect(await resolveUnit('a1', 'polea')).toBe('kg');
  });

  it('returns ladrillos default for polea when no pref', async () => {
    expect(await resolveUnit('a1', 'polea')).toBe('ladrillos');
  });

  it('returns ladrillos default for maquina when no pref', async () => {
    expect(await resolveUnit('a1', 'maquina')).toBe('ladrillos');
  });

  it('returns kg default for barra when no pref', async () => {
    expect(await resolveUnit('a1', 'barra')).toBe('kg');
  });

  it('returns kg default for unknown equipment', async () => {
    expect(await resolveUnit('a1', 'unknown_thing')).toBe('kg');
  });
});

describe('DEFAULT_UNIT_BY_EQUIPMENT', () => {
  it('has expected polea + maquina defaults', () => {
    expect(DEFAULT_UNIT_BY_EQUIPMENT.polea).toBe('ladrillos');
    expect(DEFAULT_UNIT_BY_EQUIPMENT.maquina).toBe('ladrillos');
    expect(DEFAULT_UNIT_BY_EQUIPMENT.barra).toBe('kg');
  });
});

describe('setUserUnit', () => {
  it('rejects invalid equipment', async () => {
    await expect(setUserUnit('a1', 'invalid', 'kg')).rejects.toThrow('invalid_equipment');
  });
});
