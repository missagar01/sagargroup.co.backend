const {
  getGateProcessTimeline,
  getLoadingOrderDetails,
} = require("../services/gateProcess.service.js");

async function fetchGateProcessTimeline(req, res) {
  try {
    const requestedEntity = String(req.query.entity || "SR").trim().toUpperCase();
    const entityCode = requestedEntity || "SR";

    const rows = await getGateProcessTimeline(entityCode);
    res.status(200).json({
      success: true,
      entity: entityCode,
      totalCount: rows.length,
      rows,
    });
  } catch (error) {
    console.error("Failed to fetch O2D gate process timeline:", error);
    res.status(500).json({
      success: false,
      message: "Unable to fetch O2D gate process timeline",
      error: error.message,
    });
  }
}

async function fetchLoadingOrderDetails(req, res) {
  try {
    const requestedEntity = String(req.query.entity || "SR").trim().toUpperCase();
    const entityCode = requestedEntity || "SR";
    const loadingOrderNumber = String(req.params.loadingOrderNumber || "").trim().toUpperCase();

    if (!loadingOrderNumber) {
      return res.status(400).json({
        success: false,
        message: "Loading order number is required",
      });
    }

    const rows = await getLoadingOrderDetails(loadingOrderNumber, entityCode);
    res.status(200).json({
      success: true,
      entity: entityCode,
      loadingOrderNumber,
      totalCount: rows.length,
      rows,
    });
  } catch (error) {
    console.error("Failed to fetch O2D loading order details:", error);
    res.status(500).json({
      success: false,
      message: "Unable to fetch O2D loading order details",
      error: error.message,
    });
  }
}

module.exports = {
  fetchGateProcessTimeline,
  fetchLoadingOrderDetails,
};
