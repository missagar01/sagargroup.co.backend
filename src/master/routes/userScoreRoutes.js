import express from "express";
import {
    getAllUserScores,
    getUserScoreById
} from "../controllers/userScoreController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/test", (req, res) => {
    res.json({ message: "User score routes are working!" });
});

/**
 * GET ALL USERS
 * /api/user-scores?startDate=2025-12-01&endDate=2026-01-01
 */
router.get("/", authorize("admin"), getAllUserScores);

/**
 * GET SINGLE USER
 * /api/user-scores/:id?startDate=2025-12-01&endDate=2026-01-01
 */
router.get("/:id", getUserScoreById);

export default router;
