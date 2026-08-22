const router = require("./router.cjs");
const {
  getSocketCorsOptions,
  initializeIotModule,
  shutdownIotModule,
} = require("./bootstrap");

if (require.main === module) {
  console.log("IoT module is integrated into the main backend server. Use `npm start` or `npm run dev`.");
}

module.exports = {
  router,
  getSocketCorsOptions,
  initializeIotModule,
  shutdownIotModule,
};
