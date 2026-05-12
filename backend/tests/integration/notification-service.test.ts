import { jest } from '@jest/globals';

const mockSendPush = jest.fn<(token: string, payload: { title: string; body: string; data?: Record<string,string> }) => Promise<'sent'|'token_invalid'|'failed'>>();
jest.unstable_mockModule('../../src/services/push.service.js', () => ({
  sendPush: mockSendPush,
}));

const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const { notifyUser } = await import('../../src/services/notification.service.js');

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); mockSendPush.mockReset(); });
afterAll(async () => { await closePool(); });

async function makeAthleteWithToken(token = 'tok-' + Math.random()) {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, 'x', 'athlete') RETURNING id`,
    [`u-${Date.now()}-${Math.random()}@t.local`],
  );
  await pool.query(
    `INSERT INTO push_tokens (user_id, token, platform) VALUES ($1, $2, 'android')`,
    [rows[0].id, token],
  );
  return { userId: rows[0].id, token };
}

describe('notifyUser', () => {
  it('sends push and logs sent status', async () => {
    const { userId, token } = await makeAthleteWithToken('t1');
    mockSendPush.mockResolvedValueOnce('sent');
    await notifyUser(userId, 'session_reminder');
    expect(mockSendPush).toHaveBeenCalledWith(token, expect.objectContaining({
      title: 'Hora de entrenar',
      data: expect.objectContaining({ route: '/(app)/athlete' }),
    }));
    const log = await pool.query(
      `SELECT type, delivery_status FROM notification_log WHERE user_id=$1`,
      [userId],
    );
    expect(log.rows[0].delivery_status).toBe('sent');
    expect(log.rows[0].type).toBe('session_reminder');
  });

  it('skips when pref disabled', async () => {
    const { userId } = await makeAthleteWithToken('t2');
    await pool.query(
      `UPDATE users SET notification_prefs = notification_prefs || '{"session_reminder": false}'::jsonb WHERE id=$1`,
      [userId],
    );
    await notifyUser(userId, 'session_reminder');
    expect(mockSendPush).not.toHaveBeenCalled();
    const log = await pool.query(`SELECT 1 FROM notification_log WHERE user_id=$1`, [userId]);
    expect(log.rowCount).toBe(0);
  });

  it('dedups within window', async () => {
    const { userId } = await makeAthleteWithToken('t3');
    mockSendPush.mockResolvedValue('sent');
    await notifyUser(userId, 'session_reminder');
    await notifyUser(userId, 'session_reminder');
    expect(mockSendPush).toHaveBeenCalledTimes(1);
  });

  it('deletes push_tokens row when token_invalid', async () => {
    const { userId, token } = await makeAthleteWithToken('t4');
    mockSendPush.mockResolvedValueOnce('token_invalid');
    await notifyUser(userId, 'session_reminder');
    const r = await pool.query(`SELECT 1 FROM push_tokens WHERE token=$1`, [token]);
    expect(r.rowCount).toBe(0);
    const log = await pool.query(
      `SELECT delivery_status FROM notification_log WHERE user_id=$1`, [userId],
    );
    expect(log.rows[0].delivery_status).toBe('token_invalid');
  });

  it('skips when user has no tokens', async () => {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role)
       VALUES ('notok@t.local','x','athlete') RETURNING id`,
    );
    await notifyUser(rows[0].id, 'session_reminder');
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  it('passes vars to template and stores in payload', async () => {
    const { userId } = await makeAthleteWithToken('t6');
    mockSendPush.mockResolvedValueOnce('sent');
    await notifyUser(userId, 'week_start', { week: '11' });
    expect(mockSendPush).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      title: 'Semana 11 arranca',
    }));
    const log = await pool.query<{ payload: Record<string,string> }>(
      `SELECT payload FROM notification_log WHERE user_id=$1`, [userId],
    );
    expect(log.rows[0].payload).toEqual({ week: '11' });
  });
});
