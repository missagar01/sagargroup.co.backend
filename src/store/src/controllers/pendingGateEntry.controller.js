import { getPendingGateEntryRecords } from "../services/pendingGateEntry.service.js";

export async function getPendingGateEntries(req, res) {
  try {
    const { fromDate, toDate } = req.query;
    const rows = await getPendingGateEntryRecords({
      fromDate,
      toDate,
    });

    return res.json({
      success: true,
      data: rows,
      total: rows.length,
      filters: {
        fromDate,
        toDate,
      },
    });
  } catch (error) {
    console.error("getPendingGateEntries error:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch pending gate entry records",
    });
  }
}
