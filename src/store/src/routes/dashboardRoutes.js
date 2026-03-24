import express from "express";
import {
  getDashboardMetrics,
  getPendingIndents,
  getHistory,
  getPoPending,
  getPoHistory,
  getRepairPending,
  getRepairHistory,
  getReturnableDetails,
} from "../controllers/dashboardController.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = express.Router();

// GET dashboard summary (Consolidated)
router.get("/", authenticate, getDashboardMetrics);

// Individual Endpoints for Testing
router.get("/pending-indents", authenticate, getPendingIndents);
router.get("/history-indents", authenticate, getHistory);
router.get("/po-pending", authenticate, getPoPending);
router.get("/po-history", authenticate, getPoHistory);
router.get("/repair-pending", authenticate, getRepairPending);
router.get("/repair-history", authenticate, getRepairHistory);
router.get("/returnable-details", authenticate, getReturnableDetails);

export default router;
