const oracledb = require("oracledb");
const { initOracleClient, isOracleEnabled } = require("../../../config/oracleClient");
const { createOraclePool } = require("../../../config/oraclePool");

module.exports = createOraclePool(oracledb, "O2D", "O2D", () => {
  initOracleClient();
  return isOracleEnabled();
});