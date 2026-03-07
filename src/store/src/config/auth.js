// PostgreSQL configuration for authentication (login uses the dedicated PG_* env vars)
// NOTE: This is still required for login functionality
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Only initialize if PostgreSQL env vars are provided
const poolHost = process.env.PG_HOST;
const hasPostgresConfig = poolHost && process.env.PG_USER && process.env.PG_PASSWORD;

let pool = null;

if (hasPostgresConfig) {
  const defaultSslValue = poolHost && poolHost.includes('.rds.amazonaws.com') ? 'true' : 'false';
  const sslEnabled = String(process.env.PG_SSL ?? defaultSslValue).toLowerCase() === 'true';

  pool = new pg.Pool({
    host: poolHost,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_NAME ?? process.env.PG_DATABASE,
    port: parseInt(process.env.PG_PORT ?? '5432', 10),
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
  });

  pool.on('error', (err, client) => {
    console.error('Unexpected error on idle PostgreSQL client', err);
    // Don't exit - graceful degradation
  });

  console.log('✅ PostgreSQL auth pool initialized');
} else {
  console.warn('⚠️ PostgreSQL auth not configured - login will not work');
}

/**
 * Provides a client from the PostgreSQL connection pool.
 * Remember to call client.release() when done.
 * @returns {Promise<pg.PoolClient>} A PostgreSQL client.
 */
export const getPgConnection = async () => {
  if (!pool) {
    throw new Error('PostgreSQL not configured. Please set PG_HOST, PG_USER, PG_PASSWORD in .env');
  }
  return pool.connect();
};

// Optional: A simple query function for convenience
export const query = (text, params) => pool.query(text, params);







