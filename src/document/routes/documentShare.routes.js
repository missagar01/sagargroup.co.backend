import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { documentShare } from "../controllers/documentShare.controller.js";

const router = express.Router();

router.post("/send", authMiddleware, documentShare);

export default router;
