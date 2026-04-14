const { Router } = require("express");
const asyncHandler = require("../utils/asyncHandler.js");
const {
  fetchGateProcessTimeline,
  fetchLoadingOrderDetails,
} = require("../controllers/gateProcess.controller.js");

const router = Router();

router.get("/timeline", asyncHandler(fetchGateProcessTimeline));
router.get(
  "/timeline/:loadingOrderNumber/details",
  asyncHandler(fetchLoadingOrderDetails)
);
router.get(
  "/timeline/:loadingOrderNumber",
  asyncHandler(fetchLoadingOrderDetails)
);

module.exports = router;


