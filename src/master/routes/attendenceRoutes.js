import express from "express";
import { getAttendanceSummary } from "../controllers/attendenceController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);
router.get("/", authorize("admin", "user"), getAttendanceSummary);
export default router;
