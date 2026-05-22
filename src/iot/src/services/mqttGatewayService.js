const mqtt = require('mqtt');
const postgresPersistenceService = require('./postgresPersistenceService');
const { parsePayload } = require('../utils/payloadParser');

const MAX_HISTORY = 200;

class MqttGatewayService {
  constructor() {
    this.io = null;
    this.mqttClient = null;
    this.mqttStatus = 'disconnected';
    this.mqttError = null;
    this.messageHistory = [];
    this.mqttConfig = {
      brokerUrl: '',
      topics: ['sagarpipe'],
      username: '',
      password: '',
    };
  }

  initialize({ io, brokerUrl, username, password, topics }) {
    this.io = io;
    this.mqttConfig = {
      brokerUrl,
      topics: (Array.isArray(topics) && topics.length > 0) ? topics : ['sagarpipe'],
      username,
      password,
    };

    this.connect();
  }

  attachSocket(socket) {
    socket.emit('mqtt_status', this.getStatus());
    socket.emit('mqtt_history', this.getMessages());
  }

  getStatus() {
    return {
      status: this.mqttStatus,
      brokerUrl: this.mqttConfig.brokerUrl,
      topics: this.mqttConfig.topics,
      error: this.mqttError,
      historyCount: this.messageHistory.length,
      database: postgresPersistenceService.getStatus(),
    };
  }

  getMessages() {
    return this.messageHistory;
  }

  updateConfig(config) {
    const { brokerUrl, topics, username, password } = config;

    if (brokerUrl) {
      this.mqttConfig.brokerUrl = brokerUrl;
    }

    if (Array.isArray(topics) && topics.length > 0) {
      this.mqttConfig.topics = topics;
    }

    if (username !== undefined) {
      this.mqttConfig.username = username;
    }

    if (password !== undefined) {
      this.mqttConfig.password = password;
    }

    this.connect();

    return {
      message: 'Configuration updated, reconnecting...',
      config: { ...this.mqttConfig },
      status: this.mqttStatus,
    };
  }

  publishMessage({ topic, message, qos = 0, retain = false }) {
    if (!topic || message === undefined) {
      const error = new Error('Topic and message are required');
      error.statusCode = 400;
      throw error;
    }

    if (!this.mqttClient || this.mqttStatus !== 'connected') {
      const error = new Error('MQTT client not connected');
      error.statusCode = 503;
      throw error;
    }

    const payload = typeof message === 'object' ? JSON.stringify(message) : String(message);

    return new Promise((resolve, reject) => {
      this.mqttClient.publish(topic, payload, { qos, retain }, (err) => {
        if (err) {
          const error = new Error('Failed to publish message');
          error.statusCode = 500;
          error.details = err.message;
          reject(error);
          return;
        }

        resolve({ success: true, message: 'Message published successfully' });
      });
    });
  }

  clearHistory() {
    this.messageHistory.length = 0;
    this.emit('history_cleared');

    return { success: true, message: 'History cleared' };
  }

  shutdown() {
    if (!this.mqttClient) {
      return;
    }

    this.mqttClient.end(true);
    this.mqttClient = null;
  }

  connect() {
    if (this.mqttClient) {
      console.log('Closing existing MQTT client connection...');
      this.mqttClient.end(true);
    }

    this.mqttStatus = 'connecting';
    this.mqttError = null;
    this.emit('mqtt_status', this.getStatus());

    console.log(`Connecting to MQTT broker at: ${this.mqttConfig.brokerUrl}`);

    const options = {
      connectTimeout: 5000,
      reconnectPeriod: 5000,
    };

    if (this.mqttConfig.username) {
      options.username = this.mqttConfig.username;
    }

    if (this.mqttConfig.password) {
      options.password = this.mqttConfig.password;
    }

    try {
      this.mqttClient = mqtt.connect(this.mqttConfig.brokerUrl, options);
      this.registerMqttListeners();
    } catch (err) {
      this.handleFailure('Failed to initialize MQTT connection:', err);
    }
  }

  registerMqttListeners() {
    this.mqttClient.on('connect', () => {
      this.mqttStatus = 'connected';
      this.mqttError = null;
      console.log('MQTT Client connected successfully.');
      this.emit('mqtt_status', this.getStatus());

      this.mqttConfig.topics.forEach((topic) => {
        this.mqttClient.subscribe(topic, (err) => {
          if (err) {
            console.error(`Failed to subscribe to topic ${topic}:`, err);
            return;
          }

          console.log(`Subscribed to topic: ${topic}`);
        });
      });
    });

    this.mqttClient.on('message', (topic, messageBuffer) => {
      this.handleIncomingMessage(topic, messageBuffer);
    });

    this.mqttClient.on('error', (err) => {
      this.mqttStatus = 'error';
      this.mqttError = err.message;
      console.error('MQTT Client error:', err);
      this.emit('mqtt_status', this.getStatus());
    });

    this.mqttClient.on('offline', () => {
      this.mqttStatus = 'offline';
      this.mqttError = 'Client went offline';
      console.warn('MQTT Client went offline.');
      this.emit('mqtt_status', this.getStatus());
    });

    this.mqttClient.on('close', () => {
      if (this.mqttStatus !== 'connecting') {
        this.mqttStatus = 'disconnected';
      }

      console.log('MQTT Connection closed.');
      this.emit('mqtt_status', this.getStatus());
    });
  }

  handleIncomingMessage(topic, messageBuffer) {
    const timestamp = new Date().toISOString();
    const rawPayload = messageBuffer.toString();
    const { payload: parsedPayload } = parsePayload(rawPayload);

    const messageItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      topic,
      payload: parsedPayload,
      raw: rawPayload,
      timestamp,
    };

    this.messageHistory.unshift(messageItem);

    if (this.messageHistory.length > MAX_HISTORY) {
      this.messageHistory.pop();
    }

    this.emit('mqtt_message', messageItem);
    postgresPersistenceService.enqueueMessage(messageItem, this.mqttConfig.brokerUrl);
  }

  handleFailure(label, err) {
    this.mqttStatus = 'error';
    this.mqttError = err.message;
    console.error(label, err);
    this.emit('mqtt_status', this.getStatus());
  }

  emit(eventName, payload) {
    if (!this.io) {
      return;
    }

    this.io.emit(eventName, payload);
  }
}

module.exports = new MqttGatewayService();
