const mqttGatewayService = require('../services/mqttGatewayService');
const postgresPersistenceService = require('../services/postgresPersistenceService');

const respondIfPostgresNotReady = (res) => {
  if (postgresPersistenceService.isReady()) {
    return false;
  }

  res.status(503).json({
    success: false,
    message: 'PostgreSQL database is not ready',
  });
  return true;
};

const getStatus = (req, res) => {
  res.json(mqttGatewayService.getStatus());
};

const getMessages = async (req, res, next) => {
  try {
    if (respondIfPostgresNotReady(res)) {
      return;
    }

    const persistedMessages = await postgresPersistenceService.getMessages();
    res.json(persistedMessages);
  } catch (error) {
    next(error);
  }
};

const getSummary = async (req, res, next) => {
  try {
    if (respondIfPostgresNotReady(res)) {
      return;
    }

    const summary = await postgresPersistenceService.getDashboardSummary();
    res.json(summary);
  } catch (error) {
    next(error);
  }
};

const getLive = (req, res) => {
  const rawLive = mqttGatewayService.getMessages() || [];
  const latestByDevice = new Map();

  rawLive.forEach((message) => {
    const normalized = postgresPersistenceService.normalizeLiveMessage(
      message,
      mqttGatewayService.mqttConfig.brokerUrl
    );
    const deviceKey = normalized.deviceUid || normalized.topic || 'Energy';
    const phaseCurrents = [normalized.iR, normalized.iY, normalized.iB]
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
    const currentMax = phaseCurrents.length > 0 ? Math.max(...phaseCurrents) : 0;
    const directKw = Number(normalized.kwT);
    const isOnline = currentMax > 0 || (Number.isFinite(directKw) && directKw > 0);

    if (!latestByDevice.has(deviceKey)) {
      latestByDevice.set(deviceKey, {
        deviceUid: normalized.deviceUid || deviceKey,
        topic: normalized.topic,
        messageTimestamp: normalized.messageTimestamp,
        meterTimestamp: normalized.meterTimestamp ?? null,
        isOnline,
      });
    }
  });

  res.json({
    connection: mqttGatewayService.getStatus(),
    devices: Array.from(latestByDevice.values()),
    liveMessageCount: rawLive.length,
  });
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
  getSummary,
  getLive,
  updateConfig,
  publishMessage,
  clearHistory,
};
