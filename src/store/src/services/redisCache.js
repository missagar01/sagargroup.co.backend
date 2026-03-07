// src/services/redisCache.js
// Production-ready Redis caching utility for Oracle queries
import redisClient, { connectRedis } from "../config/redisClient.js";

// Default TTL values (in seconds)
const DEFAULT_TTL = {
  STOCK: 300, // 5 minutes
  PO: 180, // 3 minutes
  INDENT: 180, // 3 minutes
  DASHBOARD: 120, // 2 minutes
  GATE_PASS: 180, // 3 minutes
  UOM: 3600, // 1 hour (rarely changes)
  AUTH: 300, // 5 minutes (user data cache)
  COST_LOCATION: 1800, // 30 minutes (cost locations don't change often)
  STORE_ISSUE: 300, // 5 minutes
};

/**
 * Ensure Redis is connected before operations
 */
async function ensureConnected() {
  if (!redisClient.isOpen) {
    try {
      await connectRedis();
    } catch (err) {
      // Silent - already logged in redisClient
      // App continues without cache (graceful degradation)
    }
  }
  return redisClient.isOpen;
}

/**
 * Get cached data from Redis
 * @param {string} key - Cache key
 * @returns {Promise<any|null>} - Cached data or null if not found/error
 */
export async function getCache(key) {
  try {
    if (!(await ensureConnected())) {
      return null;
    }

    const cached = await redisClient.get(key);
    if (!cached) {
      return null;
    }

    return JSON.parse(cached);
  } catch (err) {
    console.warn(`[RedisCache] getCache error for key "${key}":`, err.message);
    return null; // Graceful degradation - return null on error
  }
}

/**
 * Set cached data in Redis
 * @param {string} key - Cache key
 * @param {any} data - Data to cache
 * @param {number} ttlSeconds - Time to live in seconds (optional)
 * @returns {Promise<boolean>} - Success status
 */
export async function setCache(key, data, ttlSeconds = null) {
  try {
    if (!(await ensureConnected())) {
      return false;
    }

    const serialized = JSON.stringify(data);

    if (ttlSeconds) {
      await redisClient.setEx(key, ttlSeconds, serialized);
    } else {
      await redisClient.set(key, serialized);
    }

    return true;
  } catch (err) {
    console.warn(`[RedisCache] setCache error for key "${key}":`, err.message);
    return false; // Graceful degradation
  }
}

/**
 * Delete cached data from Redis
 * @param {string} key - Cache key (supports patterns with *)
 * @returns {Promise<number>} - Number of keys deleted
 */
export async function deleteCache(key) {
  try {
    if (!(await ensureConnected())) {
      return 0;
    }

    // If key contains wildcard, use SCAN + DEL
    if (key.includes("*")) {
      const keys = [];
      for await (const key of redisClient.scanIterator({
        MATCH: key,
        COUNT: 100,
      })) {
        keys.push(key);
      }

      if (keys.length > 0) {
        return await redisClient.del(keys);
      }
      return 0;
    }

    // Single key deletion
    return await redisClient.del(key);
  } catch (err) {
    console.warn(`[RedisCache] deleteCache error for key "${key}":`, err.message);
    return 0;
  }
}

/**
 * Get or set cache with automatic fallback to Oracle query
 * @param {string} key - Cache key
 * @param {Function} fetchFn - Function to fetch data from Oracle if cache miss
 * @param {number} ttlSeconds - TTL in seconds
 * @returns {Promise<any>} - Cached or fresh data
 */
export async function getOrSetCache(key, fetchFn, ttlSeconds = null) {
  // Try to get from cache first
  const cached = await getCache(key);
  if (cached !== null) {
    return cached;
  }

  // Cache miss - fetch from Oracle
  const freshData = await fetchFn();

  // Store in cache (non-blocking)
  if (freshData !== null && freshData !== undefined) {
    setCache(key, freshData, ttlSeconds).catch((err) => {
      console.warn(`[RedisCache] Failed to cache key "${key}":`, err.message);
    });
  }

  return freshData;
}

/**
 * Cache key generators for different services
 */
export const cacheKeys = {
  // Stock service
  stock: (fromDate, toDate) => `stock:${fromDate}|${toDate}`,

  // PO service
  poPending: () => "po:pending",
  poHistory: () => "po:history",

  // Store Indent service
  indentPending: () => "indent:pending",
  indentHistory: () => "indent:history",
  indentDashboard: () => "indent:dashboard",

  // Repair Gate Pass service
  gatePassPending: () => "gatepass:pending",
  gatePassReceived: () => "gatepass:received",
  gatePassCounts: () => "gatepass:counts",

  // UOM service
  uomItems: () => "uom:items",

  // Auth service
  authUser: (userName, employeeId) => `auth:user:${userName || ''}:${employeeId || ''}`,

  // Cost Location service
  costLocation: (divCode) => `costlocation:${divCode || 'SM'}`,

  // Store Issue service
  storeIssue: () => "storeissue:all",
};

/**
 * Invalidate cache patterns
 */
export async function invalidateCache(pattern) {
  return await deleteCache(pattern);
}

// Export TTL constants
export { DEFAULT_TTL };

