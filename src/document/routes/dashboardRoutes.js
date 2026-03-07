import express from "express";
import {
  getAllSubscriptions,
  getMySubscriptions,
  getDashboardStats
} from "../controllers/dashboardController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// ADMIN
router.get("/all", authMiddleware, getAllSubscriptions);

// USER + ADMIN
router.get("/mine", authMiddleware, getMySubscriptions);

// DASHBOARD DATA
router.get("/dashboard", authMiddleware, getDashboardStats);

router.get("/dashboards", getDashboardStats);
router.get("/dashboard-all", getAllSubscriptions);



export default router;
