import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
    getGatePasses,
    closeGatePass
} from "../controllers/closePassController.js";

const router = express.Router();

// router.use(protect);
router.get("/", getGatePasses);
router.patch("/:id", closeGatePass);

export default router;
