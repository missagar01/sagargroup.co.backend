const { Client } = require("ssh2");
const net = require("net");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ quiet: true });

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const readyTimeout = positiveInteger(process.env.SSH_READY_TIMEOUT_MS, 30000);
const forwardTimeout = positiveInteger(process.env.SSH_FORWARD_TIMEOUT_MS, 10000);
const initialDelay = positiveInteger(process.env.SSH_RECONNECT_BASE_MS, 5000);
const burstAttempts = positiveInteger(process.env.SSH_MAX_RECONNECT_ATTEMPTS, 5);
const initialAttempts = positiveInteger(process.env.SSH_MAX_INITIAL_RETRIES, 2);
const idleDelay = positiveInteger(process.env.SSH_IDLE_RETRY_INTERVAL_MS, 120000);
const services = {
  oracle: {
    port: positiveInteger(process.env.LOCAL_ORACLE_PORT, 1521),
    host: process.env.ORACLE_HOST || "127.0.0.1",
    target: positiveInteger(process.env.ORACLE_PORT, 1521),
  },
  postgres: {
    port: positiveInteger(process.env.LOCAL_POSTGRES_PORT, 5433),
    host: process.env.REMOTE_POSTGRES_HOST || process.env.DB_HOST || process.env.PG_HOST || "127.0.0.1",
    target: positiveInteger(process.env.REMOTE_POSTGRES_PORT, 5432),
  },
};

const listeners = new Set();
let active = null;
let pending = null;
let attempt = null;
let retryTimer = null;
let failures = 0;
let stopping = false;

function emit(type, session) {
  for (const listener of listeners) {
    try {
      listener({
        type,
        oraclePort: session.oracle.port,
        postgresPort: session.postgres.port,
      });
    } catch {
      console.error("[SSH] Tunnel state listener failed");
    }
  }
}

function getSSHPrivateKey() {
  if (process.env.SSH_PRIVATE_KEY) return process.env.SSH_PRIVATE_KEY;
  const filename = process.env.SSH_KEY_PATH || path.join(
    process.env.HOME || process.env.USERPROFILE || "", ".ssh", "o2d_tunnel_key"
  );
  try {
    return fs.readFileSync(path.resolve(filename), "utf8");
  } catch {
    if (process.env.SSH_KEY_PATH) console.warn("[SSH] Configured SSH key could not be read");
    return undefined;
  }
}

function bind(server, port) {
  return new Promise((resolve, reject) => {
    function cleanup() {
      server.off("listening", ready);
      server.off("error", failed);
      server.off("close", canceled);
    }
    function ready() {
      cleanup();
      resolve();
    }
    function failed(error) {
      cleanup();
      reject(error);
    }
    function canceled() {
      failed(new Error("SSH forward listener closed during setup"));
    }
    server.once("listening", ready);
    server.once("error", failed);
    server.once("close", canceled);
    try {
      server.listen(port, "127.0.0.1");
    } catch (error) {
      failed(error);
    }
  });
}

async function openForward(session, service) {
  const server = net.createServer((socket) => {
    session.sockets.add(socket);
    let stream;
    const timer = setTimeout(() => socket.destroy(), forwardTimeout);
    socket.on("error", () => socket.destroy());
    socket.once("close", () => {
      clearTimeout(timer);
      session.sockets.delete(socket);
      stream?.destroy();
    });
    socket.setKeepAlive(true, positiveInteger(process.env.SSH_DB_TUNNEL_KEEPALIVE_MS, 30000));
    const idleTimeout = positiveInteger(process.env.SSH_DB_TUNNEL_SOCKET_TIMEOUT_MS, 0);
    if (idleTimeout) socket.setTimeout(idleTimeout, () => socket.destroy());

    if (active !== session || session.forwarding >= 100) {
      socket.destroy();
      return;
    }
    session.forwarding += 1;
    try {
      session.client.forwardOut(socket.remoteAddress, socket.remotePort, service.host,
        service.target, (error, channel) => {
          session.forwarding -= 1;
          clearTimeout(timer);
          if (error) {
            socket.destroy();
            return;
          }
          stream = channel;
          stream.on("error", () => socket.destroy());
          stream.once("close", () => socket.destroy());
          if (socket.destroyed || active !== session) {
            stream.destroy();
            return;
          }
          socket.pipe(stream).pipe(socket);
        });
    } catch {
      session.forwarding -= 1;
      socket.destroy();
    }
  });

  session.servers.add(server);
  const scanLimit = process.env.SSH_LOCAL_PORT_SCAN_LIMIT === "0"
    ? 0
    : positiveInteger(process.env.SSH_LOCAL_PORT_SCAN_LIMIT, 10);
  for (let offset = 0; offset <= scanLimit; offset += 1) {
    if (session.closed) throw new Error("SSH session closed during listener setup");
    const port = service.port + offset;
    try {
      await bind(server, port);
      server.on("error", session.fail);
      server.on("close", session.fail);
      return { server, port };
    } catch (error) {
      if (error.code !== "EADDRINUSE") throw error;
    }
  }
  throw Object.assign(new Error("No available SSH forwarding port"), { code: "EADDRINUSE" });
}

function dispose(session) {
  session.closed = true;
  for (const server of session.servers) server.close();
  for (const socket of session.sockets) socket.destroy();
  // Destroy the transport even during a stalled SSH handshake.
  session.transport.destroy();
}

function establish() {
  return new Promise((resolve, reject) => {
    const host = process.env.SSH_HOST;
    const username = process.env.SSH_USER;
    const password = process.env.SSH_PASSWORD;
    const privateKey = getSSHPrivateKey();
    if (!host || !username || (!password && !privateKey)) {
      reject(Object.assign(new Error("SSH configuration incomplete"), { code: "SSH_CONFIG" }));
      return;
    }

    const client = new Client();
    const transport = new net.Socket();
    const session = { client, transport, servers: new Set(), sockets: new Set(), closed: false, forwarding: 0 };
    attempt = session;
    let timer;

    session.fail = (error) => {
      if (session.closed) return;
      clearTimeout(timer);
      const wasActive = active === session;
      if (wasActive) active = null;
      dispose(session);
      if (wasActive) {
        emit("disconnected", session);
        if (!stopping) console.warn("[SSH] Tunnel disconnected");
        scheduleReconnect();
      } else {
        reject(error || new Error("SSH connection closed"));
      }
    };

    transport.on("error", session.fail);
    transport.once("close", () => session.fail());
    client.on("error", session.fail);
    client.once("end", () => session.fail());
    client.once("close", () => session.fail());
    client.on("keyboard-interactive", (_name, _instructions, _lang, prompts, finish) => {
      finish(password ? prompts.map(() => password) : []);
    });

    client.once("ready", async () => {
      try {
        session.oracle = await openForward(session, services.oracle);
        session.postgres = await openForward(session, services.postgres);
        if (session.closed) return;
        clearTimeout(timer);
        active = session;
        failures = 0;
        console.info("[SSH] Database tunnels ready");
        emit("connected", session);
        resolve(connectionResult(session));
      } catch (error) {
        session.fail(error);
      }
    });

    timer = setTimeout(() => session.fail(Object.assign(
      new Error("SSH connection timed out"), { code: "SSH_TIMEOUT" }
    )), readyTimeout);

    transport.once("connect", () => {
      try {
        const socketTimeout = positiveInteger(process.env.SSH_SOCKET_TIMEOUT_MS || process.env.SSH_CONNECT_TIMEOUT_MS, 0);
        if (socketTimeout) transport.setTimeout(socketTimeout, () => session.fail());
        client.connect({
          sock: transport,
          host,
          username,
          readyTimeout,
          keepaliveInterval: positiveInteger(process.env.SSH_KEEPALIVE_INTERVAL_MS, 10000),
          keepaliveCountMax: positiveInteger(process.env.SSH_KEEPALIVE_COUNT_MAX, 12),
          algorithms: {
            kex: [
              "ecdh-sha2-nistp256", "ecdh-sha2-nistp384", "ecdh-sha2-nistp521",
              "diffie-hellman-group14-sha256", "diffie-hellman-group-exchange-sha256",
            ],
            cipher: ["aes128-ctr", "aes192-ctr", "aes256-ctr"],
          },
          ...(privateKey ? { privateKey } : { password, tryKeyboard: true }),
        });
      } catch (error) {
        session.fail(error);
      }
    });
    try {
      transport.connect(positiveInteger(process.env.SSH_PORT, 22), host);
    } catch (error) {
      session.fail(error);
    }
  });
}

function scheduleReconnect() {
  if (stopping || active || pending || retryTimer) return;
  const fastAttempts = initialAttempts + burstAttempts - 1;
  const baseDelay = failures >= fastAttempts
    ? idleDelay
    : Math.min(initialDelay * 2 ** Math.max(0, failures - 1), 30000);
  const delay = Math.max(100, Math.round(baseDelay * (0.8 + Math.random() * 0.4)));
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void initSSHTunnel().catch(() => {});
  }, delay);
  retryTimer.unref();
}

function connectionResult(session) {
  return {
    sshClient: session.client,
    oracleTunnelServer: session.oracle.server,
    postgresTunnelServer: session.postgres.server,
  };
}

function initSSHTunnel() {
  if (active) return Promise.resolve(connectionResult(active));
  if (pending) return pending;
  if (stopping || retryTimer) return Promise.reject(new Error("SSH tunnel unavailable"));

  pending = establish().catch((error) => {
    if (!stopping) {
      failures += 1;
      console.warn("[SSH] Connection attempt failed:", error.code || error.level || "SSH_ERROR");
    }
    throw error;
  }).finally(() => {
    pending = null;
    attempt = null;
    scheduleReconnect();
  });
  return pending;
}

async function closeSSHTunnel() {
  stopping = true;
  clearTimeout(retryTimer);
  retryTimer = null;
  (active || attempt)?.fail();
  await pending?.catch(() => {});
}

module.exports = {
  initSSHTunnel,
  closeSSHTunnel,
  getLocalPostgresPort: () => active?.postgres.port || services.postgres.port,
  getLocalOraclePort: () => active?.oracle.port || services.oracle.port,
  getTunnelSession: () => active,
  isTunnelActive: () => Boolean(active),
  onTunnelStateChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
