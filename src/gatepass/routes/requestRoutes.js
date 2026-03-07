import express from "express";
import upload from "../middleware/s3Upload.js";
import { protect } from "../middleware/authMiddleware.js";
import { createVisitRequest, getAllVisitsForAdmin, getVisitorByMobile } from "../controllers/requestController.js";

const router = express.Router();

router.use(protect);
router.post("/", upload.single("photoData"), createVisitRequest);
router.get("/by-mobile/:mobile", getVisitorByMobile);
router.get("/admin", getAllVisitsForAdmin);

export default router;
