import {
  fetchDashboardMetricsSnapshot,
  fetchDashboardFeedbackSnapshot,
  fetchDashboardPendingIndents,
  fetchDashboardIndentHistory,
  fetchDashboardPoPending,
  fetchDashboardPoHistory,
  fetchDashboardRepairPending,
  fetchDashboardRepairHistory,
  fetchDashboardReturnableDetails,
} from "../services/dashboardServices.js";


export const getDashboardMetrics = async (req, res) => {
  try {
    const data = await fetchDashboardMetricsSnapshot();

    console.log(
      `[store dashboard] tasks=${data.tasks.length}, pending=${data.pendingCount}, completed=${data.completedCount}, totalIndents=${data.summary?.totalIndents || 0}, pendingIndents=${data.summary?.pendingIndents || 0}, totalPurchaseOrders=${data.summary?.totalPurchaseOrders || 0}, pendingPurchaseOrders=${data.summary?.pendingPurchaseOrders || 0}, indentRows=${data.pendingIndents?.length || 0}/${data.historyIndents?.length || 0}, poRows=${data.poPending?.length || 0}/${data.poHistory?.length || 0}`
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

export const getDashboardFeedbacks = async (req, res) => {
  try {
    const data = await fetchDashboardFeedbackSnapshot();
    console.log(`[store dashboard] feedback rows=${data.length}`);

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Dashboard Feedback Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
      details: error.message,
    });
  }
};




export async function getPendingIndents(req, res) {
  try {
    const rows = await fetchDashboardPendingIndents();
    console.log(`[store indent] pending rows=${rows.length}`);

    return res.json({
      success: true,
      total: rows.length,
      data: rows,
    });
  } catch (err) {
    console.error("getPendingIndents error:", err);
    return res
      .status(500)
      .json({ success: false, error: err.message || "Internal server error" });
  }
}

export async function getHistory(req, res) {
  try {
    const rows = await fetchDashboardIndentHistory();
    console.log(`[store indent] history rows=${rows.length}`);

    return res.json({
      success: true,
      total: rows.length,
      data: rows,
    });
  } catch (err) {
    console.error("getHistory error:", err);
    return res
      .status(500)
      .json({ success: false, error: err.message || "Internal server error" });
  }
}

export async function getPoPending(req, res) {
  try {
    const result = await fetchDashboardPoPending();
    console.log(`[store po] pending rows=${result.rows?.length || 0}, total=${result.total || 0}`);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("getPoPending error:", err);
    return res.status(500).json({ success: false, error: err.message || "Internal server error" });
  }
}

export async function getPoHistory(req, res) {
  try {
    const result = await fetchDashboardPoHistory();
    console.log(`[store po] history rows=${result.rows?.length || 0}, total=${result.total || 0}`);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("getPoHistory error:", err);
    return res.status(500).json({ success: false, error: err.message || "Internal server error" });
  }
}

export async function getRepairPending(req, res) {
  try {
    const rows = await fetchDashboardRepairPending();
    return res.json({ success: true, total: rows.length, data: rows });
  } catch (err) {
    console.error("getRepairPending error:", err);
    return res.status(500).json({ success: false, error: err.message || "Internal server error" });
  }
}

export async function getRepairHistory(req, res) {
  try {
    const rows = await fetchDashboardRepairHistory();
    return res.json({ success: true, total: rows.length, data: rows });
  } catch (err) {
    console.error("getRepairHistory error:", err);
    return res.status(500).json({ success: false, error: err.message || "Internal server error" });
  }
}

export async function getReturnableDetails(req, res) {
  try {
    const rows = await fetchDashboardReturnableDetails();
    return res.json({ success: true, total: rows.length, data: rows });
  } catch (err) {
    console.error("getReturnableDetails error:", err);
    return res.status(500).json({ success: false, error: err.message || "Internal server error" });
  }
}
