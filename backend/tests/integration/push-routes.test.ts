export {};
const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { signToken } = await import('../../src/middleware/auth.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const requestMod = await import('supertest');
const request = requestMod.default;
const appMod = await import('../../src/app.js');
const app = appMod.default;

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

async function makeAthlete() {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, 'x', 'athlete') RETURNING id`,
    [`p-${Date.now()}-${Math.random()}@t.local`],
  );
  return rows[0].id;
}

describe('POST /api/push/register', () => {
  it('inserts new token', async () => {
    const u = await makeAthlete();
    const tok = signToken({ id: u, role: 'athlete' });
    const r = await request(app)
      .post('/api/push/register')
      .set('Authorization', `Bearer ${tok}`)
      .send({ token: 'a'.repeat(30), platform: 'android' });
    expect(r.status).toBe(201);
    const row = await pool.query(`SELECT user_id, platform FROM push_tokens`);
    expect(row.rows[0].user_id).toBe(u);
    expect(row.rows[0].platform).toBe('android');
  });

  it('upserts on duplicate token', async () => {
    const u = await makeAthlete();
    const tok = signToken({ id: u, role: 'athlete' });
    const t = 'b'.repeat(30);
    await request(app).post('/api/push/register')
      .set('Authorization', `Bearer ${tok}`)
      .send({ token: t, platform: 'ios' });
    const r2 = await request(app).post('/api/push/register')
      .set('Authorization', `Bearer ${tok}`)
      .send({ token: t, platform: 'ios' });
    expect(r2.status).toBe(201);
    const c = await pool.query(`SELECT COUNT(*)::int AS n FROM push_tokens WHERE token=$1`, [t]);
    expect(c.rows[0].n).toBe(1);
  });

  it('rejects unauth', async () => {
    const r = await request(app).post('/api/push/register').send({});
    expect(r.status).toBe(401);
  });

  it('rejects coach role', async () => {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role)
       VALUES ('coach@t.local','x','coach') RETURNING id`,
    );
    const tok = signToken({ id: rows[0].id, role: 'coach' });
    const r = await request(app).post('/api/push/register')
      .set('Authorization', `Bearer ${tok}`)
      .send({ token: 'c'.repeat(30), platform: 'android' });
    expect(r.status).toBe(403);
  });

  it('rejects invalid payload', async () => {
    const u = await makeAthlete();
    const tok = signToken({ id: u, role: 'athlete' });
    const r = await request(app)
      .post('/api/push/register')
      .set('Authorization', `Bearer ${tok}`)
      .send({ token: 'x', platform: 'desktop' });
    expect(r.status).toBe(400);
  });
});

describe('DELETE /api/push/register', () => {
  it('removes token', async () => {
    const u = await makeAthlete();
    const tok = signToken({ id: u, role: 'athlete' });
    const t = 'd'.repeat(30);
    await pool.query(
      `INSERT INTO push_tokens (user_id, token, platform) VALUES ($1, $2, 'android')`,
      [u, t],
    );
    const r = await request(app).delete('/api/push/register')
      .set('Authorization', `Bearer ${tok}`)
      .send({ token: t });
    expect(r.status).toBe(204);
    const c = await pool.query(`SELECT 1 FROM push_tokens WHERE token=$1`, [t]);
    expect(c.rowCount).toBe(0);
  });
});
