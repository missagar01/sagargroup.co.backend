const { Router } = require("express");
const {
  fetchDashboardSummary,
  fetchAnalyticsMetrics,
  fetchCustomerDispatchTiers,
} = require("../controllers/dashboard.controller.js");
const { fetchCustomerFeedback } = require("../controllers/customerFeedback.controller.js");
const asyncHandler = require("../utils/asyncHandler.js");

const router = Router();

router.get("/summary", asyncHandler(fetchDashboardSummary));
router.get("/metrics", asyncHandler(fetchAnalyticsMetrics));
router.get("/customer-feedback", asyncHandler(fetchCustomerFeedback));
router.get("/dispatch-tiers", asyncHandler(fetchCustomerDispatchTiers));

module.exports = router;





