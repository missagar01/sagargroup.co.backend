import express from "express";
import {
    getTotalTask,
    getCompletedTask,
    getPendingTask,
    getPendingToday,
    getCompletedToday,
    getOverdueTask,
} from "../controllers/dashboardController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

// COUNT APIs
router.get("/pendingtoday", getPendingToday);
router.get("/completedtoday", getCompletedToday);
router.get("/total", getTotalTask);
router.get("/completed", getCompletedTask);
router.get("/pending", getPendingTask);
router.get("/overdue", getOverdueTask);

export default router;
