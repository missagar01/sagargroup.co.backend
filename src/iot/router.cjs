const express = require("express");
const dashboardRoutes = require("./src/routes/dashboardRoutes");

const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    message: "MQTT dashboard backend is running",
    endpoints: [
      "/api/iot/status",
      "/api/iot/messages",
      "/api/iot/config",
      "/api/iot/publish",
      "/api/iot/clear-history",
    ],
  });
});

router.use("/", dashboardRoutes);

module.exports = router;
