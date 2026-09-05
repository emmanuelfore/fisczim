const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:2512@161.97.115.59:5432/postgres',
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