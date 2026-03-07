// Unified database config - Oracle DB
import dotenv from "dotenv";
import oracledb from "./oracleClient.js";
import { initOracleClient } from "./oracleClient.js";

dotenv.config();

let pool = null;
let poolPromise = null;

export async function initPool() {
  if (pool) return pool;
  if (poolPromise) return poolPromise;

  if (!process.env.ORACLE_USER || !process.env.ORACLE_PASSWORD || !process.env.ORACLE_CONNECTION_STRING) {
    console.warn("⚠️ ORACLE env vars missing (ORACLE_USER / ORACLE_PASSWORD / ORACLE_CONNECTION_STRING)");
    return null;
  }

  initOracleClient();

  poolPromise = (async () => {
    try {
      const createdPool = await oracledb.createPool({
        user: process.env.ORACLE_USER,
        password: process.env.ORACLE_PASSWORD,
        connectString: process.env.ORACLE_CONNECTION_STRING,
        poolMin: 2,
        poolMax: 20,
        poolIncrement: 2,
        poolTimeout: 60,
        connectTimeout: 10,
        queueTimeout: 60000,
        queueMax: 100,
        stmtCacheSize: 50,
      });

      pool = createdPool;
      console.log("✅ Oracle pool started");
      return pool;
    } catch (err) {
      poolPromise = null;
      console.error("❌ Failed to create Oracle pool:", err);
      throw err;
    }
  })();

  return poolPromise;
}

export async function getConnection() {
  if (!pool) {
    await initPool();
  }
  if (!pool) {
    throw new Error("Oracle pool is not initialized. Check ORACLE_USER, ORACLE_PASSWORD, and ORACLE_CONNECTION_STRING.");
  }

  const start = Date.now();
  const conn = await pool.getConnection();
  const elapsed = Date.now() - start;

  if (elapsed > 100) {
    console.warn(`⏱️ getConnection took ${elapsed} ms`);
  }

  return conn;
}










