const { Pool } = require("pg");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

let pool;

/**
 * Singleton pool instance
 */
function getPgPool() {
  if (pool) return pool;

  const dbHost = process.env.DB_HOST || "";
  const isRDS = dbHost.includes("rds.amazonaws.com");
  const useSSL = isRDS || String(process.env.DB_SSL || "").toLowerCase() === "true";

  console.log(`📡 Connecting to PostgreSQL: ${dbHost}`);

  pool = new Pool({
    host: dbHost,
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: useSSL ? { rejectUnauthorized: false } : false,
    max: 20, // Increased for better concurrency
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  pool.on("error", (err) => {
    console.error("❌ Unexpected error on idle client", err);
    pool = null; // Force recreation on next use if pool breaks
  });

  return pool;
}

/**
 * Execute a query with automatic connection handling
 */
async function pgQuery(text, params = []) {
  const start = Date.now();
  try {
    const result = await getPgPool().query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.warn(`⏳ Slow Query (${duration}ms): ${text.substring(0, 100)}...`);
    }
    return result;
  } catch (err) {
    console.error("❌ PostgreSQL Query Error:", err.message);
    throw err;
  }
}

/**
 * Login database pool (if different)
 */
let loginPool;
function getLoginPool() {
  if (loginPool) return loginPool;

  const dbHost = process.env.DB_HOST || "";
  const isRDS = dbHost.includes("rds.amazonaws.com");
  const useSSL = isRDS || String(process.env.DB_SSL || "").toLowerCase() === "true";

  loginPool = new Pool({
    host: dbHost,
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: useSSL ? { rejectUnauthorized: false } : false,
    max: 5,
  });

  return loginPool;
}

async function loginQuery(text, params = []) {
  return getLoginPool().query(text, params);
}

async function closePgPool() {
  if (pool) { await pool.end(); pool = null; }
  if (loginPool) { await loginPool.end(); loginPool = null; }
}

function resetPool() {
  pool = null;
  loginPool = null;
}

module.exports = {
  getPgPool,
  getLoginPool,
  pgQuery,
  loginQuery,
  closePgPool,
  resetPool,
};
