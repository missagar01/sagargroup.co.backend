import { Router } from "express";
import { getStoreGRNPending } from "../controllers/storeGRN.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();

/**
 * @route   GET /store-grn/pending
 * @desc    Fetch pending Store GRN records
 * @access  Protected
 */
router.get("/pending", getStoreGRNPending);

export default router;
