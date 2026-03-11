import oracledb from "oracledb";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
  initOracleClient: initSharedOracleClient,
  isOracleEnabled,
} = require("../../../../config/oracleClient.js");

let globalConfigApplied = false;

function getPositiveInteger(value, fallbackValue) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackValue;
}

function applyGlobalOracleConfig() {
  if (globalConfigApplied) {
    return;
  }

  globalConfigApplied = true;

  try {
    oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
    oracledb.fetchArraySize = getPositiveInteger(
      process.env.STORE_ORACLE_FETCH_ARRAY_SIZE || process.env.ORACLE_FETCH_ARRAY_SIZE,
      1000
    );
    oracledb.prefetchRows = getPositiveInteger(
      process.env.STORE_ORACLE_PREFETCH_ROWS || process.env.ORACLE_PREFETCH_ROWS,
      1000
    );

    console.log(
      `Store Oracle global config applied (OUT_FORMAT_OBJECT, fetchArraySize=${oracledb.fetchArraySize}, prefetchRows=${oracledb.prefetchRows})`
    );
  } catch (error) {
    console.warn("Failed to apply Store Oracle global config:", error.message);
  }
}

applyGlobalOracleConfig();

export function initOracleClient() {
  applyGlobalOracleConfig();
  initSharedOracleClient();
  return isOracleEnabled();
}

export function isStoreOracleEnabled() {
  return isOracleEnabled();
}

export default oracledb;
