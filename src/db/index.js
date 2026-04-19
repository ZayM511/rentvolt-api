const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.warn('[DB] DATABASE_URL not set — database features will fail. Set it before starting the server in production.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')
    ? { rejectUnauthorized: false }
    : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

const query = (text, params) => pool.query(text, params);

const tx = async (fn) => {
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
};

const ping = async () => {
  const { rows } = await pool.query('SELECT 1 AS ok');
  return rows[0].ok === 1;
};

module.exports = { pool, query, tx, ping };
