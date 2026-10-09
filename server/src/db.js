// Shared PostgreSQL connection pool.
// A pool keeps a few connections open and reuses them, which is much faster
// than opening a new connection for every request.
import pg from 'pg';
import 'dotenv/config';

// Return NUMERIC columns as JS numbers instead of strings (safe here: our
// values are small, like 123.45 grams). 1700 = NUMERIC, 20 = BIGINT (COUNT).
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
pg.types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));
// Return DATE columns as plain 'YYYY-MM-DD' strings (avoids timezone shifts).
pg.types.setTypeParser(1082, (v) => v);

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is missing. Copy server/.env.example to server/.env');
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  // Hosted databases (Neon, Supabase, Render) require SSL.
  ssl: /sslmode=require|neon\.tech|supabase|render\.com/.test(process.env.DATABASE_URL || '')
    ? { rejectUnauthorized: false }
    : undefined,
  // Vercel runs many small copies of the API, so each one keeps fewer connections.
  max: process.env.VERCEL ? 3 : 10,
});

// Small helper: db.query('SELECT ... WHERE id = $1', [id])
export const query = (text, params) => pool.query(text, params);

// Run several queries in one transaction: all succeed or none are saved.
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
