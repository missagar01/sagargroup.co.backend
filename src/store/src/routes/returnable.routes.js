// src/routes/returnable.routes.js
import { Router } from "express";
import * as returnableController from "../controllers/returnable.controller.js";

const router = Router();

router.get("/stats", returnableController.getStats);
router.get("/details", returnableController.getDetails);

export default router;
