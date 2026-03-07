import express from "express";
import {
    getUsers,
    getUserById,
    patchSystemAccess,
} from "../controllers/settingController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/users", authorize("admin"), getUsers);
router.get("/users/:id", getUserById);
router.patch("/users/:id/system_access", authorize("admin"), patchSystemAccess);

export default router;
