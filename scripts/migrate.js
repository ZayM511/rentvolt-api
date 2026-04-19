#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[MIGRATE] DATABASE_URL not set. Aborting.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: !process.env.DATABASE_URL.includes('localhost')
      ? { rejectUnauthorized: false }
      : false
  });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const { rows: applied } = await pool.query('SELECT version FROM schema_migrations');
    const appliedSet = new Set(applied.map((r) => r.version));

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let appliedCount = 0;
    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      if (appliedSet.has(version)) {
        console.log(`[MIGRATE] ✓ ${version} (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`[MIGRATE] ↻ applying ${version}...`);
      await pool.query('BEGIN');
      try {
        await pool.query(sql);
        await pool.query('COMMIT');
        appliedCount++;
        console.log(`[MIGRATE] ✓ ${version}`);
      } catch (err) {
        await pool.query('ROLLBACK');
        console.error(`[MIGRATE] ✗ ${version}: ${err.message}`);
        throw err;
      }
    }

    console.log(`[MIGRATE] Done. ${appliedCount} migration(s) newly applied.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[MIGRATE] Fatal:', err);
  process.exit(1);
});
