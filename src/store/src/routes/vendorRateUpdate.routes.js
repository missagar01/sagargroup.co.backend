import { Router } from "express";
import {
  vendorRateUpdatePending,
  vendorRateUpdateHistory,
  updateVendorRate,
} from "../controllers/vendorRateUpdate.controller.js";

const router = Router();

// Fetch pending vendor rate updates
router.get("/pending", vendorRateUpdatePending);

// Fetch vendor rate history
router.get("/history", vendorRateUpdateHistory);

// Submit/update vendor rates
router.post("/", updateVendorRate);

export default router;
