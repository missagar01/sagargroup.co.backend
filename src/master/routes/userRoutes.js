import express from "express";
import upload from "../middleware/s3Upload2.js";
import { patchEmpImage } from "../controllers/userController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.patch(
    "/:id/emp-image",
    upload.single("emp_image"),
    patchEmpImage
);

export default router;
