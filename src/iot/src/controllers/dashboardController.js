const mqttGatewayService = require('../services/mqttGatewayService');
const postgresPersistenceService = require('../services/postgresPersistenceService');

const getStatus = (req, res) => {
  res.json(mqttGatewayService.getStatus());
};

const getMessages = async (req, res, next) => {
  try {
    if (!postgresPersistenceService.isReady()) {
      const error = new Error('PostgreSQL database is not ready');
      error.statusCode = 503;
      throw error;
    }

    // 1. Get live raw messages from memory and normalize them
    const rawLive = mqttGatewayService.getMessages() || [];
    const normalizedLive = rawLive.map(m =>
      postgresPersistenceService.normalizeLiveMessage(m, mqttGatewayService.mqttConfig.brokerUrl)
    );

    // 2. Get 30-minute summary rows from the database
    const persistedMessages = await postgresPersistenceService.getMessages();

    // 3. Combine both streams (live memory first, then database history)
    const mergedMessages = [...normalizedLive, ...persistedMessages];

    res.json(mergedMessages);
  } catch (error) {
    next(error);
  }
};

const updateConfig = (req, res) => {
  const result = mqttGatewayService.updateConfig(req.body);
  res.json(result);
};

const publishMessage = async (req, res, next) => {
  try {
    const result = await mqttGatewayService.publishMessage(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

const clearHistory = async (req, res, next) => {
  try {
    const result = mqttGatewayService.clearHistory();
    await postgresPersistenceService.clearMessages();
    res.json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getStatus,
  getMessages,
  updateConfig,
  publishMessage,
  clearHistory,
};
