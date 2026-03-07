import { uploadToS3 } from "../middleware/s3Upload2.js";
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

        if (!req.file) {
            return res.status(400).json({ message: "Image file is required" });
        }

        // Upload to S3
        const imageUrl = await uploadToS3(req.file);

        // Update DB
        const user = await updateEmpImageService(id, imageUrl);

        res.json({
            message: "Employee image updated successfully",
            user,
        });
    } catch (err) {
        console.error("Patch Emp Image Error:", err.message);
        next(err);
    }
};
