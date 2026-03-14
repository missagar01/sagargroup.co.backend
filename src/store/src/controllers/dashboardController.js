import { fetchDashboardMetricsSnapshot } from "../services/dashboardServices.js";

export const getDashboardMetrics = async (req, res) => {
  try {
    const data = await fetchDashboardMetricsSnapshot();

    console.log(
      `[store dashboard] tasks=${data.tasks.length}, pending=${data.pendingCount}, completed=${data.completedCount}`
    );

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Dashboard Error:", error);
    console.error("Error details:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
      details: error.message,
    });
  }
};
