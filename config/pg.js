require("dotenv").config({ path: require("path").join(__dirname, "../.env"), quiet: true });
const { createManagedPool, usesPostgresTunnel } = require("./postgresPool");

function parsePort(rawPort) {
  const matched = String(rawPort || "").match(/\d+/);
  return matched ? Number(matched[0]) : 5432;
}

const host = process.env.DB_HOST || process.env.PG_HOST || "";
const isRDS = host.includes("rds.amazonaws.com");
const pool = createManagedPool("Shared", () => ({
  host,
  port: parsePort(process.env.DB_PORT || process.env.PG_PORT),
  user: process.env.DB_USER || process.env.PG_USER,
  password: process.env.DB_PASSWORD || process.env.PG_PASSWORD,
  database: process.env.DB_NAME || process.env.PG_DATABASE || process.env.PG_NAME,
  ssl: isRDS || String(process.env.DB_SSL || process.env.PG_SSL).toLowerCase() === "true"
    ? { rejectUnauthorized: false }
    : false,
  max: Number(process.env.PG_POOL_MAX || 20),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: isRDS ? 15000 : 10000,
  options: [process.env.PGOPTIONS, "-c timezone=Asia/Kolkata"].filter(Boolean).join(" "),
  application_name: process.env.PG_APP_NAME || "sagargroup-backend",
}), { useTunnel: usesPostgresTunnel(host) });

module.exports = {
  getPgPool: () => pool,
  getLoginPool: () => pool,
  pgQuery: (text, params) => pool.query(text, params),
  loginQuery: (text, params) => pool.query(text, params),
  closePgPool: () => pool.end(),
  resetPool: () => { void pool.end(); },
};
