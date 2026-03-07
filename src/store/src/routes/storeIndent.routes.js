// src/routes/storeIndent.routes.js
import { Router } from "express";
import {
  createStoreIndent,
  approveStoreIndent,
  getPendingIndents,
  getHistory,
  getDashboard,
  downloadPendingIndents,
  downloadHistoryIndents,
  getAllVendors,
  getAllProducts,
} from "../controllers/storeIndent.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/", createStoreIndent);
router.put("/approve", approveStoreIndent);
router.get("/pending", authenticate, getPendingIndents);
router.get("/pending/download", authenticate, downloadPendingIndents);
router.get("/history", authenticate, getHistory);
router.get("/history/download", authenticate, downloadHistoryIndents);
router.get("/dashboard", authenticate, getDashboard);
router.get("/vendors", authenticate, getAllVendors);
router.get("/products", authenticate, getAllProducts);

export default router;
