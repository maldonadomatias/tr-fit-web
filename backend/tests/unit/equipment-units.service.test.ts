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

const { resolveUnit, listUserUnits, setUserUnit, setExerciseUnit, DEFAULT_UNIT_BY_EQUIPMENT, EquipmentUnitsError } =
  await import('../../src/services/equipment-units.service.js');

beforeEach(() => { handlers.length = 0; });

describe('resolveUnit', () => {
  it('returns user preference when set', async () => {
    handlers.push((sql, params) =>
      sql.includes('FROM athlete_equipment_units') && params?.[0] === 'a1' && params?.[1] === 'polea'
        ? { rows: [{ unit: 'kg' }], rowCount: 1 }
        : null,
    );
    expect(await resolveUnit('a1', 'polea')).toBe('kg');
  });

  it('returns ladrillos default for polea when no pref', async () => {
    expect(await resolveUnit('a1', 'polea')).toBe('ladrillos');
  });

  it('returns kg default for maquina when no pref', async () => {
    expect(await resolveUnit('a1', 'maquina')).toBe('kg');
  });

  it('still honors a ladrillos preference on maquina', async () => {
    handlers.push((sql, params) =>
      sql.includes('FROM athlete_equipment_units') && params?.[1] === 'maquina'
        ? { rows: [{ unit: 'ladrillos' }], rowCount: 1 }
        : null,
    );
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
    expect(DEFAULT_UNIT_BY_EQUIPMENT.maquina).toBe('kg');
    expect(DEFAULT_UNIT_BY_EQUIPMENT.barra).toBe('kg');
  });
});

describe('setUserUnit', () => {
  it('rejects invalid equipment', async () => {
    await expect(setUserUnit('a1', 'invalid', 'kg')).rejects.toThrow(EquipmentUnitsError);
  });

  it('upserts a valid equipment preference', async () => {
    let received: { sql: string; params: unknown[] } | null = null;
    handlers.push((sql, params) => {
      if (sql.includes('INSERT INTO athlete_equipment_units')) {
        received = { sql, params: params ?? [] };
        return { rows: [], rowCount: 1 };
      }
      return null;
    });
    await expect(setUserUnit('a1', 'polea', 'kg')).resolves.toBeUndefined();
    expect(received).not.toBeNull();
    expect(received!.params).toEqual(['a1', 'polea', 'kg']);
  });
});

describe('per-exercise override', () => {
  it('exercise override wins over equipment preference', async () => {
    handlers.push((sql, params) =>
      sql.includes('FROM athlete_exercise_units') && params?.[1] === 42
        ? { rows: [{ unit: 'kg' }], rowCount: 1 }
        : null,
    );
    handlers.push((sql) =>
      sql.includes('FROM athlete_equipment_units') ? { rows: [{ unit: 'ladrillos' }], rowCount: 1 } : null,
    );
    expect(await resolveUnit('a1', 'polea', 42)).toBe('kg');
    expect(await resolveUnit('a1', 'polea', 7)).toBe('ladrillos');
  });

  it('setExerciseUnit upserts', async () => {
    let params: unknown[] | undefined;
    handlers.push((sql, p) => {
      if (sql.includes('INSERT INTO athlete_exercise_units')) { params = p; return { rows: [], rowCount: 1 }; }
      return null;
    });
    await setExerciseUnit('a1', 42, 'ladrillos');
    expect(params).toEqual(['a1', 42, 'ladrillos']);
  });
});
