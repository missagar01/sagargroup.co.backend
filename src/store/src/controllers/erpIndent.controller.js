// src/controllers/erpIndent.controller.js
import * as erpIndentService from "../services/erpIndent.service.js";

export async function getUserErpIndents(req, res) {
  try {
    // Get employee_id from query or req.user (if populated by middleware)
    const employeeId = req.user?.employee_id || req.query.employeeId;

    if (!employeeId) {
      return res.status(400).json({ success: false, error: "Employee ID is required" });
    }

    console.log(`[erpIndent.controller.js] Fetching ERP indents for employeeId: ${employeeId}`);
    const rows = await erpIndentService.getUserErpIndents(employeeId);
    console.log(`[erpIndent.controller.js] Found ${rows.length} rows`);

    return res.json({
      success: true,
      total: rows.length,
      data: rows,
    });
  } catch (err) {
    console.error("getUserErpIndents error:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Internal server error",
    });
  }
}
