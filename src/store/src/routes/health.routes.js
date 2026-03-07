// Health check route
import { Router } from "express";
import { getConnection } from "../config/db.js";

const router = Router();

/**
 * Health check endpoint
 * Checks Oracle database connection
 */
router.get("/", async (req, res) => {
  try {
    // Test Oracle connection
    const conn = await getConnection();
    await conn.close();
    
    return res.json({
      success: true,
      status: "healthy",
      database: "oracle",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(503).json({
      success: false,
      status: "unhealthy",
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

export { router as healthRoutes };
export default router;



