import express from "express";
import {
    createSystem,
    getSystems,
    getSystemById,
    updateSystem,
    deleteSystem,
} from "../controllers/systemsController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.post("/", authorize("admin"), createSystem);
router.get("/", getSystems);
router.get("/:id", getSystemById);
router.put("/:id", authorize("admin"), updateSystem);
router.delete("/:id", authorize("admin"), deleteSystem);

export default router;
