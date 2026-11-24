const http = require("http");
const path = require("path");
const { Server: SocketIOServer } = require("socket.io");

require("dotenv").config({ path: path.join(__dirname, ".env"), quiet: true });

const o2dOracle = require("./src/o2d/config/db");
const { connectDatabase, connectAuthDatabase } = require("./config/database");
const { closePostgresPools } = require("./config/postgresPool");
const { initSSHTunnel, closeSSHTunnel, onTunnelStateChange } = require("./config/sshTunnel");
const redisClient = require("./config/redis");
const app = require("./src/app");

const iotEnabled = process.env.ENABLE_IOT_MODULE !== "false" &&
  process.env.ENABLE_IOT_MQTT_DASHBOARD === "true";
const iot = iotEnabled ? require("./src/iot") : null;
const port = Number(process.env.PORT || 3004);
const DEPLOY_MODE = process.env.DEPLOY_MODE === "true";

let stopping = false;
let deviceSyncTimer;
let deviceSyncRun;
let checklistSyncModulesPromise;
async function loadChecklistSyncModules() {
  checklistSyncModulesPromise ??= import("./src/checklist-maintenance-housekeeping/services/deviceSync.js");
  return checklistSyncModulesPromise;
}

let storeOracleModule;
const loadStoreOracle = () => {
  storeOracleModule ??= import("./src/store/src/config/db.js");
  return storeOracleModule;
};

const pendingBootstrap = new Map([
  ["Main PostgreSQL", connectDatabase],
  ["Auth PostgreSQL", connectAuthDatabase],
  ["Store PostgreSQL", async () => {
    const { initStorePostgresSchema } = await import("./src/store/src/config/postgresSchema.js");
    await initStorePostgresSchema();
  }],
]);
let bootstrapRunning = false;
let bootstrapTimer;

async function bootstrapDatabases() {
  if (stopping || bootstrapRunning || !pendingBootstrap.size) return;
  clearTimeout(bootstrapTimer);
  bootstrapRunning = true;
  try {
    for (const [name, initialize] of pendingBootstrap) {
      if (stopping) return;
      try {
        await initialize();
        pendingBootstrap.delete(name);
      } catch (error) {
        console.warn("[Database] Initialization will retry", name, error.code || error.name);
      }
    }
  } finally {
    bootstrapRunning = false;
    if (!stopping && pendingBootstrap.size) {
      bootstrapTimer = setTimeout(bootstrapDatabases, 30000);
      bootstrapTimer.unref();
    }
  }
}

function warmOracle() {
  if (stopping || process.env.ENABLE_ORACLE === "false") return;
  const warmups = [o2dOracle.initPool(), loadStoreOracle().then((module) => module.initPool())];
  for (const warmup of warmups) {
    void warmup.catch((error) => console.warn("[Oracle] Pool warmup failed:", error.code || error.name));
  }
}

const DEVICE_SYNC_INTERVAL_MS = Number(
  process.env.DEVICE_SYNC_INTERVAL_MS || 5 * 60 * 1000
);

const DEVICE_SYNC_ENABLED =
  process.env.DEVICE_SYNC_ENABLED !== "false" && !DEPLOY_MODE;

let isSyncRunning = false;

if (DEVICE_SYNC_ENABLED) {
  const runDeviceSync = async () => {
    // Force IST time
    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
    );

    const hour = now.getHours();
    const minute = now.getMinutes();

    // Run only within the first 8 minutes of the target hour.
    const isMorningRun = hour === 11;
    const isNightRun = hour === 23;

    if (minute >= 8 || (!isMorningRun && !isNightRun)) return;

    if (isSyncRunning) return;
    isSyncRunning = true;

    try {
      const { refreshDeviceSync } = await loadChecklistSyncModules();

      const todayDay = String(now.getDate()).padStart(2, '0');
      const todayMonth = String(now.getMonth() + 1).padStart(2, '0');
      const todayYear = now.getFullYear();
      const todayStr = `${todayYear}-${todayMonth}-${todayDay}`;

      if (isNightRun) {
        console.log(`⏱ Night (11 PM) Device Sync triggered for ${todayStr}`);
        const syncResult = await refreshDeviceSync(todayStr, 23);
        console.log(`✅ Night Device Sync completed for ${todayStr}:`, syncResult);
        return;
      }

      // Calculate IST Yesterday string (YYYY-MM-DD)
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const day = String(yesterday.getDate()).padStart(2, '0');
      const month = String(yesterday.getMonth() + 1).padStart(2, '0');
      const year = yesterday.getFullYear();
      const yesterdayStr = `${year}-${month}-${day}`;

      console.log(`⏱ Morning (11 AM) Device Sync triggered for ${yesterdayStr}`);
      const syncResult = await refreshDeviceSync(todayStr, 11);
      console.log(`✅ Morning Device Sync completed for ${yesterdayStr}:`, syncResult);
    } catch (err) {
      console.error("❌ DEVICE SYNC ERROR:", err);
    } finally {
      isSyncRunning = false;
    }


  };


  const tick = () => { if (!isSyncRunning) deviceSyncRun = runDeviceSync(); };
  tick();
  deviceSyncTimer = setInterval(tick, DEVICE_SYNC_INTERVAL_MS);
} else {
  console.log("⏸️ Device sync disabled (DEPLOY MODE)");
}


const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: iot?.getSocketCorsOptions() ?? { origin: true, methods: ["GET", "POST"] },
});

httpServer.on("error", (error) => {
  console.error("[HTTP] Server error:", error.code || error.name);
  process.exit(1);
});

httpServer.listen(port, () => {
  console.info("[HTTP] Listening on port", port);
  if (process.send) process.send("ready");
  if (process.env.ENABLE_ORACLE !== "false") {
    void loadStoreOracle().catch(() => console.warn("[Oracle] Store pool module could not be loaded"));
  }

  if (process.env.SSH_HOST) {
    onTunnelStateChange(({ type }) => {
      if (type === "connected") {
        warmOracle();
        void bootstrapDatabases();
      }
    });
    void initSSHTunnel().catch(() => {
      warmOracle();
    });
  } else {
    warmOracle();
  }
  void bootstrapDatabases();
  void iot?.initializeIotModule(io).catch((error) => {
    console.warn("[IoT] Initialization failed:", error.code || error.name);
  });
});

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  clearInterval(deviceSyncTimer);
  clearTimeout(bootstrapTimer);
  console.info("[HTTP] Shutting down", signal);

  const hardDeadline = setTimeout(() => {
    console.error("[HTTP] Shutdown deadline exceeded");
    process.exit(1);
  }, 28000);

  let drainTimer;
  const httpDrained = io.close().catch(() => {});
  await Promise.race([
    Promise.allSettled([httpDrained, deviceSyncRun]),
    new Promise((resolve) => { drainTimer = setTimeout(resolve, 15000); }),
  ]);
  clearTimeout(drainTimer);
  httpServer.closeAllConnections();

  const close = [
    o2dOracle.closePool,
    () => storeOracleModule?.then((module) => module.closePool()),
    closePostgresPools,
    redisClient.quit,
    () => iot?.shutdownIotModule(),
    closeSSHTunnel,
  ];
  const cleanup = await Promise.allSettled(close.map(async (closeResource) => closeResource()));
  clearTimeout(hardDeadline);

  const failed = cleanup.some((result) => result.status === "rejected");
  if (failed) console.error("[HTTP] One or more shutdown operations failed");
  process.exit(failed ? 1 : 0);
}

process.on("SIGTERM", () => { void shutdown("SIGTERM"); });
process.on("SIGINT", () => { void shutdown("SIGINT"); });
