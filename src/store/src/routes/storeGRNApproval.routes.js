import { Router } from "express";
import {
    getAllStoreGRN,
    sendBill,
    approveByGM,
    closeBill,
} from "../controllers/storeGRNApproval.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();

/* =========================
   ROUTES
========================= */

router.get("/", getAllStoreGRN);

router.post("/send-bill", sendBill);
// router.patch("/approve-admin/:grnNo", approveByAdmin);
router.patch("/approve-gm/:grnNo", approveByGM);
router.patch("/close-bill/:grnNo", closeBill);

export default router;
