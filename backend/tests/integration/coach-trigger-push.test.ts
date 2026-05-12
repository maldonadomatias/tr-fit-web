import { jest } from '@jest/globals';

const mockNotify = jest.fn<(userId: string, type: string, vars?: Record<string,string>) => Promise<void>>();
jest.unstable_mockModule('../../src/services/notification.service.js', () => ({
  notifyUser: mockNotify,
}));

const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { signToken } = await import('../../src/middleware/auth.js');
const { createCoach, createAthlete } = await import('./helpers/fixtures.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const requestMod = await import('supertest');
const request = requestMod.default;
const appMod = await import('../../src/app.js');
const app = appMod.default;

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => {
  await resetDatabase();
  mockNotify.mockReset();
  mockNotify.mockResolvedValue(undefined);
});
afterAll(async () => { await closePool(); });

describe('coach push triggers', () => {
  it('skeleton approve calls notifyUser', async () => {
    const coachId = await createCoach();
    const athleteId = await createAthlete(coachId);
    const sk = await pool.query<{ id: string }>(
      `INSERT INTO athlete_skeletons (athlete_id, status, generation_prompt, generation_rationale)
       VALUES ($1, 'pending_review', '{}'::jsonb, 'test') RETURNING id`,
      [athleteId],
    );
    const tok = signToken({ id: coachId, role: 'coach' });
    const r = await request(app)
      .post(`/api/coach/skeletons/${sk.rows[0].id}/approve`)
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBeLessThan(300);
    // Wait a tick for fire-and-forget
    await new Promise((res) => setTimeout(res, 50));
    expect(mockNotify).toHaveBeenCalledWith(athleteId, 'skeleton_approved');
  });

  it('alert resolve calls notifyUser', async () => {
    const coachId = await createCoach();
    const athleteId = await createAthlete(coachId);
    const alert = await pool.query<{ id: string }>(
      `INSERT INTO coach_alerts (athlete_id, coach_id, type, severity, payload)
       VALUES ($1, $2, 'sos_pain', 'red', '{"zone":"lumbar","intensity":7}'::jsonb)
       RETURNING id`,
      [athleteId, coachId],
    );
    const tok = signToken({ id: coachId, role: 'coach' });
    const r = await request(app)
      .patch(`/api/coach/alerts/${alert.rows[0].id}/resolve`)
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBeLessThan(300);
    await new Promise((res) => setTimeout(res, 50));
    expect(mockNotify).toHaveBeenCalledWith(
      athleteId,
      'sos_resolved',
      expect.objectContaining({}),
    );
  });
});
