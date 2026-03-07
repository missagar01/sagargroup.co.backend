import express from "express";
import { getAllSubscriptions } from "../controllers/mySubscriptionContorller.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// GET /api/subscriptions
router.get("/", authMiddleware, getAllSubscriptions);

export default router;
