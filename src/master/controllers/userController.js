import { getProfileImageUrl } from "../middleware/s3Upload2.js";
import { updateEmpImageService } from "../services/userService.js";

export const patchEmpImage = async (req, res, next) => {
    try {
        const { id } = req.params;
        const authUser = req.user;

        // AUTH CHECK: User can only update their own image, unless they are admin
        const isAdmin = authUser.role === "admin" || authUser.user_name === "admin";
        if (!isAdmin && String(authUser.id) !== String(id)) {
            const error = new Error("Forbidden: You can only update your own profile image");
            error.statusCode = 403;
            return next(error);
        }

        // If file was uploaded via multipart, build URL path from disk file
        // Otherwise fall back to body (for URL string sent directly)
        let profileImageUrl;

        if (req.file) {
            // File uploaded — build /uploads/users/filename URL
            profileImageUrl = getProfileImageUrl(req.file);
        } else if (req.body?.profile_img) {
            profileImageUrl = req.body.profile_img.trim();
        }

        if (!profileImageUrl || typeof profileImageUrl !== "string") {
            return res.status(400).json({ message: "profile_img is required" });
        }

        // Validate: must be a /uploads/ path URL (not a base64 data URL)
        const isValidUrl = profileImageUrl.startsWith("/uploads/");
        if (!isValidUrl) {
            return res.status(400).json({
                message: "profile_img must be a valid upload URL (e.g. /uploads/users/filename.jpg)",
            });
        }

        const user = await updateEmpImageService(id, profileImageUrl);

        res.json({
            message: "Profile image updated successfully",
            user,
        });
    } catch (err) {
        console.error("Patch Emp Image Error:", err.message);
        next(err);
    }
};
