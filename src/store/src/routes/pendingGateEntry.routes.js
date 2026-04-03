import { Router } from "express";
import { getPendingGateEntries } from "../controllers/pendingGateEntry.controller.js";

const router = Router();

router.get("/", getPendingGateEntries);

export default router;
