// src/o2d/config/db.js
const oracledb = require("oracledb");
const { initOracleClient } = require("../../../config/oracleClient.js");
const { initSSHTunnel, closeSSHTunnel } = require("../../../config/sshTunnel.js"); // keep if your sshTunnel.js is here

let pool;
let poolInitializing = false;
let poolInitError = null;
let sshTunnelActive = false;

const LOCAL_ORACLE_PORT = parseInt(process.env.LOCAL_ORACLE_PORT || "1521", 10);
const ORACLE_SERVICE = process.env.ORACLE_SERVICE_NAME || "ora11g"; // ✅ configurable

function validateEnv() {
  const missing = [];
  if (!process.env.ORACLE_USER) missing.push("ORACLE_USER");
  if (!process.env.ORACLE_PASSWORD) missing.push("ORACLE_PASSWORD");

  const usingSSHTunnel = process.env.SSH_HOST && process.env.SSH_USER;
  const usingDirectConnection = !!process.env.ORACLE_CONNECTION_STRING;

  if (usingSSHTunnel) {
    const hasAuth = process.env.SSH_PASSWORD || process.env.SSH_KEY_PATH || process.env.SSH_PRIVATE_KEY;
    if (!hasAuth) missing.push("SSH_PASSWORD (or SSH_KEY_PATH or SSH_PRIVATE_KEY)");
  } else if (!usingDirectConnection) {
    missing.push("ORACLE_CONNECTION_STRING (or SSH_HOST/SSH_USER...)");
  }

  if (missing.length) {
    throw new Error(`Missing env: ${missing.join(", ")}`);
  }
}

async function initPool() {
  if (poolInitializing) {
    while (poolInitializing) await new Promise((r) => setTimeout(r, 100));
    if (poolInitError) throw poolInitError;
    return;
  }

  poolInitializing = true;
  poolInitError = null;

  try {
    validateEnv();

    const usingSSHTunnel = process.env.SSH_HOST && process.env.SSH_USER;
    const usingDirectConnection = !!process.env.ORACLE_CONNECTION_STRING;

    if (usingSSHTunnel) {
      try {
        console.log("🔐 Initializing SSH tunnel for Oracle...");
        await initSSHTunnel();
        sshTunnelActive = true;
        await new Promise((r) => setTimeout(r, 2000));
        console.log("✅ SSH tunnel ready for Oracle");
      } catch (e) {
        console.warn("⚠️ SSH tunnel failed:", e.message);
      }
    }

    // ✅ MUST happen before createPool
    initOracleClient();

    let connectString;
    if (usingSSHTunnel && sshTunnelActive) {
      connectString = `127.0.0.1:${LOCAL_ORACLE_PORT}/${ORACLE_SERVICE}`;
      console.log("🔗 Using SSH tunnel:", connectString);
    } else if (usingDirectConnection) {
      connectString = process.env.ORACLE_CONNECTION_STRING;
      console.log("🔗 Using direct Oracle connection");
    } else {
      throw new Error("No valid Oracle connection method configured");
    }

    pool = await oracledb.createPool({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASSWORD,
      connectString,
      poolMin: 1,
      poolMax: 4,
      poolIncrement: 1,
      poolTimeout: 60,
      queueTimeout: 30000,
    });

    console.log("✅ Oracle pool created");

    // quick test
    const c = await pool.getConnection();
    await c.execute("SELECT 1 FROM DUAL");
    await c.close();
    console.log("✅ Oracle test query OK");

    poolInitializing = false;
  } catch (err) {
    poolInitializing = false;
    poolInitError = err;

    // specific advice for NJS-138
    if (err.message && err.message.includes("NJS-138")) {
      console.error("\n❌ CRITICAL ORACLE ERROR: NJS-138");
      console.error("👉 The target Oracle Database is too old to be supported by node-oracledb in Thin mode.");
      console.error("👉 You MUST use 'Thick mode' by installing Oracle Instant Client libraries.");
      console.error("👉 Please run the provided script on your server: sudo ./install-oracle-client.sh\n");
    }

    await cleanup();
    throw err;
  }
}

async function cleanup() {
  if (pool) {
    try {
      await pool.close(0);
    } catch { }
    pool = null;
  }
  if (sshTunnelActive) {
    try {
      await closeSSHTunnel();
    } catch { }
    sshTunnelActive = false;
  }
}

async function getConnection() {
  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (!pool) await initPool();
      const connection = await pool.getConnection();

      // Test the connection is actually working
      try {
        await connection.execute("SELECT 1 FROM DUAL");
        return connection;
      } catch (testErr) {
        await connection.close().catch(() => { });
        throw testErr;
      }
    } catch (err) {
      lastError = err;
      const isConnectionError =
        err.message?.includes('ORA-12537') || // TNS:connection closed
        err.message?.includes('ORA-12541') || // Cannot connect
        err.message?.includes('NJS-500') ||   // connection closed or broken
        err.message?.includes('ECONNRESET');

      if (isConnectionError && attempt < maxRetries) {
        console.warn(`⚠️ Oracle connection attempt ${attempt}/${maxRetries} failed: ${err.message}`);
        console.log(`🔄 Retrying in ${attempt}s...`);

        // Reset pool on connection errors
        if (pool) {
          try {
            await pool.close(0);
          } catch { }
          pool = null;
          poolInitializing = false;
          poolInitError = null;
        }

        await new Promise(resolve => setTimeout(resolve, attempt * 1000));
      } else {
        throw err;
      }
    }
  }

  throw lastError;
}

async function closePool() {
  await cleanup();
}

module.exports = { initPool, getConnection, closePool };
