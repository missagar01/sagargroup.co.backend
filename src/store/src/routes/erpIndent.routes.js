// src/routes/erpIndent.routes.js
import { Router } from "express";
import { getUserErpIndents } from "../controllers/erpIndent.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();

router.get("/", authenticate, getUserErpIndents);

export default router;
