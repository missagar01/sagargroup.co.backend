const frontendOriginsEnv = process.env.CORS_ORIGINS || process.env.FRONTEND_ORIGINS || "";

function parseBoolean(value, defaultValue = false) {
  if (value == null || value === "") {
    return defaultValue;
  }

  return ["true", "1", "yes"].includes(String(value).trim().toLowerCase());
}

function parseNumber(value, defaultValue) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

const dbHost = process.env.DB_HOST || process.env.PG_HOST || "";
const inferredDbSsl = dbHost.includes("rds.amazonaws.com");

module.exports = {
  env: {
    frontendOrigins: frontendOriginsEnv.split(',').map(origin => origin.trim()).filter(Boolean),
    mqttBrokerUrl: process.env.MQTT_BROKER_URL || '',
    mqttUsername: process.env.MQTT_USERNAME || '',
    mqttPassword: process.env.MQTT_PASSWORD || '',
    mqttTopics: (process.env.MQTT_TOPICS || 'sagarpipe').split(',').map(t => t.trim()).filter(Boolean),
    dbHost,
    dbPort: parseNumber(process.env.DB_PORT || process.env.PG_PORT, 5432),
    dbUser: process.env.DB_USER || process.env.PG_USER || '',
    dbPassword: process.env.DB_PASSWORD || process.env.PG_PASSWORD || '',
    dbName: process.env.DB_NAME || process.env.PG_DATABASE || process.env.PG_NAME || '',
    dbSsl: parseBoolean(process.env.DB_SSL || process.env.PG_SSL, inferredDbSsl),
    dbUseSharedPool: parseBoolean(process.env.IOT_USE_SHARED_PG, true),
    dbRetryDelayMs: parseNumber(process.env.DB_RETRY_DELAY_MS, 10000),
  },
};
