import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
    const res = await pool.query('SELECT id, name FROM companies');
    console.table(res.rows);
    await pool.end();
}

run();