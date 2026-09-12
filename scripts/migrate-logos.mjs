/**
 * One-time migration: downloads all Supabase-hosted logos to local disk
 * and updates company logo_url in the DB to point to the local server.
 *
 * Usage:
 *   node scripts/migrate-logos.mjs [--host http://localhost:5001]
 *
 * The --host flag sets the base URL written into logo_url in the DB.
 * Default: http://localhost:5001  (change for production, e.g. https://yourdomain.com)
 */
import 'dotenv/config';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

// Parse --host flag
const hostArg = process.argv.find(a => a.startsWith('--host='));
const HOST = hostArg ? hostArg.split('=')[1] : (process.env.VITE_API_URL || 'http://localhost:5001');

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const uploadDir = path.join(rootDir, 'uploads', 'logos');
fs.mkdirSync(uploadDir, { recursive: true });

async function downloadLogo(url, filename) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const localPath = path.join(uploadDir, filename);
  fs.writeFileSync(localPath, buffer);
  return localPath;
}

function extFromUrl(url) {
  try {
    const p = new URL(url).pathname;
    const ext = path.extname(p);
    return ext || '.png';
  } catch {
    return '.png';
  }
}

async function run() {
  const { rows } = await pool.query(
    `SELECT id, name, logo_url FROM companies 
     WHERE logo_url IS NOT NULL 
       AND logo_url != ''
       AND logo_url NOT LIKE '/uploads/%'
     ORDER BY id`
  );

  console.log(`Found ${rows.length} companies with external logo URLs to migrate.\n`);

  let ok = 0, skip = 0, fail = 0;

  for (const company of rows) {
    const { id, name, logo_url } = company;

    // Skip if already local
    if (logo_url.startsWith('/uploads/') || logo_url.includes('localhost') || logo_url.includes('127.0.0.1')) {
      console.log(`  SKIP  [${id}] ${name} — already local`);
      skip++;
      continue;
    }

    const ext = extFromUrl(logo_url);
    const filename = `company-${id}-logo-migrated${ext}`;

    try {
      await downloadLogo(logo_url, filename);
      const newUrl = `${HOST}/uploads/logos/${filename}`;
      await pool.query('UPDATE companies SET logo_url = $1 WHERE id = $2', [newUrl, id]);
      console.log(`  OK    [${id}] ${name}`);
      ok++;
    } catch (err) {
      console.log(`  FAIL  [${id}] ${name} — ${err.message} (keeping old URL)`);
      fail++;
    }
  }

  console.log(`\nDone. ${ok} migrated, ${skip} skipped, ${fail} failed.`);
  if (fail > 0) {
    console.log('Failed logos kept their original Supabase URLs and will still display as long as Supabase is active.');
  }
}

run().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
}).finally(() => pool.end());
