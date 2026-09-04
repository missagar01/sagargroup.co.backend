const oracledb = require("oracledb");
const {
  initOracleClient,
  isOracleEnabled,
} = require("../../../config/oracleClient.js");
const {
  initSSHTunnel,
  getLocalOraclePort,
  isTunnelActive,
  onTunnelStateChange,
} = require("../../../config/sshTunnel.js");

let pool = null;
let poolPromise = null;
let tunnelListenerAttached = false;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function getPositiveInteger(value, fallbackValue) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackValue;
}

function getOracleRuntimeConfig() {
  const usingSshTunnel = Boolean(readEnv("SSH_HOST") && readEnv("SSH_USER"));

  return {
    user: readEnv("ORACLE_USER"),
    password: readEnv("ORACLE_PASSWORD"),
    directConnectString: readEnv("ORACLE_CONNECTION_STRING"),
    serviceName: readEnv("ORACLE_SERVICE_NAME") || "ora11g",
    localPort:
      typeof getLocalOraclePort === "function"
        ? getLocalOraclePort()
        : getPositiveInteger(readEnv("LOCAL_ORACLE_PORT"), 1521),
    usingSshTunnel,
    hasSshAuth: Boolean(
      readEnv("SSH_PASSWORD") ||
        readEnv("SSH_KEY_PATH") ||
        readEnv("SSH_PRIVATE_KEY")
    ),
    poolMin: getPositiveInteger(
      readEnv("O2D_ORACLE_POOL_MIN", "ORACLE_POOL_MIN"),
      1
    ),
    poolMax: getPositiveInteger(
      readEnv("O2D_ORACLE_POOL_MAX", "ORACLE_POOL_MAX"),
      10
    ),
    poolIncrement: getPositiveInteger(
      readEnv("O2D_ORACLE_POOL_INCREMENT", "ORACLE_POOL_INCREMENT"),
      1
    ),
    poolTimeout: getPositiveInteger(
      readEnv("O2D_ORACLE_POOL_TIMEOUT", "ORACLE_POOL_TIMEOUT"),
      60
    ),
    connectTimeout: getPositiveInteger(
      readEnv("O2D_ORACLE_CONNECT_TIMEOUT", "ORACLE_CONNECT_TIMEOUT"),
      10
    ),
    queueTimeout: getPositiveInteger(
      readEnv("O2D_ORACLE_QUEUE_TIMEOUT", "ORACLE_QUEUE_TIMEOUT"),
      30000
    ),
    queueMax: getPositiveInteger(
      readEnv("O2D_ORACLE_QUEUE_MAX", "ORACLE_QUEUE_MAX"),
      100
    ),
    stmtCacheSize: getPositiveInteger(
      readEnv("O2D_ORACLE_STMT_CACHE_SIZE", "ORACLE_STMT_CACHE_SIZE"),
      50
    ),
    initProbeDelayMs: getPositiveInteger(
      readEnv("O2D_ORACLE_TUNNEL_STABILIZE_MS"),
      2000
    ),
    connectRetries: getPositiveInteger(
      readEnv("O2D_ORACLE_CONNECT_RETRIES"),
      3
    ),
  };
}

function describePool(activePool) {
  if (!activePool) {
    return "pool=unavailable";
  }

  const parts = [];
  if (typeof activePool.connectionsOpen === "number") {
    parts.push(`open=${activePool.connectionsOpen}`);
  }
  if (typeof activePool.connectionsInUse === "number") {
    parts.push(`inUse=${activePool.connectionsInUse}`);
  }
  if (typeof activePool.poolMax === "number") {
    parts.push(`max=${activePool.poolMax}`);
  }

  return parts.join(", ") || "pool=available";
}

async function closePoolInternal() {
  if (!pool) {
    return;
  }

  const activePool = pool;
  pool = null;

  try {
    await activePool.close(0);
    console.log("[O2D Oracle] Pool closed");
  } catch (error) {
    console.warn(
      "[O2D Oracle] Failed to close pool cleanly:",
      error.message || error
    );
  }
}

function resetPoolStateForTunnelDisconnect(reason) {
  poolPromise = null;

  void closePoolInternal().catch((error) => {
    console.warn(
      `[O2D Oracle] Failed to reset pool after ${reason}:`,
      error.message || error
    );
  });
}

async function recyclePool(reason, error) {
  poolPromise = null;

  if (error) {
    console.warn(
      `[O2D Oracle] Recycling pool after ${reason}: ${error.message || error}`
    );
  } else {
    console.warn(`[O2D Oracle] Recycling pool after ${reason}`);
  }

  await closePoolInternal();
}

function attachTunnelListeners() {
  if (tunnelListenerAttached || typeof onTunnelStateChange !== "function") {
    return;
  }

  tunnelListenerAttached = true;
  onTunnelStateChange((event) => {
    if (event?.type !== "disconnected") {
      return;
    }

    const reason = event.reason ? `: ${event.reason}` : "";
    console.warn(`[O2D Oracle] SSH tunnel disconnected${reason}. Clearing pool.`);
    resetPoolStateForTunnelDisconnect("SSH tunnel disconnect");
  });
}

function validateEnv(config) {
  const missing = [];

  if (!config.user) missing.push("ORACLE_USER");
  if (!config.password) missing.push("ORACLE_PASSWORD");

  if (config.usingSshTunnel) {
    if (!config.hasSshAuth) {
      missing.push("SSH_PASSWORD (or SSH_KEY_PATH or SSH_PRIVATE_KEY)");
    }
  } else if (!config.directConnectString) {
    missing.push("ORACLE_CONNECTION_STRING (or SSH_HOST/SSH_USER tunnel settings)");
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing O2D Oracle environment variables: ${missing.join(", ")}`
    );
  }
}

async function resolveConnectString(config) {
  if (config.usingSshTunnel) {
    try {
      if (typeof isTunnelActive !== "function" || !isTunnelActive()) {
        console.log("[O2D Oracle] Initializing shared SSH tunnel");
        await initSSHTunnel();
      } else {
        console.log("[O2D Oracle] Reusing active shared SSH tunnel");
      }

      await delay(config.initProbeDelayMs);

      const activeLocalPort =
        typeof getLocalOraclePort === "function"
          ? getLocalOraclePort()
          : config.localPort;
      const connectString = `127.0.0.1:${activeLocalPort || config.localPort}/${config.serviceName}`;
      console.log(`[O2D Oracle] Using SSH tunnel on ${connectString}`);
      return connectString;
    } catch (error) {
      console.warn(
        "[O2D Oracle] SSH tunnel initialization failed:",
        error.message || error
      );

      const isDirectLocal =
        config.directConnectString &&
        /127\.0\.0\.1|localhost/i.test(config.directConnectString);

      if (!config.directConnectString || isDirectLocal) {
        throw error;
      }

      console.warn("[O2D Oracle] Falling back to direct Oracle connection");
    }
  }

  if (config.directConnectString) {
    console.log("[O2D Oracle] Using direct Oracle connection");
    return config.directConnectString;
  }

  throw new Error("No valid Oracle connection method configured");
}

function isTransientOracleError(error) {
  const message = String(error?.message || error || "");

  return (
    message.includes("ORA-12537") ||
    message.includes("ORA-12541") ||
    message.includes("ORA-12170") ||
    message.includes("ORA-03113") ||
    message.includes("ORA-03114") ||
    message.includes("NJS-500") ||
    message.includes("NJS-040") ||
    message.includes("ECONNRESET") ||
    message.includes("socket hang up")
  );
}

attachTunnelListeners();

async function initPool() {
  if (pool) {
    return pool;
  }

  if (poolPromise) {
    return poolPromise;
  }

  const config = getOracleRuntimeConfig();
  validateEnv(config);

  poolPromise = (async () => {
    initOracleClient();
    if (!isOracleEnabled()) {
      throw new Error(
        "Oracle Thick client is unavailable or disabled. Check Oracle Instant Client and ENABLE_ORACLE."
      );
    }

    const connectString = await resolveConnectString(config);
    const createdPool = await oracledb.createPool({
      user: config.user,
      password: config.password,
      connectString,
      poolMin: config.poolMin,
      poolMax: config.poolMax,
      poolIncrement: config.poolIncrement,
      poolTimeout: config.poolTimeout,
      connectTimeout: config.connectTimeout,
      queueTimeout: config.queueTimeout,
      queueMax: config.queueMax,
      stmtCacheSize: config.stmtCacheSize,
    });

    let probeConnection;
    try {
      probeConnection = await createdPool.getConnection();
      await probeConnection.execute("SELECT 1 FROM DUAL");
    } finally {
      if (probeConnection) {
        await probeConnection.close().catch(() => {});
      }
    }

    pool = createdPool;
    console.log(`[O2D Oracle] Pool started (${describePool(createdPool)})`);
    return createdPool;
  })();

  try {
    return await poolPromise;
  } catch (error) {
    poolPromise = null;
    await closePoolInternal();

    if (String(error?.message || "").includes("NJS-138")) {
      console.error("\n[O2D Oracle] CRITICAL ORACLE ERROR: NJS-138");
      console.error(
        "[O2D Oracle] The target Oracle Database is too old for Thin mode."
      );
      console.error(
        "[O2D Oracle] Install Oracle Instant Client and run in Thick mode.\n"
      );
    }

    console.error(
      "[O2D Oracle] Pool initialization failed:",
      error.message || error
    );
    throw error;
  }
}

async function getConnection() {
  const config = getOracleRuntimeConfig();
  let lastError = null;

  for (let attempt = 1; attempt <= config.connectRetries; attempt += 1) {
    let connection = null;
    let activePool = null;

    try {
      if (
        config.usingSshTunnel &&
        typeof isTunnelActive === "function" &&
        !isTunnelActive()
      ) {
        await recyclePool("inactive SSH tunnel before checkout");
      }

      activePool = await initPool();
      if (!activePool) {
        throw new Error(
          "Oracle pool is not initialized. Check Oracle Instant Client, SSH tunnel, and Oracle environment variables on this server."
        );
      }

      connection = await activePool.getConnection();
      await connection.execute("SELECT 1 FROM DUAL");
      return connection;
    } catch (error) {
      lastError = error;

      if (connection) {
        try {
          await connection.close();
        } catch {
          // Ignore close errors on already broken connections
        }
      }

      const retryable = isTransientOracleError(error);
      if (retryable) {
        console.warn(
          `[O2D Oracle] Connection attempt ${attempt}/${config.connectRetries} failed: ${error.message || error} (${describePool(activePool || pool)})`
        );
      }

      if (!retryable || attempt === config.connectRetries) {
        if (retryable) {
          await recyclePool("final connection failure", error);
        }
        throw error;
      }

      await recyclePool(`connection attempt ${attempt} failure`, error);
      await delay(attempt * 500);
    }
  }

  throw lastError;
}

async function closePool() {
  poolPromise = null;
  await closePoolInternal();
}

module.exports = { initPool, getConnection, closePool };
