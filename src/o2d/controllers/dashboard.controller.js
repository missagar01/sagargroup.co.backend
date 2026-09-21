const { getDashboardData } = require("../services/dashboard.service.js");
const { getCustomerDispatchTiers } = require("../services/dispatchTier.service.js");

async function fetchDashboardSummary(req, res) {
  try {
    // Accept both legacy and simplified param keys from frontend
    const partyName = req.query.partyName || req.query.party || null;
    const itemName = req.query.itemName || req.query.item || null;
    const salesPerson = req.query.salesPerson || req.query.sales || null;
    const stateName = req.query.stateName || req.query.state || null;
    const fromDate = req.query.fromDate || null;
    const toDate = req.query.toDate || null;

    const data = await getDashboardData({
      fromDate,
      toDate,
      partyName,
      itemName,
      salesPerson,
      stateName,
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard summary",
      error: error.message,
    });
  }
}

async function fetchAnalyticsMetrics(req, res) {
  try {
    const { getAnalyticsMetrics } = require("../services/dashboard.service.js");
    const data = await getAnalyticsMetrics();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch analytics metrics",
      error: error.message,
    });
  }
}

async function fetchCustomerDispatchTiers(req, res) {
  try {
    const fromDate = req.query.fromDate || null;
    const toDate = req.query.toDate || null;

    const data = await getCustomerDispatchTiers({
      fromDate,
      toDate,
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("❌ Customer dispatch tiers error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch customer dispatch tiers",
      error: error.message,
    });
  }
}

module.exports = {
  fetchDashboardSummary,
  fetchAnalyticsMetrics,
  fetchCustomerDispatchTiers,
};

