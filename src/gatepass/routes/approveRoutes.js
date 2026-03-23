import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
    getVisitsForApproval,
    updateVisitApproval
} from "../controllers/approveController.js";

const router = express.Router();

// router.use(protect);
router.get("/", getVisitsForApproval);
router.patch("/:id", updateVisitApproval);

export default router;
