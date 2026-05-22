const mqttGatewayService = require('../services/mqttGatewayService');

const registerSocketHandlers = (io) => {
  io.on('connection', (socket) => {
    console.log(`WebSocket client connected: ${socket.id}`);
    mqttGatewayService.attachSocket(socket);

    socket.on('disconnect', () => {
      console.log(`WebSocket client disconnected: ${socket.id}`);
    });
  });
};

module.exports = { registerSocketHandlers };
