const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres.nopztclveukecdabuist:%23Ndakapenga4710@aws-1-eu-west-3.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

pool.query(`
SELECT conname, conrelid::regclass, confrelid::regclass, contype
FROM pg_constraint
WHERE conrelid = 'products'::regclass OR confrelid = 'products'::regclass
`)
  .then(res => {
    console.log(res.rows);
    pool.end();
  })
  .catch(err => {
    console.error(err.message);
    pool.end();
  });