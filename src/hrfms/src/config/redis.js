const { createClient } = require('redis');

/**
 * REDIS CONFIGURATION
 * Dynamic connection based on environment variables.
 * Fallback to local memory cache if connection fails.
 */

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
    console.warn('⚠️ [Redis] REDIS_URL is not defined in .env. Running in Memory-Only mode.');
}

const client = redisUrl ? createClient({
    url: redisUrl,
    commandsQueueMaxLength: 1000, // Prevent memory issues if queue grows
    socket: {
        reconnectStrategy: (retries) => {
            // Limited retries: After 5 attempts, we slow down significantly
            if (retries > 5) {
                if (retries === 6) {
                    console.warn('⚠️ [Redis] Connection failed multiple times. Falling back to Database.');
                }
                return 30000; // Retry every 30 seconds to prevent resource exhaustion
            }
            return Math.min(retries * 500, 3000);
        },
        connectTimeout: 5000,
    }
}) : null;

let lastErrorLog = 0;

if (client) {
    client.on('error', (err) => {
        const now = Date.now();
        // Log error only once every 60 seconds to prevent console flooding
        if (now - lastErrorLog > 60000) {
            console.error(`❌ [Redis] Client Error: ${err.message}`);
            lastErrorLog = now;
        }
    });

    client.on('connect', () => {
        console.log('🚀 [Redis] Connected successfully');
    });

    // Initial connection attempt
    (async () => {
        try {
            if (!client.isOpen) await client.connect();
        } catch (err) {
            // Errors are handled by the 'error' event listener
        }
    })();
}

module.exports = client;
