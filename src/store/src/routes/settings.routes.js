import express from "express";
import {
    getUsers,
    patchStoreAccess
} from "../controllers/settings.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/users", authenticate, getUsers);
router.patch("/users/:id/store-access", authenticate, patchStoreAccess);

export default router;
