import { jest } from '@jest/globals';

const sendApproved = jest
  .fn<(o: never) => Promise<void>>()
  .mockResolvedValue(undefined);
const noop = () =>
  jest.fn<(o: never) => Promise<void>>().mockResolvedValue(undefined);
// The factory REPLACES the whole module, and this test imports app.ts — whose
// route tree pulls in auth.service (sendVerifyEmail, sendPasswordResetEmail) and
// alert.service (sendCoachPainAlert). Every export of email.service must be
// present here or ESM fails the import with "does not provide an export named".
jest.unstable_mockModule('../../src/services/email.service.js', () => ({
  sendAccountApprovedEmail: sendApproved,
  sendVerifyEmail: noop(),
  sendPasswordResetEmail: noop(),
  sendCoachPainAlert: noop(),
  sendMembershipExpiringEmail: noop(),
  sendMembershipExpiredEmail: noop(),
}));

const { resetDatabase, ensureMigrated, closePool } =
  await import('./helpers/test-db.js');
const { signToken } = await import('../../src/middleware/auth.js');
const { createAdmin, signupUserInDb, setMembership } = await import(
  './helpers/fixtures.js'
);
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const requestMod = await import('supertest');
const request = requestMod.default;
const appMod = await import('../../src/app.js');
const app = appMod.default;

beforeAll(async () => {
  await ensureMigrated();
});
beforeEach(async () => {
  await resetDatabase();
  sendApproved.mockClear();
  sendApproved.mockResolvedValue(undefined);
});
afterAll(async () => {
  await closePool();
});

const PWD = 'pwd-test-1234';

async function pendingAthlete(email: string): Promise<string> {
  const { id } = await signupUserInDb(email, PWD, true);
  await pool.query(`UPDATE users SET status = 'pending' WHERE id = $1`, [id]);
  return id;
}

function adminToken(id: string): string {
  return signToken({ id, role: 'admin' });
}

const PAYMENT = {
  amount: 30000,
  method: 'transfer' as const,
  paid_at: '2026-08-07',
};

describe('approval email', () => {
  it('does not email when a pending athlete is approved without membership', async () => {
    const tok = adminToken(await createAdmin());
    const id = await pendingAthlete('approve-no-mem@test.local');

    const res = await request(app)
      .patch(`/api/admin/users/${id}`)
      .set('Authorization', `Bearer ${tok}`)
      .send({ status: 'approved' });

    expect(res.status).toBe(200);
    expect(sendApproved).not.toHaveBeenCalled();
  });

  it('emails when registering a payment enables a pending account', async () => {
    const tok = adminToken(await createAdmin());
    const email = 'pay-enable@test.local';
    const id = await pendingAthlete(email);

    const res = await request(app)
      .post(`/api/admin/users/${id}/payments`)
      .set('Authorization', `Bearer ${tok}`)
      .send(PAYMENT);

    expect(res.status).toBe(201);
    expect(sendApproved).toHaveBeenCalledTimes(1);
    const arg = sendApproved.mock.calls[0]?.[0] as unknown as {
      email: string;
      name: string;
    };
    expect(arg.email).toBe(email);
    expect(typeof arg.name).toBe('string');
    expect(arg.name.length).toBeGreaterThan(0);
  });

  it('emails when approving a pending athlete who already has active membership', async () => {
    const tok = adminToken(await createAdmin());
    const email = 'prepay-approve@test.local';
    const id = await pendingAthlete(email);
    await setMembership(id, 'infinity', 'active');

    const res = await request(app)
      .patch(`/api/admin/users/${id}`)
      .set('Authorization', `Bearer ${tok}`)
      .send({ status: 'approved' });

    expect(res.status).toBe(200);
    expect(sendApproved).toHaveBeenCalledTimes(1);
    const arg = sendApproved.mock.calls[0]?.[0] as unknown as { email: string };
    expect(arg.email).toBe(email);
  });

  it('emails when approving a pending admin (not payment-gated)', async () => {
    const tok = adminToken(await createAdmin());
    const email = 'pending-admin@test.local';
    // createAdmin leaves status approved; build a pending admin manually
    const { id } = await signupUserInDb(email, PWD, true);
    await pool.query(
      `UPDATE users SET role = 'admin', status = 'pending' WHERE id = $1`,
      [id]
    );

    const res = await request(app)
      .patch(`/api/admin/users/${id}`)
      .set('Authorization', `Bearer ${tok}`)
      .send({ status: 'approved' });

    expect(res.status).toBe(200);
    expect(sendApproved).toHaveBeenCalledTimes(1);
    const arg = sendApproved.mock.calls[0]?.[0] as unknown as { email: string };
    expect(arg.email).toBe(email);
  });

  it('does not email on a renewal payment for a user who can already log in', async () => {
    const tok = adminToken(await createAdmin());
    const { id } = await signupUserInDb('renew@test.local', PWD, true);
    await pool.query(`UPDATE users SET status = 'approved' WHERE id = $1`, [
      id,
    ]);
    await setMembership(id, 'infinity', 'active');

    const res = await request(app)
      .post(`/api/admin/users/${id}/payments`)
      .set('Authorization', `Bearer ${tok}`)
      .send(PAYMENT);

    expect(res.status).toBe(201);
    expect(sendApproved).not.toHaveBeenCalled();
  });

  it('a failing email does not fail the approve request', async () => {
    const tok = adminToken(await createAdmin());
    const id = await pendingAthlete('mail-down@test.local');
    await setMembership(id, 'infinity', 'active');
    sendApproved.mockRejectedValue(new Error('resend down') as never);

    const res = await request(app)
      .patch(`/api/admin/users/${id}`)
      .set('Authorization', `Bearer ${tok}`)
      .send({ status: 'approved' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
  });
});
