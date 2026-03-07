import express from "express";
import {
  getAllTasks,
  updateStoreInDetails
} from "../controllers/storeInController.js";
import upload, { uploadToS3 } from "../middlewares/s3Upload.js";

const router = express.Router();

// Fetch all rows from repair_system
router.get("/all", getAllTasks);

// Update Actual2, Received Quantity, Bill Image, etc.
router.put("/update/:taskNo", updateStoreInDetails);

// ⭐ Upload Product Image to S3
router.post("/upload-product", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.json({ success: false, message: "No file uploaded" });
    }

    const url = await uploadToS3(req.file);
    res.json({ success: true, url });

  } catch (err) {
    console.error("S3 Upload Error:", err);
    res.status(500).json({ success: false, message: "Upload failed" });
  }
});


export default router;
