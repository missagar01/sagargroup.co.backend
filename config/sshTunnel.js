const { Client } = require("ssh2");
const net = require("net");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

dotenv.config();

const DEFAULT_LOCAL_ORACLE_PORT = parseInt(
  process.env.LOCAL_ORACLE_PORT || "1521",
  10
);
const DEFAULT_LOCAL_POSTGRES_PORT = parseInt(
  process.env.LOCAL_POSTGRES_PORT || "5433",
  10
);
const REMOTE_ORACLE_HOST = process.env.ORACLE_HOST || "127.0.0.1";
const REMOTE_ORACLE_PORT = parseInt(process.env.ORACLE_PORT || "1521", 10);
const REMOTE_POSTGRES_HOST =
  process.env.REMOTE_POSTGRES_HOST ||
  process.env.DB_HOST ||
  process.env.PG_HOST ||
  "127.0.0.1";
const REMOTE_POSTGRES_PORT = parseInt(
  process.env.REMOTE_POSTGRES_PORT || "5432",
  10
);
const MAX_INITIAL_RETRIES = parseInt(
  process.env.SSH_MAX_INITIAL_RETRIES || "3",
  10
);
const MAX_SSH_RECONNECT_ATTEMPTS = parseInt(
  process.env.SSH_MAX_RECONNECT_ATTEMPTS || "5",
  10
);
const MAX_BACKOFF_MS = 30000;
const PORT_SCAN_LIMIT = parseInt(
  process.env.SSH_LOCAL_PORT_SCAN_LIMIT || "10",
  10
);

let sshClient = null;
let oracleTunnelServer = null;
let postgresTunnelServer = null;
let reconnectTimer = null;
let reconnectDelayMs = 5000;
let reconnectAttempts = 0;
let tunnelInitPromise = null;
let currentLocalOraclePort = DEFAULT_LOCAL_ORACLE_PORT;
let currentLocalPostgresPort = DEFAULT_LOCAL_POSTGRES_PORT;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resetBackoff() {
  reconnectDelayMs = 5000;
}

function isIgnorableCloseError(error) {
  return error && error.code === "ERR_SERVER_NOT_RUNNING";
}

function isAddressInUseError(error) {
  return error && error.code === "EADDRINUSE";
}

function buildError(value, fallbackMessage) {
  if (value instanceof Error) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    return new Error(value);
  }

  return new Error(fallbackMessage);
}

function closeServer(server, serviceName) {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }

    let settled = false;
    const finish = (error) => {
      if (settled) {
        return;
      }
      settled = true;

      if (error && !isIgnorableCloseError(error)) {
        console.error(`[SSH] Error closing ${serviceName} tunnel server:`, error);
      }

      resolve();
    };

    try {
      server.close(finish);
      setTimeout(() => finish(), 1000);
    } catch (error) {
      finish(error);
    }
  });
}

function endClient(client) {
  return new Promise((resolve) => {
    if (!client) {
      resolve();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    };

    client.once("close", finish);
    client.once("end", finish);
    client.once("error", finish);

    try {
      client.end();
    } catch (error) {
      console.error("[SSH] Error ending SSH client:", error);
      finish();
      return;
    }

    setTimeout(finish, 1000);
  });
}

async function cleanupTunnelServers() {
  const activeOracleServer = oracleTunnelServer;
  const activePostgresServer = postgresTunnelServer;

  oracleTunnelServer = null;
  postgresTunnelServer = null;

  await Promise.all([
    closeServer(activeOracleServer, "Oracle"),
    closeServer(activePostgresServer, "PostgreSQL"),
  ]);
}

async function cleanupClient() {
  const activeClient = sshClient;
  sshClient = null;
  await endClient(activeClient);
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const probeServer = net.createServer();

    const finish = (available) => {
      try {
        probeServer.close(() => resolve(available));
      } catch {
        resolve(available);
      }
    };

    probeServer.once("error", (error) => {
      if (!isAddressInUseError(error)) {
        console.warn(
          `[SSH] Port probe failed on 127.0.0.1:${port}:`,
          error.message || error
        );
      }
      resolve(false);
    });

    probeServer.once("listening", () => finish(true));
    probeServer.listen(port, "127.0.0.1");
  });
}

async function resolveLocalPort(serviceName, preferredPort) {
  for (let offset = 0; offset <= PORT_SCAN_LIMIT; offset += 1) {
    const candidatePort = preferredPort + offset;
    // eslint-disable-next-line no-await-in-loop
    const available = await isPortAvailable(candidatePort);
    if (!available) {
      continue;
    }

    if (offset > 0) {
      console.warn(
        `[SSH] ${serviceName} local port ${preferredPort} is busy; using ${candidatePort} instead`
      );
    }

    return candidatePort;
  }

  throw new Error(
    `${serviceName} tunnel could not find a free local port starting at ${preferredPort}`
  );
}

function createTunnelServer(
  serviceName,
  localPort,
  remoteHost,
  remotePort,
  client
) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const server = net.createServer((localSocket) => {
      if (client !== sshClient) {
        localSocket.destroy();
        return;
      }

      console.log(`[SSH] Local connection received for ${serviceName}`);

      localSocket.setTimeout(300000);
      localSocket.setKeepAlive(true, 60000);

      client.forwardOut(
        localSocket.localAddress || "127.0.0.1",
        localSocket.localPort || 0,
        remoteHost,
        remotePort,
        (error, remoteStream) => {
          if (error) {
            console.error(
              `[SSH] SSH forward error for ${serviceName}:`,
              error.message || error
            );
            localSocket.destroy();
            return;
          }

          console.log(`[SSH] SSH forward established for ${serviceName}`);

          localSocket.on("error", (socketError) => {
            if (socketError.code !== "ECONNRESET") {
              console.error(
                `[SSH] Local socket error (${serviceName}):`,
                socketError.message || socketError
              );
            }
            remoteStream.end();
          });

          localSocket.on("timeout", () => {
            console.warn(
              `[SSH] Local socket timeout (${serviceName}), closing connection`
            );
            localSocket.destroy();
            remoteStream.end();
          });

          remoteStream.on("error", (remoteError) => {
            if (remoteError.code !== "ECONNRESET") {
              console.error(
                `[SSH] Remote stream error (${serviceName}):`,
                remoteError.message || remoteError
              );
            }
            localSocket.end();
          });

          remoteStream.on("close", () => {
            if (!localSocket.destroyed) {
              localSocket.end();
            }
          });

          localSocket.on("close", () => {
            remoteStream.end();
          });

          localSocket.pipe(remoteStream).pipe(localSocket);
        }
      );
    });

    server.on("error", (error) => {
      console.error(`[SSH] ${serviceName} tunnel server error:`, error);
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    });

    server.on("close", () => {
      console.warn(`[SSH] ${serviceName} tunnel server closed`);
    });

    server.on("listening", () => {
      if (settled) {
        return;
      }
      settled = true;
      console.log(
        `[SSH] ${serviceName} SSH tunnel established on 127.0.0.1:${localPort}`
      );
      resolve(server);
    });

    server.listen(localPort, "127.0.0.1");
  });
}

function getSSHPrivateKey() {
  if (process.env.SSH_PRIVATE_KEY) {
    return process.env.SSH_PRIVATE_KEY;
  }

  if (process.env.SSH_KEY_PATH) {
    const keyPath = path.resolve(process.env.SSH_KEY_PATH);
    if (!fs.existsSync(keyPath)) {
      console.error(`[SSH] SSH key file not found: ${keyPath}`);
      return null;
    }

    try {
      return fs.readFileSync(keyPath, "utf8");
    } catch (error) {
      console.error("[SSH] Error reading SSH key file:", error.message || error);
      return null;
    }
  }

  const defaultKeyPath = path.join(
    process.env.HOME || process.env.USERPROFILE || "",
    ".ssh",
    "o2d_tunnel_key"
  );

  if (!fs.existsSync(defaultKeyPath)) {
    return null;
  }

  try {
    return fs.readFileSync(defaultKeyPath, "utf8");
  } catch (error) {
    console.error(
      "[SSH] Error reading default SSH key file:",
      error.message || error
    );
    return null;
  }
}

async function establishTunnels() {
  const SSH_HOST = process.env.SSH_HOST;
  const SSH_PORT = parseInt(process.env.SSH_PORT || "22", 10);
  const SSH_USER = process.env.SSH_USER;
  const SSH_PASSWORD = process.env.SSH_PASSWORD;
  const SSH_PRIVATE_KEY = getSSHPrivateKey();

  console.log("[SSH] Creating SSH tunnel to", SSH_HOST);
  console.log("[SSH] SSH User:", SSH_USER ? "***" : "NOT SET");
  console.log("[SSH] SSH Port:", SSH_PORT);
  console.log(
    "[SSH] Auth Method:",
    SSH_PRIVATE_KEY ? "SSH Key" : SSH_PASSWORD ? "Password" : "NOT SET"
  );

  if (!SSH_HOST) {
    throw new Error("SSH_HOST environment variable is required");
  }
  if (!SSH_USER) {
    throw new Error("SSH_USER environment variable is required");
  }
  if (!SSH_PRIVATE_KEY && !SSH_PASSWORD) {
    throw new Error(
      "Either SSH_PRIVATE_KEY, SSH_KEY_PATH, or SSH_PASSWORD environment variable is required"
    );
  }

  await cleanupTunnelServers();
  await cleanupClient();

  return new Promise((resolve, reject) => {
    const client = new Client();
    let settled = false;

    const settleSuccess = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      resetBackoff();
      reconnectAttempts = 0;
      resolve(value);
    };

    const settleFailure = async (error) => {
      if (settled) {
        return;
      }
      settled = true;

      if (client === sshClient) {
        await cleanupTunnelServers();
        await cleanupClient();
      } else {
        await endClient(client);
      }

      reject(error);
    };

    const handleDisconnect = (label) => async (value) => {
      const error = buildError(value, `SSH ${label}`);

      if (label === "connection error") {
        console.error("[SSH] SSH connection error:", error);
      } else {
        console.error(`[SSH] SSH ${label}:`, error.message || error);
      }

      if (client !== sshClient) {
        return;
      }

      if (!settled) {
        await settleFailure(error);
        return;
      }

      await cleanupTunnelServers();
      await cleanupClient();
      void scheduleReconnect();
    };

    client.on("ready", () => {
      void (async () => {
        if (client !== sshClient || settled) {
          return;
        }

        console.log("[SSH] SSH Client ready");

        try {
          const oraclePort = await resolveLocalPort(
            "Oracle",
            currentLocalOraclePort || DEFAULT_LOCAL_ORACLE_PORT
          );
          const oracleServer = await createTunnelServer(
            "Oracle",
            oraclePort,
            REMOTE_ORACLE_HOST,
            REMOTE_ORACLE_PORT,
            client
          );

          if (client !== sshClient || settled) {
            await closeServer(oracleServer, "Oracle");
            return;
          }

          oracleTunnelServer = oracleServer;
          currentLocalOraclePort = oraclePort;

          const postgresPort = await resolveLocalPort(
            "PostgreSQL",
            currentLocalPostgresPort || DEFAULT_LOCAL_POSTGRES_PORT
          );
          const postgresServer = await createTunnelServer(
            "PostgreSQL",
            postgresPort,
            REMOTE_POSTGRES_HOST,
            REMOTE_POSTGRES_PORT,
            client
          );

          if (client !== sshClient || settled) {
            await closeServer(postgresServer, "PostgreSQL");
            return;
          }

          postgresTunnelServer = postgresServer;
          currentLocalPostgresPort = postgresPort;

          settleSuccess({
            sshClient: client,
            oracleTunnelServer,
            postgresTunnelServer,
          });
        } catch (error) {
          console.error("[SSH] Failed to establish tunnels:", error);
          await settleFailure(error);
        }
      })();
    });

    client.on("error", (error) => {
      void handleDisconnect("connection error")(error);
    });
    client.on("end", () => {
      void handleDisconnect("connection ended")("SSH connection ended");
    });
    client.on("close", (hadError) => {
      const message = hadError
        ? "SSH connection closed after error"
        : "SSH connection closed";
      void handleDisconnect("connection closed")(message);
    });

    client.on(
      "keyboard-interactive",
      (name, instructions, lang, prompts, finish) => {
        console.log(
          "[SSH] keyboard-interactive auth requested. Prompts:",
          prompts.map((prompt) => prompt.prompt)
        );
        if (SSH_PASSWORD) {
          finish(prompts.map(() => SSH_PASSWORD));
          return;
        }
        finish([]);
      }
    );

    const sshConfig = {
      host: SSH_HOST,
      port: SSH_PORT,
      username: SSH_USER,
      readyTimeout: 60000,
      keepaliveInterval: 5000,
      keepaliveCountMax: 10,
      timeout: 60000,
      algorithms: {
        kex: [
          "ecdh-sha2-nistp256",
          "ecdh-sha2-nistp384",
          "ecdh-sha2-nistp521",
          "diffie-hellman-group14-sha256",
          "diffie-hellman-group-exchange-sha256",
        ],
        cipher: ["aes128-ctr", "aes192-ctr", "aes256-ctr"],
      },
    };

    if (SSH_PRIVATE_KEY) {
      sshConfig.privateKey = SSH_PRIVATE_KEY;
      console.log("[SSH] Using SSH key authentication");
    } else {
      sshConfig.password = SSH_PASSWORD;
      sshConfig.tryKeyboard = true;
      console.log("[SSH] Using password authentication");
    }

    sshClient = client;
    console.log(`[SSH] Connecting to SSH with user: ${SSH_USER}`);
    client.connect(sshConfig);
  });
}

async function scheduleReconnect() {
  if (reconnectTimer || tunnelInitPromise) {
    return;
  }

  if (reconnectAttempts >= MAX_SSH_RECONNECT_ATTEMPTS) {
    console.error(
      `[SSH] SSH permanently disabled after ${MAX_SSH_RECONNECT_ATTEMPTS} failures.`
    );
    console.error(
      "[SSH] Please check your network, SSH credentials, or remote server status."
    );
    return;
  }

  const waitMs = Math.min(reconnectDelayMs, MAX_BACKOFF_MS);
  reconnectAttempts += 1;

  console.warn(
    `[SSH] Scheduling SSH reconnect (${reconnectAttempts}/${MAX_SSH_RECONNECT_ATTEMPTS}) in ${waitMs / 1000}s...`
  );

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_BACKOFF_MS);
    void initSSHTunnel().catch((error) => {
      console.error("[SSH] Reconnect attempt failed:", error.message || error);
      void scheduleReconnect();
    });
  }, waitMs);
}

async function initSSHTunnel() {
  if (isTunnelActive()) {
    console.log("[SSH] SSH tunnel already established, reusing existing connection");
    return { sshClient, oracleTunnelServer, postgresTunnelServer };
  }

  if (tunnelInitPromise) {
    return tunnelInitPromise;
  }

  tunnelInitPromise = (async () => {
    let attempt = 1;

    while (attempt <= MAX_INITIAL_RETRIES) {
      try {
        return await establishTunnels();
      } catch (error) {
        console.error(
          `[SSH] SSH tunnel attempt ${attempt} failed:`,
          error.message || error
        );

        if (attempt >= MAX_INITIAL_RETRIES) {
          throw error;
        }

        const waitMs = Math.min(2000 * attempt, MAX_BACKOFF_MS);
        console.log(`[SSH] Retrying SSH tunnel in ${waitMs / 1000}s...`);
        await delay(waitMs);
        attempt += 1;
      }
    }

    throw new Error("SSH tunnel initialization exhausted all retries");
  })();

  try {
    return await tunnelInitPromise;
  } finally {
    tunnelInitPromise = null;
  }
}

async function closeSSHTunnel() {
  console.log("[SSH] Closing SSH tunnel...");

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  resetBackoff();
  reconnectAttempts = 0;

  await cleanupTunnelServers();
  await cleanupClient();

  console.log("[SSH] SSH tunnel closed");
}

function getLocalPostgresPort() {
  return currentLocalPostgresPort;
}

function getLocalOraclePort() {
  return currentLocalOraclePort;
}

function isTunnelActive() {
  return Boolean(
    sshClient &&
      oracleTunnelServer &&
      oracleTunnelServer.listening &&
      postgresTunnelServer &&
      postgresTunnelServer.listening
  );
}

module.exports = {
  initSSHTunnel,
  closeSSHTunnel,
  getLocalPostgresPort,
  getLocalOraclePort,
  isTunnelActive,
};
