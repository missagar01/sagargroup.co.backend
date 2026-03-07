import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { getAllUsers, updateUserAccess, getUserAccess } from "../controllers/settingsController.js";
import { adminMiddleware } from "../middleware/adminMiddleware.js";

const router = Router();

// Get all users with access settings
router.get("/users", authMiddleware, adminMiddleware, getAllUsers);

// Get single user access settings
router.get("/users/:id", authMiddleware, adminMiddleware, getUserAccess);

// Update user access settings
router.put("/users/:id/access", authMiddleware, adminMiddleware, updateUserAccess);

export default router;
