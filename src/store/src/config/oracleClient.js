// Oracle client configuration
import oracledb from "oracledb";
import os from "os";

try {
  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
  oracledb.fetchArraySize = 1000;
  oracledb.prefetchRows = 1000;
  console.log("⚙️ Oracle global config applied (OUT_FORMAT_OBJECT, fetchArraySize=1000, prefetchRows=1000)");
} catch (e) {
  console.warn("⚠️ Failed to set global Oracle config:", e.message);
}

/**
 * Oracle Client Initializer (Thick mode)
 */
export function initOracleClient() {
  try {
    const isWindows = os.platform() === "win32";

    const winLibDir =
      process.env.ORACLE_WIN_CLIENT_LIB_DIR || "C:\\oracle\\instantclient_23_9";
    const linuxLibDir =
      process.env.ORACLE_LINUX_CLIENT_LIB_DIR || "/home/ubuntu/oracle_client/instantclient_23_26";

    if (isWindows) {
      oracledb.initOracleClient({ libDir: winLibDir });
      console.log(`🪟 Oracle client initialized (Thick mode on Windows, libDir = ${winLibDir})`);
    } else {
      oracledb.initOracleClient({ libDir: linuxLibDir });
      console.log(`🐧 Oracle client initialized (Thick mode on Linux, libDir = ${linuxLibDir})`);
    }
  } catch (err) {
    if (err.message && err.message.includes("DPI-1047")) {
      console.error("❌ Oracle client init failed (DPI-1047: libDir path ya library missing hai):", err.message);
    } else if (err.message && err.message.includes("ORA-")) {
      console.error("❌ Oracle client init failed (Oracle error):", err.message);
    } else {
      console.error("❌ Failed to initialize Oracle client:", err);
    }
    process.exit(1);
  }
}

export default oracledb;











