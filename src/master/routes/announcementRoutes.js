import express from "express";
import {
    createAnnouncement,
    getAnnouncements,
    getAnnouncementById,
    updateAnnouncement,
    deleteAnnouncement,
} from "../controllers/announcementController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/", getAnnouncements);
router.get("/:id", getAnnouncementById);
router.post("/", authorize("admin"), createAnnouncement);
router.put("/:id", authorize("admin"), updateAnnouncement);
router.delete("/:id", authorize("admin"), deleteAnnouncement);

export default router;
