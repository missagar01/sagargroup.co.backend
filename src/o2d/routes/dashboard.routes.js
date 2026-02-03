const { Router } = require("express");
const { fetchDashboardSummary, fetchAnalyticsMetrics } = require("../controllers/dashboard.controller.js");
const asyncHandler = require("../utils/asyncHandler.js");

const router = Router();

router.get("/summary", asyncHandler(fetchDashboardSummary));
router.get("/metrics", asyncHandler(fetchAnalyticsMetrics));


module.exports = router;




