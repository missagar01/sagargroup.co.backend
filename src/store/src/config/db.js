import { createRequire } from "module";
import oracledb, { initOracleClient } from "./oracleClient.js";

const require = createRequire(import.meta.url);
const { createOraclePool } = require("../../../../config/oraclePool.js");

export const { initPool, getConnection, closePool } = createOraclePool(
  oracledb,
  "Store",
  "STORE",
  initOracleClient
);