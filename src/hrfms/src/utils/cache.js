const redisClient = require('../config/redis');

// Local memory fallback for when Redis is not available
// Limited to 500 items to prevent memory leaks
const localCache = new Map();
const inFlightFetches = new Map();
const keyVersions = new Map();
const MAX_LOCAL_ITEMS = 500;

/**
 * Helper for Redis timeouts
 */
async function withTimeout(promise, ms = 2000) {
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Redis timeout')), ms)
    );
    return Promise.race([promise, timeout]);
}

/**
 * Cache utility to handle get/set with TTL and fallback
 * @param {string} key - Cache key
 * @param {number} ttl - Time to live in seconds
 * @param {Function} fetchFn - Function to fetch data if not in cache
 * @returns {Promise<any>}
 */
async function getOrSetCache(key, ttl, fetchFn) {
    const now = Date.now();

    // 1. Try Local Memory First (Fastest)
    if (localCache.has(key)) {
        const { data, expiry } = localCache.get(key);
        if (now < expiry) return data;
        localCache.delete(key);
    }

    // 2. Join an in-flight fetch for the same key to avoid stampedes.
    if (inFlightFetches.has(key)) {
        return inFlightFetches.get(key);
    }

    // 3. Try Redis Second
    try {
        // Use isReady to avoid waiting for timeout if Redis is reconnecting
        if (redisClient?.isReady) {
            const cachedData = await withTimeout(redisClient.get(key));
            if (cachedData) {
                const parsed = JSON.parse(cachedData);

                // Sync to local memory for faster subsequent access
                updateLocalCache(key, parsed, ttl);
                return parsed;
            }
        }
    } catch (err) {
        // Silent fallback - could be timeout or connection error
        if (err.message === 'Redis timeout') {
            console.warn(`[Cache] Redis GET timeout for key: ${key}`);
        }
    }

    // 4. Fetch from Source (DB/API)
    const versionBeforeFetch = getKeyVersion(key);
    const fetchPromise = (async () => {
        const data = await fetchFn();

        // Skip cache writes if this key was invalidated while the fetch was running.
        if (data !== null && data !== undefined && versionBeforeFetch === getKeyVersion(key)) {
            // Store in Memory
            updateLocalCache(key, data, ttl);

            // Store in Redis
            try {
                if (redisClient?.isReady) {
                    await withTimeout(redisClient.setEx(key, ttl, JSON.stringify(data)), 1000);
                }
            } catch (err) {
                // Silent fallback
            }
        }

        return data;
    })();

    inFlightFetches.set(key, fetchPromise);

    try {
        return await fetchPromise;
    } finally {
        if (inFlightFetches.get(key) === fetchPromise) {
            inFlightFetches.delete(key);
        }
    }
}

/**
 * Helper to update local cache with size limit
 */
function updateLocalCache(key, data, ttl) {
    if (localCache.size >= MAX_LOCAL_ITEMS) {
        // Remove oldest item (FIFO)
        const firstKey = localCache.keys().next().value;
        localCache.delete(firstKey);
    }

    localCache.set(key, {
        data,
        expiry: Date.now() + (ttl * 1000)
    });
}

function getKeyVersion(key) {
    return keyVersions.get(key) || 0;
}

function bumpKeyVersion(key) {
    keyVersions.set(key, getKeyVersion(key) + 1);
}

function getMatchingKeys(pattern) {
    if (!pattern.includes('*')) {
        return [pattern];
    }

    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    const keys = new Set([
        ...localCache.keys(),
        ...inFlightFetches.keys(),
        ...keyVersions.keys()
    ]);

    return Array.from(keys).filter((key) => regex.test(key));
}

/**
 * Invalidate cache keys matching a pattern (Using SCAN for efficiency)
 * @param {string} pattern - Pattern to match keys (e.g. "dashboard:*")
 */
async function invalidateCache(pattern) {
    for (const key of getMatchingKeys(pattern)) {
        bumpKeyVersion(key);
        inFlightFetches.delete(key);
    }

    // 1. Clear Local Memory
    if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        for (const key of localCache.keys()) {
            if (regex.test(key)) localCache.delete(key);
        }
    } else {
        localCache.delete(pattern);
    }

    // 2. Clear Redis using SCAN (Non-blocking)
    // 2. Clear Redis using SCAN Iterator (Safe and simple)
    if (!redisClient?.isReady) return;

    try {
        const iterator = redisClient.scanIterator({
            MATCH: pattern,
            COUNT: 100
        });

        for await (const key of iterator) {
            try {
                // Delete one by one to avoid issues with array arguments in some redis client versions
                await redisClient.del(key);
            } catch (e) {
                // Ignore errors for individual keys
            }
        }
    } catch (err) {
        console.error(`❌ [Redis] Invalidation Error for pattern ${pattern}:`, err.message);
    }
}

module.exports = {
    getOrSetCache,
    invalidateCache
};
