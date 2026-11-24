const { getTunnelSession, onTunnelStateChange } = require("./sshTunnel");

function createOraclePool(oracledb, name, prefix, enableClient) {
  const read = (key) => process.env[prefix + "_ORACLE_" + key]?.trim() ||
    process.env["ORACLE_" + key]?.trim();
  const number = (key, fallback, minimum = 1) => {
    const value = Number(read(key) ?? fallback);
    return Number.isSafeInteger(value) && value >= minimum ? value : fallback;
  };
  const useTunnel = Boolean(process.env.SSH_HOST?.trim() && process.env.SSH_USER?.trim());
  const direct = read("CONNECTION_STRING");
  const serviceName = read("SERVICE_NAME") || "ora11g";
  const connectTimeout = number("CONNECT_TIMEOUT", 10);
  const callTimeout = number("CALL_TIMEOUT_MS", 30000);
  const queueTimeout = number("QUEUE_TIMEOUT", 30000);
  const draining = new Set();
  const initializations = new Map();
  let current;
  let stopped = false;
  let generation = 0;
  let retryAfter = 0;

  function dispose(pool, drainSeconds) {
    const ending = pool.close(drainSeconds).catch((error) => {
      console.warn("[Oracle] Pool close failed", name, error.code || "ORACLE_ERROR");
    }).finally(() => draining.delete(ending));
    draining.add(ending);
    return ending;
  }

  function invalidate(drainSeconds) {
    generation += 1;
    retryAfter = 0;
    const pool = current;
    current = undefined;
    if (pool) void dispose(pool, drainSeconds);
  }

  if (useTunnel) {
    onTunnelStateChange(({ type }) => invalidate(type === "connected" ? 10 : 0));
  }

  function connectString(session) {
    if (session) {
      if (!/^[\w.$#-]+$/.test(serviceName)) throw new Error("Invalid Oracle service name");
      const timeout = "(CONNECT_TIMEOUT=" + connectTimeout + ")(TRANSPORT_CONNECT_TIMEOUT=" + connectTimeout + ")";
      const address = "(ADDRESS=(PROTOCOL=TCP)(HOST=127.0.0.1)(PORT=" + session.oracle.port + "))";
      return "(DESCRIPTION=" + timeout + address + "(CONNECT_DATA=(SERVICE_NAME=" + serviceName + ")))";
    }
    // Retain the configured non-loopback Oracle fallback during an SSH outage.
    if (!direct || (useTunnel && /127\.0\.0\.1|localhost/i.test(direct))) {
      throw new Error(useTunnel ? "Oracle SSH tunnel unavailable" : "Oracle connection string is missing");
    }
    if (/^\(DESCRIPTION\s*=/i.test(direct) && !/\(\s*CONNECT_TIMEOUT\s*=/i.test(direct)) {
      return direct.replace(/^(\(DESCRIPTION\s*=)/i, "$1(CONNECT_TIMEOUT=" + connectTimeout + ")");
    }
    if (/^(?:(?:tcps?:)?\/\/)?[\w.:[\],-]+\//i.test(direct) && !/[?&]connect_timeout=/i.test(direct)) {
      return direct + (direct.includes("?") ? "&" : "?") + "connect_timeout=" + connectTimeout;
    }
    return direct;
  }

  function deadline(work, ms, onTimeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        onTimeout();
        reject(new Error("Oracle connection operation timed out"));
      }, ms);
      work.then(resolve, reject).finally(() => clearTimeout(timer));
    });
  }

  async function checkout(pool) {
    let timedOut = false;
    const request = pool.getConnection().then(async (connection) => {
      if (timedOut) {
        await connection.close({ drop: true }).catch(() => {});
        return;
      }
      try {
        connection.callTimeout = callTimeout;
      } catch (error) {
        await connection.close({ drop: true }).catch(() => {});
        throw error;
      }
      return connection;
    });
    return deadline(request, queueTimeout + connectTimeout * 1000, () => { timedOut = true; });
  }

  async function createPool(attempt, session) {
    if (!enableClient()) throw new Error("Oracle Thick client unavailable or disabled");
    const address = connectString(session);
    const user = read("USER");
    const password = read("PASSWORD");
    if (!user || !password) throw new Error("Oracle credentials are not configured");
    const pool = await oracledb.createPool({
      user,
      password,
      connectString: address,
      poolMin: number("POOL_MIN", 1, 0),
      poolMax: number("POOL_MAX", 10),
      poolIncrement: number("POOL_INCREMENT", 1),
      poolTimeout: number("POOL_TIMEOUT", 60),
      poolPingInterval: 0,
      poolPingTimeout: Math.min(callTimeout, 5000),
      queueTimeout,
      queueMax: number("QUEUE_MAX", 100),
      stmtCacheSize: number("STMT_CACHE_SIZE", 50),
    });

    try {
      if (generation !== attempt.generation || attempt.expired) {
        throw new Error("Oracle pool configuration changed");
      }
      const connection = await checkout(pool);
      try {
        await connection.execute("SELECT 1 FROM DUAL");
      } finally {
        await connection.close();
      }
      if (generation !== attempt.generation || attempt.expired) {
        throw new Error("Oracle pool configuration changed");
      }
      current = pool;
      return pool;
    } catch (error) {
      await dispose(pool, 0);
      throw error;
    }
  }

  function initPool() {
    if (stopped) return Promise.reject(new Error("Oracle is shutting down"));
    if (current) return Promise.resolve(current);
    const session = useTunnel ? getTunnelSession() : null;
    // A hung direct fallback may finish later. It must never block or
    // publish over the replacement pool on a new tunnel.
    const existing = initializations.get(session);
    if (existing) return existing.promise;
    if (Date.now() < retryAfter) return Promise.reject(new Error("Oracle pool temporarily unavailable"));
    const attempt = { generation, expired: false };
    attempt.work = createPool(attempt, session).catch((error) => {
      if (generation === attempt.generation) retryAfter = Date.now() + 1000;
      throw error;
    }).finally(() => initializations.delete(session));
    const startupTimeout = connectTimeout * 2000 + queueTimeout + callTimeout * 2;
    attempt.promise = deadline(attempt.work, startupTimeout, () => { attempt.expired = true; });
    initializations.set(session, attempt);
    return attempt.promise;
  }

  async function getConnection() {
    const pool = await initPool();
    const connection = await checkout(pool);
    if (pool !== current) {
      await connection.close({ drop: true }).catch(() => {});
      throw new Error("Oracle pool changed during checkout");
    }
    return connection;
  }

  async function closePool() {
    stopped = true;
    invalidate(0);
    await Promise.allSettled([...initializations.values()].map((attempt) => attempt.work));
    await Promise.all(draining);
  }

  return { initPool, getConnection, closePool };
}

module.exports = { createOraclePool };
