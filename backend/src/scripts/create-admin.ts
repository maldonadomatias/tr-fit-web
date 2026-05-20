import bcrypt from 'bcrypt';
import pool from '../db/connect.js';

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error('usage: tsx src/scripts/create-admin.ts <email> <password>');
  process.exit(1);
}

const BCRYPT_COST = 10;

async function main() {
  const hash = await bcrypt.hash(password, BCRYPT_COST);
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE email = $1`,
    [email.toLowerCase()],
  );
  if (existing.rows[0]) {
    await pool.query(
      `UPDATE users SET role='admin', status='approved', email_verified=true,
                        email_verified_at=COALESCE(email_verified_at, NOW()),
                        password_hash=$1
         WHERE id=$2`,
      [hash, existing.rows[0].id],
    );
    console.log(`Updated existing user ${email} → admin/approved`);
  } else {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO users
         (email, password_hash, role, status, email_verified, email_verified_at)
         VALUES ($1, $2, 'admin', 'approved', true, NOW())
         RETURNING id`,
      [email.toLowerCase(), hash],
    );
    console.log(`Created admin ${email} id=${r.rows[0].id}`);
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
