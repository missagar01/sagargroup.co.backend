import redisClient, { connectRedis } from "../config/redisClient.js";

const DEFAULT_TTL = {
  STOCK: 300,
  PO: 180,
  INDENT: 180,
  DASHBOARD: 120,
  GATE_PASS: 180,
  UOM: 300,
  AUTH: 300,
  COST_LOCATION: 300,
  STORE_ISSUE: 180,
  ITEMS: 300,
  RETURNABLE: 180,
  REPAIR_FOLLOWUP: 120,
  STORE_GRN: 180,
  STORE_GRN_APPROVAL: 120,
  DEPARTMENTS: 300,
  SETTINGS: 180,
};

const memoryCache = new Map();
const inFlightFetches = new Map();

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createPatternMatcher(pattern) {
  return new RegExp(`^${escapeRegex(pattern).replace(/\\\*/g, ".*")}$`);
}

function getMemoryEntry(key) {
  const entry = memoryCache.get(key);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt && entry.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }

  return entry.data;
}

function setMemoryEntry(key, data, ttlSeconds = null) {
  memoryCache.set(key, {
    data,
    expiresAt: ttlSeconds ? Date.now() + (ttlSeconds * 1000) : null,
  });
}

function deleteMemoryEntries(pattern) {
  if (!pattern.includes("*")) {
    return memoryCache.delete(pattern) ? 1 : 0;
  }

  const matcher = createPatternMatcher(pattern);
  let deleted = 0;

  for (const key of memoryCache.keys()) {
    if (matcher.test(key)) {
      memoryCache.delete(key);
      deleted += 1;
    }
  }

  return deleted;
}

function normalizeKeyPart(value) {
  if (value === undefined || value === null || value === "") {
    return "na";
  }

  return encodeURIComponent(String(value).trim().toLowerCase());
}

function buildKey(prefix, ...parts) {
  return ["store", prefix, ...parts.map(normalizeKeyPart)].join(":");
}

async function ensureConnected() {
  if (!redisClient.isOpen) {
    try {
      await connectRedis();
    } catch {
      // Graceful degradation: memory cache still works.
    }
  }

  return redisClient.isOpen;
}

export async function getCache(key) {
  const memoryValue = getMemoryEntry(key);
  if (memoryValue !== null) {
    return memoryValue;
  }

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
    return null;
  }
}

export async function setCache(key, data, ttlSeconds = null) {
  try {
    setMemoryEntry(key, data, ttlSeconds);

    if (!(await ensureConnected())) {
      return true;
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
    return false;
  }
}

export async function deleteCache(key) {
  const memoryDeletes = deleteMemoryEntries(key);

  try {
    if (!(await ensureConnected())) {
      return memoryDeletes;
    }

    if (key.includes("*")) {
      const keys = [];
      for await (const matchedKey of redisClient.scanIterator({
        MATCH: key,
        COUNT: 100,
      })) {
        keys.push(matchedKey);
      }

      if (!keys.length) {
        return memoryDeletes;
      }

      return memoryDeletes + (await redisClient.del(keys));
    }

    return memoryDeletes + (await redisClient.del(key));
  } catch (err) {
    console.warn(`[RedisCache] deleteCache error for key "${key}":`, err.message);
    return memoryDeletes;
  }
}

export async function getOrSetCache(key, fetchFn, ttlSeconds = null) {
  const cached = await getCache(key);
  if (cached !== null) {
    return cached;
  }

  if (inFlightFetches.has(key)) {
    return inFlightFetches.get(key);
  }

  const fetchPromise = (async () => {
    const freshData = await fetchFn();

    if (freshData !== null && freshData !== undefined) {
      setCache(key, freshData, ttlSeconds).catch((err) => {
        console.warn(`[RedisCache] Failed to cache key "${key}":`, err.message);
      });
    }

    return freshData;
  })();

  inFlightFetches.set(key, fetchPromise);

  try {
    return await fetchPromise;
  } finally {
    inFlightFetches.delete(key);
  }
}

export const cacheKeys = {
  stock: (fromDate, toDate) => buildKey("stock", fromDate, toDate),
  poPending: () => buildKey("po", "pending"),
  poHistory: () => buildKey("po", "history"),
  indentPending: () => buildKey("indent", "pending"),
  indentHistory: () => buildKey("indent", "history"),
  indentDashboard: () => buildKey("indent", "dashboard"),
  gatePassPending: () => buildKey("gatepass", "pending"),
  gatePassReceived: () => buildKey("gatepass", "received"),
  gatePassCounts: () => buildKey("gatepass", "counts"),
  uomItems: () => buildKey("uom", "items"),
  authUser: (userName, employeeId) => buildKey("auth", "user", userName, employeeId),
  costLocation: (divCode) => buildKey("costlocation", divCode || "all"),
  storeIssue: () => buildKey("storeissue", "all"),
  itemsMaster: () => buildKey("items", "master"),
  itemCategories: () => buildKey("items", "categories"),
  productsMaster: () => buildKey("products", "master"),
  vendorsMaster: () => buildKey("vendors", "master"),
  returnableStats: () => buildKey("returnable", "stats"),
  returnableDetails: () => buildKey("returnable", "details"),
  repairFollowups: () => buildKey("repairfollowup", "all"),
  repairFollowupById: (id) => buildKey("repairfollowup", "id", id),
  storeGrnPending: () => buildKey("storegrn", "pending"),
  storeGrnApprovalAll: () => buildKey("storegrnapproval", "all"),
  departments: () => buildKey("departments", "all"),
  departmentHod: (department) => buildKey("departments", "hod", department),
  settingsUsers: () => buildKey("settings", "users"),
  dashboardRepair: () => buildKey("dashboard", "repair-system"),
};

export async function invalidateCache(pattern) {
  return deleteCache(pattern);
}

export { DEFAULT_TTL };

