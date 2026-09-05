const { Pool } = require('pg');

const remotePool = new Pool({ connectionString: 'postgresql://postgres.nopztclveukecdabuist:%23Ndakapenga4710@aws-1-eu-west-3.pooler.supabase.com:5432/postgres' });
const localPool = new Pool({ connectionString: 'postgresql://postgres:2512@localhost:5432/fisczim' });

async function migrate() {
  const { rows: tables } = await remotePool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
  
  const client = await localPool.connect();
  await client.query("SET session_replication_role = 'replica';"); // disable FK checks
  
  for (const { table_name } of tables) {
    try {
      if (table_name === 'drizzle_migrations') continue; // bypass
      
      const { rows } = await remotePool.query(`SELECT * FROM "${table_name}"`);
      if (rows.length === 0) continue;
      
      const cols = Object.keys(rows[0]);
      let inserted = 0;
      for (const row of rows) {
        const vals = cols.map(c => row[c]);
        const placeholders = cols.map((_, i) => '$'+(i+1)).join(',');
        await client.query(`INSERT INTO "${table_name}" (${cols.map(c => '"'+c+'"').join(',')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, vals).catch(e => { console.error('insert er', table_name, e.message) });
        inserted++;
      }
      console.log(`Migrated ${table_name}: ${inserted} rows`);
    } catch(e) {
      console.log(`Error ${table_name}: ${e.message}`);
    }
  }
  
  const { rows: authUsers } = await remotePool.query(`SELECT * FROM auth.users`);
  console.log(`Migrating auth.users... found ${authUsers.length}`);
  // Migrate password hashes from auth.users array down to public.users!
  for (const au of authUsers) {
    await client.query(`UPDATE public.users SET password = $1 WHERE id = $2`, [au.encrypted_password, au.id]);
  }
  
  await client.query("SET session_replication_role = 'origin';");
  client.release();
}
migrate().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
