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

const { listActiveAthletes } = await import(
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
