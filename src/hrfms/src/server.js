require('dotenv').config();

const app = require('./app');
const redisClient = require('./config/redis');

const port = process.env.PORT || 3000;

let server;

/**
 * GRACEFUL SHUTDOWN HANDLER
 */
async function shutdown(reason) {
  console.log(`\n🛑 Shutting down server. Reason: ${reason}`);

  if (server) {
    server.close(() => {
      console.log('📝 HTTP server closed');
    });
  }

  try {
    if (redisClient && redisClient.isOpen) {
      // quit() is cleaner than disconnect() as it waits for pending commands
      await redisClient.quit();
      console.log('📝 Redis connection closed');
    }
  } catch (err) {
    console.error('❌ Error during Redis shutdown:', err.message);
  }

  // Give it a small timeout to finish pending tasks
  setTimeout(() => {
    console.log('👋 Goodbye!');
    process.exit(0);
  }, 1000);
}

// POSIX signals for termination
process.on('SIGTERM', () => shutdown('SIGTERM received'));
process.on('SIGINT', () => shutdown('SIGINT received (Ctrl+C)'));

// Process event handlers
process.on('unhandledRejection', (err) => {
  console.error('💥 Unhandled Rejection:', err);
  shutdown('Unhandled Promise Rejection');
});

process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  shutdown('Uncaught Exception');
});

/**
 * START SERVER
 */
server = app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Health check: http://localhost:${port}/health`);
});
