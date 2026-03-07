// src/controllers/uom.controller.js
import { getUomItemsService } from "../services/uom.service.js";

export async function getUomItems(req, res) {
  try {
    const result = await getUomItemsService();

    if (!result.ok) {
      return res.status(500).json({
        success: false,
        error: result.error || "Failed to fetch Oracle items",
      });
    }

    const data = result.rows.map((row) => ({
      item_code: row.ITEM_CODE,
      item_name: row.ITEM_NAME,
      uom: row.UM,
    }));

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("getUomItems controller error:", err);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}
