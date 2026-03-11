const { Pool } = require("pg");
const dotenv = require("dotenv");
const path = require("path");
const { getLocalPostgresPort, isTunnelActive } = require("./sshTunnel");

dotenv.config({ path: path.join(__dirname, "../.env") });

let rawPool = null;
let poolProxy = null;

function isPoolInvalid(instance) {
  return !instance || instance._ending || instance._ended;
}

function parsePort(rawPort) {
  const matched = String(rawPort || "").match(/\d+/);
  if (!matched) return 5432;
  const parsed = Number(matched[0]);
  return Number.isFinite(parsed) ? parsed : 5432;
}

function getDbConfig() {
  const dbHost = process.env.DB_HOST || process.env.PG_HOST || "";
  const dbUser = process.env.DB_USER || process.env.PG_USER;
  const dbPassword = process.env.DB_PASSWORD || process.env.PG_PASSWORD;
  const dbName = process.env.DB_NAME || process.env.PG_DATABASE || process.env.PG_NAME;
  const dbPort = parsePort(process.env.DB_PORT || process.env.PG_PORT);
  const isRDS = dbHost.includes("rds.amazonaws.com");
  const useSSL =
    isRDS ||
    String(process.env.DB_SSL || process.env.PG_SSL || "").toLowerCase() === "true";

  return {
    dbHost,
    dbUser,
    dbPassword,
    dbName,
    dbPort,
    useSSL,
    isRDS,
  };
}

function shouldUseTunnel({ dbHost, isRDS }) {
  if (!process.env.SSH_HOST || !isTunnelActive()) {
    return false;
  }

  const tunnelPreference = String(
    process.env.PG_USE_SSH_TUNNEL ||
    process.env.DB_USE_SSH_TUNNEL ||
    ""
  ).toLowerCase();

  if (["true", "1", "yes"].includes(tunnelPreference)) {
    return true;
  }

  if (["false", "0", "no"].includes(tunnelPreference)) {
    return false;
  }

  return Boolean(dbHost) && !isRDS;
}

function shouldRecyclePool(error) {
  if (!error) return false;

  const message = String(error.message || error).toLowerCase();
  const code = String(error.code || "").toUpperCase();

  if (["ECONNRESET", "ETIMEDOUT", "EPIPE", "ECONNREFUSED", "57P01", "57P02", "57P03"].includes(code)) {
    return true;
  }

  return (
    message.includes("connection terminated") ||
    message.includes("connection timeout") ||
    message.includes("timeout expired") ||
    message.includes("terminating connection") ||
    message.includes("socket hang up") ||
    message.includes("read econnreset")
  );
}

function isRetrySafeQuery(text) {
  return /^\s*(select|with|show|explain)\b/i.test(String(text || ""));
}

function buildPoolConfig() {
  const { dbHost, dbUser, dbPassword, dbName, dbPort, useSSL, isRDS } = getDbConfig();
  const useTunnel = shouldUseTunnel({ dbHost, isRDS });
  const finalHost = useTunnel ? "127.0.0.1" : dbHost;
  const finalPort = useTunnel ? getLocalPostgresPort() : dbPort;

  if (useTunnel) {
    console.log(`[PostgreSQL] Using SSH tunnel on ${finalHost}:${finalPort} for ${dbName || "(missing-db)"}`);
  } else {
    console.log(`[PostgreSQL] Connecting to ${finalHost || "(missing-host)"}:${finalPort}/${dbName || "(missing-db)"}`);
  }

  return {
    host: finalHost,
    port: finalPort,
    user: dbUser,
    password: dbPassword,
    database: dbName,
    ssl: useSSL ? { rejectUnauthorized: false } : false,
    max: Number(process.env.PG_POOL_MAX || 20),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(
      process.env.PG_CONNECTION_TIMEOUT_MS || (isRDS ? 15000 : 10000)
    ),
    query_timeout: Number(process.env.PG_QUERY_TIMEOUT_MS || 30000),
    statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS || 30000),
    keepAlive: true,
    keepAliveInitialDelayMillis: Number(process.env.PG_KEEPALIVE_INITIAL_DELAY_MS || 10000),
    application_name: process.env.PG_APP_NAME || "sagargroup-backend",
  };
}

function attachPoolListeners(instance) {
  instance.on("error", (err) => {
    console.error("[PostgreSQL] Unexpected error on idle client:", err.message || err);
    if (rawPool === instance && shouldRecyclePool(err)) {
      void recyclePool("idle client error", err);
    }
  });

  instance.on("connect", (client) => {
    client.on("error", (err) => {
      console.error("[PostgreSQL] Client connection error:", err.message || err);
      if (rawPool === instance && shouldRecyclePool(err)) {
        void recyclePool("client error", err);
      }
    });
  });
}

function createRawPool() {
  rawPool = new Pool(buildPoolConfig());
  attachPoolListeners(rawPool);
  return rawPool;
}

function getRawPool() {
  if (isPoolInvalid(rawPool)) {
    createRawPool();
  }
  return rawPool;
}

async function recyclePool(reason, error) {
  const currentPool = rawPool;
  rawPool = null;

  if (error) {
    console.warn(`[PostgreSQL] Recycling pool after ${reason}: ${error.message || error}`);
  } else {
    console.warn(`[PostgreSQL] Recycling pool after ${reason}`);
  }

  if (!currentPool || currentPool._ending || currentPool._ended) {
    return;
  }

  try {
    await currentPool.end();
  } catch (closeErr) {
    console.warn("[PostgreSQL] Pool close warning:", closeErr.message || closeErr);
  }
}

async function queryWithRecovery(text, params = [], attempt = 0) {
  const activePool = getRawPool();

  try {
    const result = await activePool.query(text, params);
    return result;
  } catch (err) {
    if (shouldRecyclePool(err)) {
      await recyclePool("query failure", err);

      if (attempt === 0 && isRetrySafeQuery(text)) {
        return queryWithRecovery(text, params, attempt + 1);
      }
    }

    console.error("[PostgreSQL] Query error:", err.message || err);
    throw err;
  }
}

async function connectWithRecovery(attempt = 0) {
  const activePool = getRawPool();

  try {
    return await activePool.connect();
  } catch (err) {
    if (attempt === 0 && shouldRecyclePool(err)) {
      await recyclePool("connect failure", err);
      return connectWithRecovery(attempt + 1);
    }
    throw err;
  }
}

function getPgPool() {
  if (poolProxy) {
    return poolProxy;
  }

  const facade = {
    query: queryWithRecovery,
    connect: connectWithRecovery,
    end: async () => recyclePool("manual close"),
  };

  poolProxy = new Proxy(facade, {
    get(target, prop) {
      if (prop in target) {
        return target[prop];
      }

      const activePool = getRawPool();
      const value = activePool[prop];

      if (typeof value === "function") {
        return value.bind(activePool);
      }

      return value;
    },
  });

  return poolProxy;
}

async function pgQuery(text, params = []) {
  const start = Date.now();
  const result = await queryWithRecovery(text, params);
  const duration = Date.now() - start;

  if (duration > 1000) {
    console.warn(`[PostgreSQL] Slow query (${duration}ms): ${String(text).substring(0, 100)}...`);
  }

  return result;
}

function getLoginPool() {
  return getPgPool();
}

async function loginQuery(text, params = []) {
  return queryWithRecovery(text, params);
}

async function closePgPool() {
  await recyclePool("shutdown");
}

function resetPool() {
  void recyclePool("reset");
}

module.exports = {
  getPgPool,
  getLoginPool,
  pgQuery,
  loginQuery,
  closePgPool,
  resetPool,
};
