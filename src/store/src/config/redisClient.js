// src/config/redisClient.js
import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 
  `redis://${process.env.REDIS_HOST || "127.0.0.1"}:${process.env.REDIS_PORT || 6379}`;

// Build Redis client configuration
const redisConfig = {
  url: REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => {
      // Stop trying after 3 attempts (reduces spam)
      if (retries > 3) {
        // Return false to stop reconnecting (silent)
        return false;
      }
      // Exponential backoff: 100ms, 200ms, 400ms
      return Math.min(retries * 100, 1000);
    },
    connectTimeout: 5000, // 5 seconds (faster timeout)
  },
};

// Add password if provided (can be in REDIS_URL or separate REDIS_PASSWORD)
if (process.env.REDIS_PASSWORD) {
  redisConfig.password = process.env.REDIS_PASSWORD;
}

// Create Redis client
const redisClient = createClient(redisConfig);

// Event handlers
redisClient.on("connect", () => {
  // Extract host from URL for logging (remove password if present)
  const urlForLog = REDIS_URL.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
  console.log(`✅ Redis connected to ${urlForLog}`);
});

redisClient.on("ready", () => {
  console.log("✅ Redis client ready");
});

redisClient.on("error", (err) => {
  // Only log first error, then suppress to avoid spam
  if (!redisClient._errorLogged) {
    console.warn("⚠️ Redis connection failed - app will continue without cache:", err.message || err);
    console.warn("💡 To enable Redis caching, start Redis server or update REDIS_URL in .env");
    redisClient._errorLogged = true;
  }
  // Don't exit - let the app continue without Redis (graceful degradation)
});

redisClient.on("reconnecting", () => {
  // Suppress reconnecting messages to reduce noise
  // Only log if we haven't logged an error yet
  if (!redisClient._errorLogged) {
    console.log("🔄 Redis reconnecting...");
  }
});

redisClient.on("end", () => {
  console.log("🔌 Redis connection ended");
});

// Connect to Redis (with error handling)
let isConnecting = false;
let connectionPromise = null;
let connectionAttempted = false;

async function connectRedis() {
  if (redisClient.isOpen) {
    return redisClient;
  }

  if (isConnecting && connectionPromise) {
    return connectionPromise;
  }

  // Only attempt connection once to avoid spam
  if (connectionAttempted && !redisClient.isOpen) {
    return redisClient; // Return client, but it won't work (graceful degradation)
  }

  isConnecting = true;
  connectionAttempted = true;
  connectionPromise = (async () => {
    try {
      await redisClient.connect();
      console.log("✅ Redis connection established");
      redisClient._errorLogged = false; // Reset error flag on success
      return redisClient;
    } catch (err) {
      // Don't log here - error handler will log once
      isConnecting = false;
      connectionPromise = null;
      // Return client anyway - operations will fail gracefully
      return redisClient;
    } finally {
      isConnecting = false;
    }
  })();

  return connectionPromise;
}

// Auto-connect on module load (non-blocking, silent failure)
connectRedis().catch(() => {
  // Silent - error handler will log once
});

// Export client and connection function
export { connectRedis };
export default redisClient;

