const todaysVehicleService = require("../services/todaysvehicle.service.js");

async function fetchTodaysVehicles(req, res) {
  try {
    const rows = await todaysVehicleService.getTodaysVehicles();
    return res.status(200).json({
      success: true,
      totalCount: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error("Failed to fetch today's vehicles:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch today's vehicles",
      error: error.message,
    });
  }
}

module.exports = { fetchTodaysVehicles };
