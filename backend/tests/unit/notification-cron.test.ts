import { jest } from '@jest/globals';
import { DateTime } from 'luxon';

const mockNotify = jest.fn<() => Promise<void>>();
jest.unstable_mockModule('../../src/services/notification.service.js', () => ({
  notifyUser: mockNotify,
}));

const mockQuery = jest.fn<() => Promise<{ rows: unknown[]; rowCount?: number }>>();
jest.unstable_mockModule('../../src/db/connect.js', () => ({
  default: { query: mockQuery },
}));

const { runNotificationTick } = await import('../../src/workers/notification-cron.js');

beforeEach(() => {
  mockNotify.mockReset();
  mockNotify.mockResolvedValue(undefined);
  mockQuery.mockReset();
});

describe('runNotificationTick', () => {
  it('fires session_reminder at local 8am on training day (Monday)', async () => {
    // Monday 2026-05-11 8am Argentina (UTC-3) → 2026-05-11T11:00:00Z
    const now = DateTime.fromISO('2026-05-11T11:00:00.000Z');
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'u1',
        timezone: 'America/Argentina/Buenos_Aires',
        days_specific: ['lun'],
      }],
    });
    await runNotificationTick(now);
    expect(mockNotify).toHaveBeenCalledWith('u1', 'session_reminder');
  });

  it('skips session_reminder when today not in days_specific', async () => {
    const now = DateTime.fromISO('2026-05-11T11:00:00.000Z');
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'u2', timezone: 'America/Argentina/Buenos_Aires', days_specific: ['mar'] }],
    });
    await runNotificationTick(now);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('fires week_start on Monday 7am local', async () => {
    // Monday 2026-05-11 7am Argentina → 2026-05-11T10:00:00Z
    const now = DateTime.fromISO('2026-05-11T10:00:00.000Z');
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'u3', timezone: 'America/Argentina/Buenos_Aires', days_specific: null }] })
      .mockResolvedValueOnce({ rows: [{ current_week: 11 }] });
    await runNotificationTick(now);
    expect(mockNotify).toHaveBeenCalledWith('u3', 'week_start', { week: '11' });
  });

  it('fires rm_test_week on Sunday 21h local when week in (10, 20, 30)', async () => {
    // Sunday 2026-05-10 21h Argentina → 2026-05-11T00:00:00Z
    const now = DateTime.fromISO('2026-05-11T00:00:00.000Z');
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'u4', timezone: 'America/Argentina/Buenos_Aires', days_specific: null }] })
      .mockResolvedValueOnce({ rows: [{ current_week: 10 }] });
    await runNotificationTick(now);
    expect(mockNotify).toHaveBeenCalledWith('u4', 'rm_test_week', { week: '10' });
  });

  it('does not fire rm_test_week when week is 5', async () => {
    const now = DateTime.fromISO('2026-05-11T00:00:00.000Z');
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'u5', timezone: 'America/Argentina/Buenos_Aires', days_specific: null }] })
      .mockResolvedValueOnce({ rows: [{ current_week: 5 }] });
    await runNotificationTick(now);
    expect(mockNotify).not.toHaveBeenCalledWith('u5', 'rm_test_week', expect.anything());
  });
});
