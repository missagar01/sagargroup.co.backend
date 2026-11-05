import { Router } from "express";
import { getGrnReport, downloadGrnReport } from "../controllers/grnReport.controller.js";

const router = Router();

router.get("/", getGrnReport);
router.get("/download", downloadGrnReport);

export default router;
