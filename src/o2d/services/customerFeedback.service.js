const axios = require("axios");
const fs = require("fs");
const path = require("path");

const DEFAULT_SHEET_NAME = "Form Responses 1";
const MAX_ATTEMPTS = parsePositiveNumber(process.env.GOOGLE_FEEDBACK_MAX_ATTEMPTS, 4); // Stay under proxy timeouts (approx 20-25s total)
const REQUEST_TIMEOUT_MS = parsePositiveNumber(
  process.env.GOOGLE_FEEDBACK_REQUEST_TIMEOUT_MS,
  20000
);
const MEMORY_CACHE_TTL_MS = parsePositiveNumber(
  process.env.GOOGLE_FEEDBACK_CACHE_TTL_MS,
  300000
);
const FAILURE_COOLDOWN_MS = parsePositiveNumber(
  process.env.GOOGLE_FEEDBACK_FAILURE_COOLDOWN_MS,
  60000
);
const CACHE_FILE = path.join(process.cwd(), "customer_feedback_cache.json");
const responseCache = new Map();
const failureCooldowns = new Map();
const inFlightRequests = new Map();

const DEFAULT_ENDPOINTS = [process.env.GOOGLE_FEEDBACK_WEBAPP_URL].filter(Boolean);

function parsePositiveNumber(rawValue, fallbackValue) {
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackValue;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isWarmupResponse(text) {
  return (
    text.includes("Google Apps Script is running") ||
    text.includes("warming up") ||
    (text.includes("<html") && text.includes("Google"))
  );
}

function isCacheForSheet(cached, sheetName) {
  if (!cached || typeof cached !== "object") {
    return false;
  }

  if (!cached.sheetName) {
    return sheetName === DEFAULT_SHEET_NAME;
  }

  return cached.sheetName === sheetName;
}

function getCachedData(sheetName = DEFAULT_SHEET_NAME) {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const content = fs.readFileSync(CACHE_FILE, "utf8");
      const parsed = JSON.parse(content);
      return isCacheForSheet(parsed, sheetName) ? parsed : null;
    }
  } catch (err) {
    console.error("Failed to read feedback cache:", err.message);
  }
  return null;
}

function getFreshCachedData(sheetName = DEFAULT_SHEET_NAME) {
  const cached = getCachedData(sheetName);
  if (!cached?.cachedAt) {
    return null;
  }

  const ageMs = Date.now() - new Date(cached.cachedAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > MEMORY_CACHE_TTL_MS) {
    return null;
  }

  return cached;
}

function updateCache(data, sheetName = DEFAULT_SHEET_NAME) {
  try {
    fs.writeFileSync(
      CACHE_FILE,
      JSON.stringify(
        {
          ...data,
          sheetName,
          cachedAt: new Date().toISOString(),
        },
        null,
        2
      )
    );
  } catch (err) {
    console.error("Failed to update feedback cache:", err.message);
  }
}

function buildCacheKey(sheetName, endpoints) {
  return `${sheetName}::${endpoints.join("||")}`;
}

function getMemoryCachedResponse(cacheKey) {
  const entry = responseCache.get(cacheKey);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    responseCache.delete(cacheKey);
    return null;
  }

  return entry.data;
}

function setMemoryCachedResponse(cacheKey, data, ttlMs = MEMORY_CACHE_TTL_MS) {
  responseCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

function markFailureCooldown(cacheKey) {
  failureCooldowns.set(cacheKey, Date.now() + FAILURE_COOLDOWN_MS);
}

function clearFailureCooldown(cacheKey) {
  failureCooldowns.delete(cacheKey);
}

function isFailureCooldownActive(cacheKey) {
  const retryAfter = failureCooldowns.get(cacheKey);
  if (!retryAfter) {
    return false;
  }

  if (retryAfter <= Date.now()) {
    failureCooldowns.delete(cacheKey);
    return false;
  }

  return true;
}

async function fetchCustomerFeedbackFromGoogleSheet(options = {}) {
  const sheetName = options.sheetName || DEFAULT_SHEET_NAME;
  const rawEndpoints = Array.from(
    new Set([...(options.endpoints || []), ...DEFAULT_ENDPOINTS].filter(Boolean))
  );
  const cacheKey = buildCacheKey(sheetName, rawEndpoints);

  const memoryCached = getMemoryCachedResponse(cacheKey);
  if (memoryCached) {
    return memoryCached;
  }

  const freshCached = getFreshCachedData(sheetName);
  if (freshCached) {
    const ageMs = Date.now() - new Date(freshCached.cachedAt).getTime();
    const remainingTtlMs = Math.max(1000, MEMORY_CACHE_TTL_MS - ageMs);
    setMemoryCachedResponse(cacheKey, freshCached, remainingTtlMs);
    return freshCached;
  }

  if (rawEndpoints.length === 0) {
    const cached = getCachedData(sheetName);
    if (cached) return cached;
    throw new Error("No Google Apps Script URL configured in .env");
  }

  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey);
  }

  if (isFailureCooldownActive(cacheKey)) {
    const cached = getCachedData(sheetName);
    if (cached) {
      const stalePayload = {
        ...cached,
        isStale: true,
        skippedLiveFetch: true,
      };
      setMemoryCachedResponse(
        cacheKey,
        stalePayload,
        Math.min(FAILURE_COOLDOWN_MS, MEMORY_CACHE_TTL_MS)
      );
      return stalePayload;
    }
  }

  const fetchPromise = (async () => {
  let lastError = null;
  let lastSnippet = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    for (const baseEndpoint of rawEndpoints) {
      const url = new URL(baseEndpoint);
      url.searchParams.set("sheet", sheetName);
      url.searchParams.set("action", "fetch");

      // Cache bust only on later attempts to avoid triggering cold starts unnecessarily.
      if (attempt > 2) {
        url.searchParams.set("_t", Date.now().toString());
      }

      try {
        console.log(`Fetching feedback [Attempt ${attempt}/${MAX_ATTEMPTS}]: ${url.origin}`);

        const response = await axios.get(url.toString(), {
          timeout: REQUEST_TIMEOUT_MS,
          maxRedirects: 10,
          headers: {
            Accept: "application/json, text/plain, */*",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
          },
        });

        const data = response.data;
        const text = typeof data === "string" ? data : JSON.stringify(data);
        lastSnippet = text.slice(0, 500);

        if (data && data.success === true && Array.isArray(data.data)) {
          console.log(`Live feedback data retrieved on attempt ${attempt}.`);
          const responsePayload = {
            ...data,
            sheetName,
            sourceUrl: url.toString(),
          };
          updateCache(responsePayload, sheetName);
          setMemoryCachedResponse(cacheKey, responsePayload);
          clearFailureCooldown(cacheKey);
          return responsePayload;
        }

        if (isWarmupResponse(text)) {
          console.log(`Google script is warming up on attempt ${attempt}.`);
          throw new Error("Google Script Warming Up");
        }

        if (data && data.error) {
          throw new Error(data.error);
        }

        throw new Error("Invalid response format");
      } catch (error) {
        lastError = error;
        const errorMsg = error.response ? `HTTP ${error.response.status}` : error.message;

        if (errorMsg === "Google Script Warming Up") {
          console.log(`Google script warmup detected on attempt ${attempt}.`);
        } else {
          console.warn(`Feedback fetch attempt ${attempt} failed: ${errorMsg}`);
        }
      }
    }

    if (attempt < MAX_ATTEMPTS) {
      // Delay increases with each attempt: 2s, 4s, 6s
      await sleep(attempt * 2000);
    }
  }

  console.log("All live feedback attempts failed. Falling back to local cache...");
  markFailureCooldown(cacheKey);
  const cached = getCachedData(sheetName);
  if (cached) {
    const stalePayload = {
      ...cached,
      isStale: true,
      errorSnippet: lastSnippet.substring(0, 50),
    };
    setMemoryCachedResponse(
      cacheKey,
      stalePayload,
      Math.min(FAILURE_COOLDOWN_MS, MEMORY_CACHE_TTL_MS)
    );
    return stalePayload;
  }

  throw lastError || new Error(`Failed live and no cache. Last: ${lastSnippet.substring(0, 100)}...`);
  })();

  inFlightRequests.set(cacheKey, fetchPromise);

  try {
    return await fetchPromise;
  } finally {
    if (inFlightRequests.get(cacheKey) === fetchPromise) {
      inFlightRequests.delete(cacheKey);
    }
  }
}

module.exports = { fetchCustomerFeedbackFromGoogleSheet };
