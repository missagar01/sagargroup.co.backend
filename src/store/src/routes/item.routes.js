import { Router } from "express";
import { getItems } from "../controllers/item.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
const router = Router();

router.get("/", authenticate, getItems);



export default router;
