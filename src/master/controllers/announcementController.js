import announcementService from "../services/announcementService.js";

const normalizeAccessKey = (value) =>
    String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");

const parseDelimitedAccess = (value) => {
    if (!value || typeof value !== "string") {
        return [];
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return [];
    }

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
                return parsed
                    .map((entry) => (typeof entry === "string" ? entry.trim() : String(entry).trim()))
                    .filter(Boolean);
            }
        } catch {
            // Fall back to comma-separated parsing.
        }
    }

    return trimmed
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
};

const hasAnnouncementPageAccess = (user) => {
    const pageAccess = new Set(
        parseDelimitedAccess(user?.page_access).map((entry) => normalizeAccessKey(entry))
    );

    return (
        pageAccess.has(normalizeAccessKey("Announcements")) ||
        pageAccess.has(normalizeAccessKey("/checklist/announcements"))
    );
};

export const createAnnouncement = async (req, res, next) => {
    try {
        const { title, message, start_date, end_date, is_active, priority } = req.body;

        if (!title) {
            const error = new Error("title is required");
            error.statusCode = 400;
            return next(error);
        }

        const announcement = await announcementService.createAnnouncement({
            title,
            message,
            start_date,
            end_date,
            is_active,
            priority,
            created_by: req.user?.id,
        });

        res.status(201).json({ success: true, data: announcement });
    } catch (error) {
        next(error);
    }
};

export const getAnnouncements = async (req, res, next) => {
    try {
        const authUser = req.user;
        const isAdmin = authUser?.role === "admin" || authUser?.user_name === "admin";
        const canViewFullAnnouncementList = isAdmin || hasAnnouncementPageAccess(authUser);

        const data = canViewFullAnnouncementList
            ? await announcementService.getAllAnnouncementsAdmin()
            : await announcementService.getAllAnnouncements();

        res.json({ success: true, count: data.length, data });
    } catch (error) {
        next(error);
    }
};

export const getAnnouncementById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const announcement = await announcementService.getAnnouncementById(id);

        if (!announcement) {
            const error = new Error("Announcement not found");
            error.statusCode = 404;
            return next(error);
        }

        res.json({ success: true, data: announcement });
    } catch (error) {
        next(error);
    }
};

export const updateAnnouncement = async (req, res, next) => {
    try {
        const { id } = req.params;

        const existing = await announcementService.getAnnouncementById(id);
        if (!existing) {
            const error = new Error("Announcement not found");
            error.statusCode = 404;
            return next(error);
        }

        const updated = await announcementService.updateAnnouncement(id, req.body);
        res.json({ success: true, data: updated });
    } catch (error) {
        next(error);
    }
};

export const deleteAnnouncement = async (req, res, next) => {
    try {
        const { id } = req.params;

        const existing = await announcementService.getAnnouncementById(id);
        if (!existing) {
            const error = new Error("Announcement not found");
            error.statusCode = 404;
            return next(error);
        }

        await announcementService.deleteAnnouncement(id);
        res.json({ success: true, message: "Announcement deleted" });
    } catch (error) {
        next(error);
    }
};
