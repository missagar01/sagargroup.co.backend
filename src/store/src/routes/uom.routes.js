// src/routes/uom.routes.js
import { Router } from "express";
import { getUomItems } from "../controllers/uom.controller.js";
// import { authenticate } from "../middlewares/auth.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";
const router = Router();

// GET http://localhost:3004/uom
router.get("/",authenticate, getUomItems);
// or if you want auth:
// router.get("/", authenticate, getUomItems);

export default router;
