const frontendOriginsEnv = process.env.CORS_ORIGINS || process.env.FRONTEND_ORIGINS || "";

module.exports = {
  env: {
    frontendOrigins: frontendOriginsEnv.split(',').map(origin => origin.trim()).filter(Boolean),
    mqttBrokerUrl: process.env.MQTT_BROKER_URL || '',
    mqttUsername: process.env.MQTT_USERNAME || '',
    mqttPassword: process.env.MQTT_PASSWORD || '',
    mqttTopics: (process.env.MQTT_TOPICS || 'sagarpipe').split(',').map(t => t.trim()).filter(Boolean),
    dbHost: process.env.PB_HOST  || '',
    dbPort: Number(process.env.PB_PORT ||  5432),
    dbUser: process.env.PB_USER ||  '',
    dbPassword: process.env.PB_PASSWORD ||  '',
    dbName: process.env.PB_NAME || '',
    dbRetryDelayMs: Number(process.env.DB_RETRY_DELAY_MS) || 10000,
  },
};
