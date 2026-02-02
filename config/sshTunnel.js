const { Client } = require('ssh2');
const net = require('net');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables first
dotenv.config();

let sshClient = null;
let oracleTunnelServer = null;
let postgresTunnelServer = null;
let reconnectTimer = null;
let reconnectDelayMs = 5000; // start with 5s backoff
const LOCAL_ORACLE_PORT = parseInt(process.env.LOCAL_ORACLE_PORT || '1521', 10); // Local port for Oracle tunnel
const LOCAL_POSTGRES_PORT = parseInt(process.env.LOCAL_POSTGRES_PORT || '5433', 10); // Local port for PostgreSQL tunnel
const REMOTE_ORACLE_HOST = process.env.ORACLE_HOST || '127.0.0.1';
const REMOTE_ORACLE_PORT = parseInt(process.env.ORACLE_PORT || '1521', 10);
const REMOTE_POSTGRES_HOST = process.env.REMOTE_POSTGRES_HOST || '127.0.0.1';
const REMOTE_POSTGRES_PORT = parseInt(process.env.REMOTE_POSTGRES_PORT || '5432', 10);
const MAX_INITIAL_RETRIES = parseInt(process.env.SSH_MAX_INITIAL_RETRIES || '3', 10);
const MAX_BACKOFF_MS = 30000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resetBackoff() {
  reconnectDelayMs = 5000;
}

function cleanupTunnelServers() {
  if (oracleTunnelServer) {
    try {
      oracleTunnelServer.close();
    } catch (err) {
      console.error('❌ Error closing Oracle tunnel server:', err);
    }
    oracleTunnelServer = null;
  }
  if (postgresTunnelServer) {
    try {
      postgresTunnelServer.close();
    } catch (err) {
      console.error('❌ Error closing PostgreSQL tunnel server:', err);
    }
    postgresTunnelServer = null;
  }
}

function cleanupClient() {
  if (sshClient) {
    try {
      sshClient.end();
    } catch (err) {
      console.error('❌ Error ending SSH client:', err);
    }
    sshClient = null;
  }
}

async function scheduleReconnect() {
  if (reconnectTimer) return;

  const delayMs = Math.min(reconnectDelayMs, MAX_BACKOFF_MS);
  console.warn(`🔄 Scheduling SSH reconnect in ${delayMs / 1000}s...`);

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_BACKOFF_MS);
    try {
      await establishTunnels(); // background reconnect; errors will be logged
    } catch (err) {
      console.error('❌ Reconnect attempt failed:', err.message);
      scheduleReconnect();
    }
  }, delayMs);
}

function createTunnelServer(serviceName, localPort, remoteHost, remotePort) {
  return new Promise((resolve, reject) => {
    const server = net.createServer((localSocket) => {
      console.log(`🔗 Local connection received for ${serviceName}`);

      // Set socket timeout to detect stale connections
      localSocket.setTimeout(300000); // 5 minutes
      localSocket.setKeepAlive(true, 60000); // Enable TCP keepalive

      sshClient.forwardOut(
        localSocket.localAddress || '127.0.0.1',
        localSocket.localPort || 0,
        remoteHost,
        remotePort,
        (err, remoteStream) => {
          if (err) {
            console.error(`❌ SSH forward error for ${serviceName}:`, err.message);
            localSocket.destroy();
            return;
          }

          console.log(`✅ SSH forward established for ${serviceName}`);

          // Set up error handlers before piping
          localSocket.on('error', (socketErr) => {
            if (socketErr.code !== 'ECONNRESET') {
              console.error(`⚠️ Local socket error (${serviceName}):`, socketErr.message);
            }
            remoteStream.end();
          });

          localSocket.on('timeout', () => {
            console.warn(`⚠️ Local socket timeout (${serviceName}), closing connection`);
            localSocket.destroy();
            remoteStream.end();
          });

          remoteStream.on('error', (remoteErr) => {
            if (remoteErr.code !== 'ECONNRESET') {
              console.error(`⚠️ Remote stream error (${serviceName}):`, remoteErr.message);
            }
            localSocket.end();
          });

          remoteStream.on('close', () => {
            localSocket.end();
          });

          localSocket.on('close', () => {
            remoteStream.end();
          });

          localSocket.pipe(remoteStream).pipe(localSocket);
        }
      );
    });

    server.listen(localPort, '127.0.0.1', (err) => {
      if (err) {
        console.error(`❌ ${serviceName} tunnel server error:`, err);
        reject(err);
        return;
      }

      console.log(`✅ ${serviceName} SSH tunnel established on 127.0.0.1:${localPort}`);
      resolve(server);
    });

    server.on('error', (err) => {
      console.error(`❌ ${serviceName} tunnel server error:`, err);
      reject(err);
    });
  });
}

function getSSHPrivateKey() {
  // Try SSH_PRIVATE_KEY (direct key content)
  if (process.env.SSH_PRIVATE_KEY) {
    return process.env.SSH_PRIVATE_KEY;
  }

  // Try SSH_KEY_PATH (path to key file)
  if (process.env.SSH_KEY_PATH) {
    const keyPath = path.resolve(process.env.SSH_KEY_PATH);
    if (fs.existsSync(keyPath)) {
      try {
        return fs.readFileSync(keyPath, 'utf8');
      } catch (err) {
        console.error('❌ Error reading SSH key file:', err.message);
        return null;
      }
    } else {
      console.error(`❌ SSH key file not found: ${keyPath}`);
      return null;
    }
  }

  // Try default key path ~/.ssh/o2d_tunnel_key
  const defaultKeyPath = path.join(process.env.HOME || process.env.USERPROFILE || '', '.ssh', 'o2d_tunnel_key');
  if (fs.existsSync(defaultKeyPath)) {
    try {
      return fs.readFileSync(defaultKeyPath, 'utf8');
    } catch (err) {
      console.error('❌ Error reading default SSH key file:', err.message);
      return null;
    }
  }

  return null;
}

async function establishTunnels() {
  return new Promise((resolve, reject) => {
    const SSH_HOST = process.env.SSH_HOST;
    const SSH_PORT = parseInt(process.env.SSH_PORT || '22', 10);
    const SSH_USER = process.env.SSH_USER;
    const SSH_PASSWORD = process.env.SSH_PASSWORD;
    const SSH_PRIVATE_KEY = getSSHPrivateKey();

    console.log("🔐 Creating SSH tunnel to", SSH_HOST);
    console.log("🔐 SSH User:", SSH_USER ? '***' : 'NOT SET');
    console.log("🔐 SSH Port:", SSH_PORT);
    console.log("🔐 Auth Method:", SSH_PRIVATE_KEY ? 'SSH Key' : (SSH_PASSWORD ? 'Password' : 'NOT SET'));

    if (!SSH_HOST) return reject(new Error('SSH_HOST environment variable is required'));
    if (!SSH_USER) return reject(new Error('SSH_USER environment variable is required'));
    if (!SSH_PRIVATE_KEY && !SSH_PASSWORD) {
      return reject(new Error('Either SSH_PRIVATE_KEY, SSH_KEY_PATH, or SSH_PASSWORD environment variable is required'));
    }

    cleanupTunnelServers();
    cleanupClient();

    sshClient = new Client();

    let resolved = false;

    sshClient.on('ready', async () => {
      console.log('✅ SSH Client ready');

      try {
        // Create Oracle tunnel
        oracleTunnelServer = await createTunnelServer(
          'Oracle',
          LOCAL_ORACLE_PORT,
          REMOTE_ORACLE_HOST,
          REMOTE_ORACLE_PORT
        );

        // Create PostgreSQL tunnel
        postgresTunnelServer = await createTunnelServer(
          'PostgreSQL',
          LOCAL_POSTGRES_PORT,
          REMOTE_POSTGRES_HOST,
          REMOTE_POSTGRES_PORT
        );

        resetBackoff();
        resolved = true;
        resolve({ sshClient, oracleTunnelServer, postgresTunnelServer });
      } catch (err) {
        console.error('❌ Failed to establish tunnels:', err);
        if (!resolved) {
          reject(err);
        }
      }
    });

    const handleDisconnect = (label) => (err) => {
      console.error(`❌ SSH ${label}:`, err);
      cleanupTunnelServers();
      if (!resolved) {
        reject(err);
        return;
      }
      scheduleReconnect();
    };

    sshClient.on('error', handleDisconnect('connection error'));
    sshClient.on('end', handleDisconnect('connection ended'));
    sshClient.on('close', handleDisconnect('connection closed'));

    sshClient.on('keyboard-interactive', (name, instructions, lang, prompts, finish) => {
      console.log('⌨️ keyboard-interactive auth requested. Prompts:', prompts.map(p => p.prompt));
      if (SSH_PASSWORD) {
        finish(prompts.map(() => SSH_PASSWORD));
      } else {
        finish([]);
      }
    });

    const sshConfig = {
      host: SSH_HOST,
      port: SSH_PORT,
      username: SSH_USER,
      readyTimeout: 60000, // Increased from 30s to 60s
      keepaliveInterval: 5000, // More frequent keepalives (5s instead of 10s)
      keepaliveCountMax: 10, // Increased from 5 to 10
      // Add TCP keepalive to detect dead connections faster
      sock: undefined, // Will use default socket
      // Increase timeout for slower connections
      timeout: 60000,
      algorithms: {
        kex: [
          'ecdh-sha2-nistp256',
          'ecdh-sha2-nistp384',
          'ecdh-sha2-nistp521',
          'diffie-hellman-group14-sha256',
          'diffie-hellman-group-exchange-sha256',
        ],
        cipher: [
          'aes128-ctr',
          'aes192-ctr',
          'aes256-ctr',
        ],
      },
    };

    // Add authentication method (prefer SSH key over password)
    if (SSH_PRIVATE_KEY) {
      sshConfig.privateKey = SSH_PRIVATE_KEY;
      console.log('🔑 Using SSH key authentication');
    } else if (SSH_PASSWORD) {
      sshConfig.password = SSH_PASSWORD;
      sshConfig.tryKeyboard = true;
      console.log('🔑 Using password authentication');
    }

    console.log(`🔐 Connecting to SSH with user: ${SSH_USER}`);
    sshClient.connect(sshConfig);
  });
}

async function initSSHTunnel() {
  // Check if tunnel is already established
  if (sshClient && oracleTunnelServer && postgresTunnelServer) {
    console.log('✅ SSH tunnel already established, reusing existing connection');
    return { sshClient, oracleTunnelServer, postgresTunnelServer };
  }

  let attempt = 1;
  while (attempt <= MAX_INITIAL_RETRIES) {
    try {
      const result = await establishTunnels();
      return result;
    } catch (err) {
      console.error(`⚠️ SSH tunnel attempt ${attempt} failed:`, err.message);
      if (attempt >= MAX_INITIAL_RETRIES) {
        throw err;
      }
      const waitMs = Math.min(2000 * attempt, MAX_BACKOFF_MS);
      console.log(`🔄 Retrying SSH tunnel in ${waitMs / 1000}s...`);
      await delay(waitMs);
      attempt += 1;
    }
  }
}

async function closeSSHTunnel() {
  return new Promise((resolve) => {
    console.log('🛑 Closing SSH tunnel...');

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    resetBackoff();

    let closedCount = 0;
    const totalServers = (oracleTunnelServer ? 1 : 0) + (postgresTunnelServer ? 1 : 0);

    const checkComplete = () => {
      closedCount++;
      if (closedCount >= totalServers || totalServers === 0) {
        cleanupClient();
        console.log('✅ SSH tunnel closed');
        resolve();
      }
    };

    if (oracleTunnelServer) {
      oracleTunnelServer.close((err) => {
        if (err) console.error('Error closing Oracle tunnel server:', err);
        oracleTunnelServer = null;
        checkComplete();
      });
    } else {
      checkComplete();
    }

    if (postgresTunnelServer) {
      postgresTunnelServer.close((err) => {
        if (err) console.error('Error closing PostgreSQL tunnel server:', err);
        postgresTunnelServer = null;
        checkComplete();
      });
    } else if (totalServers === 0) {
      checkComplete();
    }
  });
}

function getLocalPostgresPort() {
  return LOCAL_POSTGRES_PORT;
}

function getLocalOraclePort() {
  return LOCAL_ORACLE_PORT;
}

function isTunnelActive() {
  return !!(sshClient && oracleTunnelServer && postgresTunnelServer);
}

module.exports = {
  initSSHTunnel,
  closeSSHTunnel,
  getLocalPostgresPort,
  getLocalOraclePort,
  isTunnelActive,
};
