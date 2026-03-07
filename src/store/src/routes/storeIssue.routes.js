import { Router } from "express";
import * as storeIssueController from "../controllers/storeIssue.controller.js";

const router = Router();

router.get("/", storeIssueController.getIssues);

export default router;
