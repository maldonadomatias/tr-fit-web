import 'dotenv/config';
import pool from '../db/connect.js';
import { hashPassword } from '../services/auth.service.js';

async function main() {
  const [email, password, name] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage: tsx src/scripts/create-coach.ts <email> <password> [name]');
    process.exit(1);
  }

  const exists = await pool.query(`SELECT 1 FROM users WHERE email = $1`, [email]);
  if (exists.rowCount && exists.rowCount > 0) {
    console.error(`User with email ${email} already exists`);
    process.exit(1);
  }

  const hash = await hashPassword(password);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, email_verified, email_verified_at)
       VALUES ($1, $2, 'coach', TRUE, NOW()) RETURNING id`,
      [email, hash],
    );
    const id = r.rows[0].id;
    await client.query(
      `INSERT INTO coach_profiles (user_id, name) VALUES ($1, $2)`,
      [id, name ?? 'Coach'],
    );
    await client.query('COMMIT');
    console.log(`Coach created: id=${id} email=${email}`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Failed to create coach', e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
