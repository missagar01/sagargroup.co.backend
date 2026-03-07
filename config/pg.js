const { Pool } = require("pg");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

let pool;
function isPoolInvalid(instance) {
  return !instance || instance._ending || instance._ended;
}

function parsePort(rawPort) {
  const matched = String(rawPort || "").match(/\d+/);
  if (!matched) return 5432;
  const parsed = Number(matched[0]);
  return Number.isFinite(parsed) ? parsed : 5432;
}

/**
 * Singleton pool instance
 */
function getPgPool() {
  if (!isPoolInvalid(pool)) return pool;

  const dbHost = process.env.DB_HOST || process.env.PG_HOST || "";
  const dbUser = process.env.DB_USER || process.env.PG_USER;
  const dbPassword = process.env.DB_PASSWORD || process.env.PG_PASSWORD;
  const dbName = process.env.DB_NAME || process.env.PG_DATABASE || process.env.PG_NAME;
  const dbPort = process.env.DB_PORT || process.env.PG_PORT;
  const isRDS = dbHost.includes("rds.amazonaws.com");
  const useSSL =
    isRDS ||
    String(process.env.DB_SSL || process.env.PG_SSL || "").toLowerCase() === "true";

  console.log(`📡 Connecting to PostgreSQL: ${dbHost}`);

  pool = new Pool({
    host: dbHost,
    port: parsePort(dbPort),
    user: dbUser,
    password: dbPassword,
    database: dbName,
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
  if (!isPoolInvalid(loginPool)) return loginPool;

  const dbHost = process.env.DB_HOST || process.env.PG_HOST || "";
  const dbUser = process.env.DB_USER || process.env.PG_USER;
  const dbPassword = process.env.DB_PASSWORD || process.env.PG_PASSWORD;
  const dbName = process.env.DB_NAME || process.env.PG_DATABASE || process.env.PG_NAME;
  const dbPort = process.env.DB_PORT || process.env.PG_PORT;
  const isRDS = dbHost.includes("rds.amazonaws.com");
  const useSSL =
    isRDS ||
    String(process.env.DB_SSL || process.env.PG_SSL || "").toLowerCase() === "true";

  loginPool = new Pool({
    host: dbHost,
    port: parsePort(dbPort),
    user: dbUser,
    password: dbPassword,
    database: dbName,
    ssl: useSSL ? { rejectUnauthorized: false } : false,
    max: 5,
  });

  loginPool.on("error", (err) => {
    console.error("❌ Unexpected error on idle login client", err);
    loginPool = null;
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
