const { Pool } = require("pg");
const { getTunnelSession, onTunnelStateChange } = require("./sshTunnel");

const closers = new Set();
let shuttingDown = false;

function timeout(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function usesPostgresTunnel(host) {
  if (!process.env.SSH_HOST) return false;
  const preference = (process.env.PG_USE_SSH_TUNNEL || process.env.DB_USE_SSH_TUNNEL || "").toLowerCase();
  if (["true", "1", "yes"].includes(preference)) return true;
  if (["false", "0", "no"].includes(preference)) return false;
  return Boolean(process.env.SSH_USER && host) && !host.includes("rds.amazonaws.com");
}

function createManagedPool(name, buildOptions, { useTunnel = false } = {}) {
  let current;
  const draining = new Set();

  function retire() {
    if (!current) return Promise.resolve();
    const { pool } = current;
    current = undefined;
    const ending = pool.end().catch((error) => {
      console.warn("[PostgreSQL] Pool close failed", name, error.code || "PG_ERROR");
    }).finally(() => draining.delete(ending));
    draining.add(ending);
    return ending;
  }

  if (useTunnel) onTunnelStateChange(() => { void retire(); });
  closers.add(async () => {
    void retire();
    await Promise.all(draining);
  });

  function getPool() {
    if (shuttingDown) throw new Error("PostgreSQL is shutting down");
    const session = useTunnel ? getTunnelSession() : null;
    if (useTunnel && !session) throw new Error("PostgreSQL SSH tunnel unavailable");
    if (!current || current.session !== session) {
      void retire();
      const options = buildOptions();
      const pool = new Pool({
        ...options,
        ...(session && { host: "127.0.0.1", port: session.postgres.port }),
        connectionTimeoutMillis: timeout(process.env.PG_CONNECTION_TIMEOUT_MS, options.connectionTimeoutMillis || 10000),
        statement_timeout: timeout(process.env.PG_STATEMENT_TIMEOUT_MS, 30000),
        query_timeout: timeout(process.env.PG_QUERY_TIMEOUT_MS, 35000),
        keepAlive: true,
        keepAliveInitialDelayMillis: timeout(process.env.PG_KEEPALIVE_INITIAL_DELAY_MS, 10000),
      });
      // pg removes broken idle clients itself. Checked-out clients also need an error listener.
      pool.on("error", (error) => console.warn("[PostgreSQL] Idle client lost", name, error.code || "PG_ERROR"));
      pool.on("connect", (client) => client.on("error", () => {}));
      current = { pool, session };
    }
    return current.pool;
  }

  function dispatch(method, args) {
    let pool;
    try {
      pool = getPool();
    } catch (error) {
      const callback = args.at(-1);
      if (typeof callback === "function") return queueMicrotask(() => callback(error));
      return Promise.reject(error);
    }
    return pool[method](...args);
  }

  const facade = {
    query: (...args) => dispatch("query", args),
    connect: (...args) => dispatch("connect", args),
    end: retire,
    _ending: false,
    _ended: false,
  };

  return new Proxy(facade, {
    get(target, property) {
      if (property in target) return target[property];
      const pool = getPool();
      const value = pool[property];
      return typeof value === "function" ? value.bind(pool) : value;
    },
  });
}

async function closePostgresPools() {
  shuttingDown = true;
  await Promise.all([...closers].map((close) => close()));
}

module.exports = { createManagedPool, closePostgresPools, usesPostgresTunnel };
