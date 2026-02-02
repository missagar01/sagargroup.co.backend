const redis = require("../../../config/redis");
const crypto = require("crypto");

const DEFAULT_TTL = {
  DASHBOARD: 300,
  PENDING: 120,
  HISTORY: 1800,
  CUSTOMERS: 3600,
  TIMELINE: 60,
};

// In-memory fallback
const memoryCache = new Map();

function generateCacheKey(prefix, params = {}) {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}:${params[k]}`)
    .join("|");

  const hash = crypto
    .createHash("md5")
    .update(sorted || "default")
    .digest("hex")
    .slice(0, 8);

  return `o2d:${prefix}:${hash}`;
}

async function getCached(key) {
  // Try Redis first
  if (redis.isAvailable()) {
    try {
      const value = await redis.get(key);
      if (value) return JSON.parse(value);
    } catch {
      // ignore
    }
  }

  // Fallback to memory
  const mem = memoryCache.get(key);
  if (mem && mem.expiry > Date.now()) {
    return mem.data;
  } else if (mem) {
    memoryCache.delete(key);
  }

  return null;
}

async function setCached(key, data, ttl = DEFAULT_TTL.PENDING) {
  // Set in Redis
  if (redis.isAvailable()) {
    try {
      redis.setEx(key, ttl, JSON.stringify(data));
    } catch {
      // ignore
    }
  }

  // Set in memory
  memoryCache.set(key, {
    data,
    expiry: Date.now() + (ttl * 1000)
  });
}

async function delCached(key) {
  // Del in Redis
  if (redis.isAvailable()) {
    try {
      await redis.del(key);
    } catch {
      // ignore
    }
  }

  // Del in memory
  memoryCache.delete(key);
}

async function withCache(key, ttl, fetchFn) {
  const cached = await getCached(key);
  if (cached !== null) return cached;

  const fresh = await fetchFn();
  await setCached(key, fresh, ttl);
  return fresh;
}

module.exports = {
  generateCacheKey,
  getCached,
  setCached,
  delCached,
  withCache,
  DEFAULT_TTL,
};
