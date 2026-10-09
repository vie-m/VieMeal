// Runs one or more .sql files against DATABASE_URL.
// If the database itself does not exist yet, it is created first.
// Usage: node scripts/runSql.js ../database/schema.sql ../database/seed_base.sql
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import 'dotenv/config';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL missing in server/.env');
  process.exit(1);
}

async function ensureDatabaseExists() {
  const u = new URL(url);
  const dbName = u.pathname.slice(1);
  u.pathname = '/postgres'; // connect to the default maintenance DB
  const client = new pg.Client({ connectionString: u.toString() });
  try {
    await client.connect();
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (rowCount === 0) {
      // Identifiers cannot be parameters, so we validate the name first.
      if (!/^[a-zA-Z0-9_]+$/.test(dbName)) throw new Error('Invalid database name');
      await client.query(`CREATE DATABASE ${dbName}`);
      console.log(`Created database "${dbName}"`);
    }
  } catch (err) {
    // Hosted DBs often forbid connecting to "postgres"; that is fine.
    console.log('(skipping database auto-create:', err.message + ')');
  } finally {
    await client.end().catch(() => {});
  }
}

await ensureDatabaseExists();
const { pool } = await import('../src/db.js');

for (const file of process.argv.slice(2)) {
  const sql = fs.readFileSync(path.resolve(file), 'utf8');
  process.stdout.write(`Running ${path.basename(file)} ... `);
  await pool.query(sql);
  console.log('ok');
}
await pool.end();
