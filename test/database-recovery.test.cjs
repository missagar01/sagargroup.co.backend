const assert = require("node:assert/strict");
const { generateKeyPairSync } = require("node:crypto");
const { once } = require("node:events");
const { fork } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");
const { Server } = require("ssh2");

// The harness uses disposable loopback databases only and ignores repository .env files.
require("dotenv").config = () => ({ parsed: {} });
if (process.argv[2] === "--http-child") {
  process.on("message", (message) => {
    if (message === "test-shutdown") {
      process.disconnect();
      process.emit("SIGTERM");
    }
  });
  require("../server.js");
  return;
}

const pgPort = Number(process.env.STABILITY_PG_PORT);
const oraclePort = Number(process.env.STABILITY_ORACLE_PORT);
const redisPort = Number(process.env.STABILITY_REDIS_PORT);
const testOracleTimeout = process.argv.includes("--oracle-timeout-only");
if (!Number.isInteger(pgPort) || pgPort <= 1024 || pgPort > 65535) {
  throw new Error("Set STABILITY_PG_PORT to a disposable loopback PostgreSQL port");
}
if (process.argv.includes("--require-oracle") && !oraclePort) {
  throw new Error("Set STABILITY_ORACLE_PORT to a disposable loopback Oracle listener");
}

async function listen(server, port = 0) {
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

async function freePort() {
  const server = net.createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function eventually(check, ms = 10000) {
  const end = Date.now() + ms;
  let lastError;
  do {
    try {
      await check();
      return;
    } catch (error) {
      lastError = error;
      await delay(100);
    }
  } while (Date.now() < end);
  throw lastError;
}

async function selectPostgres(pools) {
  await Promise.all(pools.map(async (pool) => {
    const { rows } = await pool.query("SELECT 1 AS ok");
    assert.equal(rows[0].ok, 1);
  }));
}

async function selectOracle(pools) {
  await Promise.all(pools.map(async (pool) => {
    const client = await pool.getConnection();
    try {
      const result = await client.execute("SELECT 1 AS OK FROM DUAL", [], { outFormat: 4001 });
      assert.equal(result.rows[0][0], 1);
    } finally {
      await client.close();
    }
  }));
}

async function checkHttp(env) {
  const port = await freePort();
  const closedSshPort = await freePort();
  const child = fork(__filename, ["--http-child"], {
    cwd: path.resolve(__dirname, ".."),
    env: {
      ...env,
      PORT: String(port),
      SSH_PORT: String(closedSshPort),
      ENABLE_ORACLE: "false",
      DEPLOY_MODE: "true",
      ENABLE_IOT_MODULE: "false",
      ENABLE_IOT_MQTT_DASHBOARD: "false",
    },
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });
  const exited = once(child, "exit");
  try {
    await eventually(async () => {
      const response = await fetch("http://127.0.0.1:" + port + "/health");
      const health = await response.json();
      assert.equal(response.status, 200);
      assert.equal(health.status, "ok");
      assert.equal(health.pid, child.pid);
      assert.equal(health.deployMode, true);
    });
    child.send("test-shutdown");
    assert.deepEqual(await exited, [0, null]);
    console.log("PASS /health stays available with SSH down, and shutdown exits cleanly");
  } finally {
    if (child.exitCode === null) child.kill();
  }
}

async function main() {
  const stalledHandshake = new Set();
  const stalledServer = net.createServer((socket) => {
    stalledHandshake.add(socket);
    socket.once("close", () => stalledHandshake.delete(socket));
  });
  const sshPort = await listen(stalledServer);
  const localPgPort = await freePort();
  const localOraclePort = await freePort();
  const occupiedPort = net.createServer();
  const stalledOracleSockets = new Set();
  const stalledOracle = net.createServer((socket) => {
    stalledOracleSockets.add(socket);
    socket.once("close", () => stalledOracleSockets.delete(socket));
  });
  const oracleTarget = oraclePort || (testOracleTimeout ? await listen(stalledOracle) : 0);
  const originalEnv = process.env;
  const testEnv = {
    PATH: originalEnv.PATH,
    SystemRoot: originalEnv.SystemRoot,
    WINDIR: originalEnv.WINDIR,
    TEMP: originalEnv.TEMP,
    TMP: originalEnv.TMP,
    JWT_SECRET: "local-test-only-not-production",
    SSH_HOST: "127.0.0.1",
    SSH_PORT: String(sshPort),
    SSH_USER: "local-test",
    SSH_PASSWORD: "local-test",
    SSH_KEY_PATH: path.join(__dirname, "nonexistent-test-key"),
    SSH_READY_TIMEOUT_MS: "400",
    SSH_RECONNECT_BASE_MS: "100",
    SSH_MAX_INITIAL_RETRIES: "1",
    SSH_MAX_RECONNECT_ATTEMPTS: "2",
    SSH_IDLE_RETRY_INTERVAL_MS: "250",
    SSH_FORWARD_TIMEOUT_MS: "800",
    DB_HOST: "127.0.0.1",
    DB_PORT: String(pgPort),
    DB_USER: originalEnv.STABILITY_PG_USER || "stability_test",
    DB_PASSWORD: originalEnv.STABILITY_PG_PASSWORD || "",
    DB_NAME: originalEnv.STABILITY_PG_DATABASE || "postgres",
    PG_USE_SSH_TUNNEL: "true",
    LOCAL_POSTGRES_PORT: String(localPgPort),
    REMOTE_POSTGRES_HOST: "127.0.0.1",
    REMOTE_POSTGRES_PORT: String(pgPort),
    PG_CONNECTION_TIMEOUT_MS: "500",
    PG_STATEMENT_TIMEOUT_MS: "250",
    PG_QUERY_TIMEOUT_MS: "700",
    LOCAL_ORACLE_PORT: String(localOraclePort),
    ORACLE_HOST: "127.0.0.1",
    ORACLE_PORT: String(oracleTarget || 1),
    ORACLE_USER: originalEnv.STABILITY_ORACLE_USER || "stability_test",
    ORACLE_PASSWORD: originalEnv.STABILITY_ORACLE_PASSWORD || (testOracleTimeout ? "local-test" : ""),
    ORACLE_SERVICE_NAME: originalEnv.STABILITY_ORACLE_SERVICE || "FREEPDB1",
    ORACLE_CLIENT_LIB_DIR: originalEnv.STABILITY_ORACLE_CLIENT_LIB_DIR,
    ORACLE_CONNECT_TIMEOUT: "2",
    ORACLE_QUEUE_TIMEOUT: "300",
    ORACLE_POOL_MIN: "1",
    ORACLE_POOL_MAX: "1",
    ORACLE_CALL_TIMEOUT_MS: "2000",
    REDIS_URL: redisPort ? "redis://127.0.0.1:" + redisPort : undefined,
  };
  for (const key of Object.keys(testEnv)) {
    if (testEnv[key] === undefined) delete testEnv[key];
  }
  process.env = testEnv;

  const tunnel = require("../config/sshTunnel");
  const { getPgPool } = require("../config/pg");
  const { getPool, getAuthPool } = require("../config/database");
  const { closePostgresPools } = require("../config/postgresPool");
  const postgres = [getPgPool(), getPool(), getAuthPool()];
  const redis = require("../config/redis");
  let oracle = [];
  if (oracleTarget) {
    oracle = [require("../src/o2d/config/db"), await import("../src/store/src/config/db.js")];
  }

  const hostKey = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { format: "pem", type: "pkcs1" },
    publicKeyEncoding: { format: "pem", type: "pkcs1" },
  }).privateKey;
  const clients = new Set();
  let stallPostgres = false;
  const ssh = new Server({ hostKeys: [hostKey] }, (client) => {
    clients.add(client);
    client.on("error", () => {});
    client.once("close", () => clients.delete(client));
    client.on("authentication", (context) => context.accept());
    client.on("tcpip", (accept, reject, info) => {
      if (info.destIP !== "127.0.0.1" || ![pgPort, oracleTarget].includes(info.destPort)) {
        reject();
        return;
      }
      const channel = accept();
      channel.on("error", () => channel.destroy());
      if (stallPostgres && info.destPort === pgPort) return;
      const target = net.connect(info.destPort, "127.0.0.1");
      target.on("error", () => channel.destroy());
      target.once("close", () => channel.destroy());
      channel.once("close", () => target.destroy());
      channel.pipe(target).pipe(channel);
    });
  });

  try {
    await assert.rejects(tunnel.initSSHTunnel(), (error) => error.code === "SSH_TIMEOUT" ||
      error.level === "client-timeout");
    stalledServer.close();
    for (const socket of stalledHandshake) socket.destroy();
    await delay(1100); // Multiple connection refusals, including slow retries.
    await assert.rejects(postgres[0].query("SELECT 1"), /tunnel unavailable/);
    await listen(ssh, sshPort);
    await eventually(() => selectPostgres(postgres));
    if (oraclePort) await selectOracle(oracle);
    console.log("PASS startup handshake timeout and repeated refusals recover automatically");

    await assert.rejects(postgres[0].query("SELECT pg_sleep(2)"), { code: "57014" });
    await selectPostgres(postgres);
    console.log("PASS PostgreSQL statement timeout followed by successful queries");

    if (oraclePort) {
      for (const pool of oracle) {
        const held = await pool.getConnection();
        try {
          await assert.rejects(pool.getConnection(), { code: "NJS-040" });
        } finally {
          await held.close();
        }
      }
      await selectOracle(oracle);
    } else if (testOracleTimeout) {
      await Promise.all(oracle.map((pool) => assert.rejects(pool.getConnection(), { code: "ORA-12170" })));
      console.log("PASS real Oracle Thick driver times out against an unresponsive forwarded endpoint");
    }

    const oldPool = await postgres[0].connect();
    const oldBackend = await oldPool.query("SELECT pg_backend_pid() AS pid");
    const inFlight = assert.rejects(oldPool.query("SELECT pg_sleep(2)"));
    const oldPort = tunnel.getLocalPostgresPort();
    const disconnected = new Promise((resolve) => {
      const off = tunnel.onTunnelStateChange(({ type }) => {
        if (type === "disconnected") {
          off();
          resolve();
        }
      });
    });
    for (const client of clients) client.end();
    await disconnected;
    await inFlight;
    oldPool.release();
    await listen(occupiedPort, oldPort);
    stallPostgres = true;
    await eventually(() => assert.ok(tunnel.isTunnelActive()));
    assert.notEqual(tunnel.getLocalPostgresPort(), oldPort);
    await Promise.all(postgres.map((pool) => assert.rejects(pool.query("SELECT 1"), /timeout/i)));
    stallPostgres = false;
    await eventually(() => selectPostgres(postgres));
    await eventually(async () => {
      const { rows } = await postgres[0].query("SELECT pid FROM pg_stat_activity WHERE pid = $1", [
        oldBackend.rows[0].pid,
      ]);
      assert.equal(rows.length, 0);
    });
    if (oraclePort) await eventually(() => selectOracle(oracle));
    console.log("PASS all three PostgreSQL pools query after disconnect, port change and connection timeouts");
    console.log(oraclePort
      ? "PASS O2D and Store Oracle query after SSH reconnect and Oracle queue saturation"
      : "SKIP real Oracle queries (no disposable Oracle listener supplied)");

    if (redisPort) {
      await eventually(() => assert.ok(redis.isAvailable()));
      await redis.setEx("sagar-stability:read-write", 10, "ok");
      assert.equal(await redis.get("sagar-stability:read-write"), "ok");
      await redis.setEx("sagar-stability:another-key", 10, "ok");
      assert.equal(await redis.deletePattern("sagar-stability:*"), 2);
      console.log("PASS real Redis cache commands");
    }

    await checkHttp(testEnv);
  } finally {
    await Promise.all([
      ...oracle.map((pool) => pool.closePool()),
      closePostgresPools(),
      tunnel.closeSSHTunnel(),
      redis.quit(),
    ]);
    for (const client of clients) client.end();
    for (const socket of stalledHandshake) socket.destroy();
    for (const socket of stalledOracleSockets) socket.destroy();
    ssh.close();
    occupiedPort.close();
    stalledServer.close();
    stalledOracle.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
