// Migration runner script
// Run this to create the indent table in PostgreSQL
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getPgPool } from '../config/postgres.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
  const pool = getPgPool();
  const client = await pool.connect();

  try {
    console.log('🔄 Running migration: create_indent_table.sql');

    const sqlFile = join(__dirname, 'create_indent_table.sql');
    const sql = readFileSync(sqlFile, 'utf8');

    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');

    console.log('✅ Migration completed successfully!');
    console.log('✅ indent table created in PostgreSQL');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigration()
    .then(() => {
      console.log('✅ Migration script completed');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Migration script failed:', err);
      process.exit(1);
    });
}

export { runMigration };










