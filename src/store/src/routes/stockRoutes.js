// src/routes/stockRoutes.js
import { Router } from "express";
import { getStock } from "../controllers/stockController.js";

const router = Router();
router.get("/", getStock);
export default router;
