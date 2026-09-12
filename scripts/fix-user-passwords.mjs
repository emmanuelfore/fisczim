/**
 * One-time migration script: sets bcrypt passwords for existing users
 * that were created by Supabase and have no password in public.users.
 *
 * Usage:
 *   node scripts/fix-user-passwords.mjs <email> <new-password>
 *
 * Example:
 *   node scripts/fix-user-passwords.mjs emmanuelmutesva@gmail.com MyNewPass123
 */
import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcrypt';

const { Pool } = pg;
const [,, email, newPassword] = process.argv;

if (!email || !newPassword) {
  console.error('Usage: node scripts/fix-user-passwords.mjs <email> <password>');
  process.exit(1);
}
if (newPassword.length < 6) {
  console.error('Password must be at least 6 characters');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  // Find all users matching this email (there may be duplicates from old Supabase + new register)
  const { rows } = await pool.query(
    'SELECT id, email, name, is_super_admin, substring(password, 1, 10) as pwd_preview FROM users WHERE LOWER(email) = LOWER($1)',
    [email]
  );

  if (rows.length === 0) {
    console.log(`No user found with email: ${email}`);
    process.exit(1);
  }

  console.log(`Found ${rows.length} user(s):`);
  rows.forEach(u => console.log(`  id=${u.id}  name=${u.name}  superAdmin=${u.isSuperAdmin}  pwd_preview=${u.pwd_preview || '(empty)'}`));

  const hash = await bcrypt.hash(newPassword, 10);

  // Update ALL matching users (so both old and new get the same password)
  const result = await pool.query(
    'UPDATE users SET password = $1, "passwordChanged" = true WHERE LOWER(email) = LOWER($2) RETURNING id, email',
    [hash, email]
  );

  console.log(`\n✓ Password updated for ${result.rows.length} user(s):`);
  result.rows.forEach(u => console.log(`  ${u.email} (${u.id})`));

  // Show which user has companies so you know which ID to use
  const { rows: companyRows } = await pool.query(
    `SELECT cu.user_id, c.name as company_name, cu.role 
     FROM company_users cu 
     JOIN companies c ON c.id = cu.company_id
     WHERE cu.user_id = ANY($1::uuid[])`,
    [rows.map(r => r.id)]
  );

  if (companyRows.length > 0) {
    console.log(`\nCompany memberships:`);
    companyRows.forEach(r => console.log(`  user_id=${r.user_id}  company=${r.company_name}  role=${r.role}`));
  } else {
    console.log(`\n⚠ No company memberships found for any of these users.`);
    console.log(`  You may need to run the onboarding flow to create a company.`);
  }

} catch (err) {
  console.error('Error:', err.message);
} finally {
  await pool.end();
}
