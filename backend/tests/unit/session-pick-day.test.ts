import { jest } from '@jest/globals';

const query = jest.fn<(sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>>();
const buildTodaySession = jest.fn(async () => []);
jest.unstable_mockModule('../../src/db/connect.js', () => ({ default: { query } }));
jest.unstable_mockModule('../../src/services/engine.service.js', () => ({
  buildTodaySession,
  listPendingDays: async () => [2, 3],
  TodayBlockedError: class extends Error {},
}));
jest.unstable_mockModule('../../src/services/day-focus.service.js', () => ({
  dominantGroupByDay: async () => ({ 1: 'Pecho', 2: 'Piernas', 3: 'Pecho' }),
}));
const { startSession } = await import('../../src/services/session.service.js');

let trainedToday = false;
let active = false;
beforeEach(() => {
  trainedToday = false;
  active = false;
  query.mockReset().mockImplementation(async (sql) => {
    if (sql.includes('SELECT current_week')) return { rows: [{ current_week: 1, active_skeleton_id: 'sk' }] };
    if (sql.includes('SELECT day_of_week')) return { rows: [{ day_of_week: 1 }] };
    if (sql.includes('finished_at IS NULL')) return { rows: active ? [{ id: 'active' }] : [] };
    if (sql.includes('s.started_at AT TIME ZONE')) return { rows: trainedToday ? [{ id: 'done' }] : [] };
    if (sql.includes('INSERT INTO session_logs')) return { rows: [{ id: 'new' }] };
    return { rows: [] };
  });
});

it('starts the picked upper-body day despite a matching last group and a free alternative', async () => {
  const result = await startSession('ath', 'client', { dayOfWeek: 3 });
  expect(result).toMatchObject({ expectedDay: 3, sessionId: 'new' });
  expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO session_logs'), ['ath', 'sk', 1, 3, 0, 'client']);
});
it('still rejects completed days', async () => {
  await expect(startSession('ath', 'client', { dayOfWeek: 1, force: true })).rejects.toMatchObject({ reason: 'day_not_pending' });
});
it('still requires confirmation for a second session today', async () => {
  trainedToday = true;
  await expect(startSession('ath', 'client', { dayOfWeek: 3 })).rejects.toMatchObject({ reason: 'already_trained_today' });
  expect(await startSession('ath', 'client', { dayOfWeek: 3, force: true })).toMatchObject({ expectedDay: 3 });
});
it('still rejects an active session even with force', async () => {
  active = true;
  await expect(startSession('ath', 'client', { dayOfWeek: 3, force: true })).rejects.toMatchObject({ reason: 'session_in_progress' });
});
