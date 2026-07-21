import express from "express";
import {
    createAnnouncement,
    getAnnouncements,
    getAnnouncementById,
    updateAnnouncement,
    deleteAnnouncement,
} from "../controllers/announcementController.js";
import { protect, authorizePageAccess } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/", getAnnouncements);
router.get("/:id", getAnnouncementById);
router.post("/", authorizePageAccess("Announcements", "/checklist/announcements"), createAnnouncement);
router.put("/:id", authorizePageAccess("Announcements", "/checklist/announcements"), updateAnnouncement);
router.delete("/:id", authorizePageAccess("Announcements", "/checklist/announcements"), deleteAnnouncement);

export default router;
