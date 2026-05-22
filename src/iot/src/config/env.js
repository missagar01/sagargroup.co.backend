const frontendOriginsEnv = process.env.CORS_ORIGINS || process.env.FRONTEND_ORIGINS || "";

module.exports = {
  env: {
    frontendOrigins: frontendOriginsEnv.split(',').map(origin => origin.trim()).filter(Boolean),
    mqttBrokerUrl: process.env.MQTT_BROKER_URL || '',
    mqttUsername: process.env.MQTT_USERNAME || '',
    mqttPassword: process.env.MQTT_PASSWORD || '',
    dbHost: process.env.PB_HOST || process.env.DB_HOST || '',
    dbPort: Number(process.env.PB_PORT || process.env.DB_PORT) || 5432,
    dbUser: process.env.PB_USER || process.env.DB_USER || '',
    dbPassword: process.env.PB_PASSWORD || process.env.DB_PASSWORD || '',
    dbName: process.env.PB_NAME || process.env.DB_NAME || '',
    dbRetryDelayMs: Number(process.env.DB_RETRY_DELAY_MS) || 10000,
  },
};
