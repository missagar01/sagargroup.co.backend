const { env } = require("./src/config/env");
const { buildCorsOriginChecker } = require("./src/config/cors");
const mqttGatewayService = require("./src/services/mqttGatewayService");
const postgresPersistenceService = require("./src/services/postgresPersistenceService");
const { registerSocketHandlers } = require("./src/sockets/registerSocketHandlers");

let isInitialized = false;
let shutdownPromise = null;

const getSocketCorsOptions = () => ({
  origin: buildCorsOriginChecker(env.frontendOrigins),
  methods: ["GET", "POST"],
});

const initializeIotModule = async (io) => {
  if (isInitialized) {
    return;
  }

  if (!io) {
    throw new Error("Socket.IO instance is required to initialize IoT module");
  }

  await postgresPersistenceService.initialize({
    host: env.dbHost,
    port: env.dbPort,
    user: env.dbUser,
    password: env.dbPassword,
    database: env.dbName,
    retryDelayMs: env.dbRetryDelayMs,
  });

  mqttGatewayService.initialize({
    io,
    brokerUrl: env.mqttBrokerUrl,
    username: env.mqttUsername,
    password: env.mqttPassword,
  });

  registerSocketHandlers(io);
  isInitialized = true;

  console.log("IoT module attached to the main backend server.");
};

const shutdownIotModule = async () => {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  shutdownPromise = Promise.all([
    Promise.resolve(mqttGatewayService.shutdown()),
    Promise.resolve(postgresPersistenceService.shutdown()),
  ]).finally(() => {
    isInitialized = false;
    shutdownPromise = null;
  });

  return shutdownPromise;
};

module.exports = {
  getSocketCorsOptions,
  initializeIotModule,
  shutdownIotModule,
};
