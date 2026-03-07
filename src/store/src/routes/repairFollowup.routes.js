import express from "express";
import {
    create,
    getAll,
    getById,
    update,
    remove,
    updateStage2
} from "../controllers/repairFollowup.controller.js";

// import { authenticate } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/", create);
router.get("/", getAll);
router.get("/:id", getById);
router.put("/:id", update);
router.delete("/:id", remove);
router.patch("/:id/stage2", updateStage2);
export default router;
