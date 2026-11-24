const { createClient } = require("redis");

function connectCache() {
  if (!process.env.REDIS_URL) return null;
  try {
    const client = createClient({
      url: process.env.REDIS_URL,
      disableOfflineQueue: true,
      commandsQueueMaxLength: 1000,
      pingInterval: 5000,
      socket: {
        connectTimeout: 5000,
        socketTimeout: 10000,
        reconnectStrategy: (retries) => retries > 5 ? 30000 : Math.min(500 * 2 ** retries, 5000),
      },
    });
    let lastErrorLog = 0;
    client.on("error", (error) => {
      if (Date.now() - lastErrorLog < 30000) return;
      lastErrorLog = Date.now();
      console.warn("[Redis] Cache connection error:", error.code || error.name);
    });
    client.on("ready", () => console.info("[Redis] Cache ready"));
    void client.connect().catch(() => {});
    return client;
  } catch {
    console.warn("[Redis] Cache configuration could not be loaded");
    return null;
  }
}

const client = connectCache();
const isAvailable = () => Boolean(client?.isReady);

async function withCommandTimeout(command) {
  let timer;
  try {
    return await Promise.race([
      command,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Redis cache command timed out")), 2000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  client,
  isAvailable,

  async get(key) {
    if (!isAvailable()) return null;
    return withCommandTimeout(client.get(key));
  },

  async set(key, value) {
    if (!isAvailable()) return null;
    return withCommandTimeout(client.set(key, value));
  },

  async setEx(key, ttl, value) {
    if (!isAvailable()) return null;
    return withCommandTimeout(client.setEx(key, ttl, value));
  },

  async del(key) {
    if (!isAvailable()) return null;
    return withCommandTimeout(client.del(key));
  },

  async deletePattern(pattern) {
    if (!isAvailable()) return 0;
    let deleted = 0;
    let cursor = "0";
    do {
      const page = await withCommandTimeout(client.scan(cursor, { MATCH: pattern, COUNT: 100 }));
      if (page.keys.length) deleted += await withCommandTimeout(client.del(page.keys));
      cursor = page.cursor;
    } while (cursor !== "0");
    return deleted;
  },

  async quit() {
    // Requests have drained. Drop any remaining best-effort cache commands.
    if (client?.isOpen) client.destroy();
  },
};
