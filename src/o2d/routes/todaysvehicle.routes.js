const { Router } = require("express");
const {
  fetchTodaysVehicles,
} = require("../controllers/todaysvehicle.controller.js");

const router = Router();

router.get("/", fetchTodaysVehicles);

module.exports = router;
