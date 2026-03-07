import express from "express";
import {
  getDashboardMetrics,
} from "../controllers/dashboardController.js";

const router = express.Router();

// GET dashboard summary
router.get("/", getDashboardMetrics);

export default router;
