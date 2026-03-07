import { Router } from "express";
import {
  getPendingApprovals,
  getApprovalHistory,
  approveVendor,
} from "../controllers/threePartyApproval.controller.js";

const router = Router();

router.get("/pending", getPendingApprovals);
router.get("/history", getApprovalHistory);
router.post("/approve", approveVendor);

export default router;
