// controllers/repairGatePass.controller.js
import {
  getPendingRepairGatePass,
  getReceivedRepairGatePass,
  getRepairGatePassCounts,
} from "../services/repairGatePass.service.js";
import {
  buildDownloadFilename,
  sendRowsAsExcel,
} from "../utils/excel.helper.js";

const pendingColumns = [
  { header: "Gate Pass No", key: "VRNO", width: 16 },
  { header: "Date", key: "VRDATE", width: 12 },
  { header: "Department", key: "DEPARTMENT", width: 20 },
  { header: "Party Name", key: "PARTYNAME", width: 25 },
  { header: "Item Name", key: "ITEM_NAME", width: 30 },
  { header: "Item Code", key: "ITEM_CODE", width: 12 },
  { header: "Qty Issued", key: "QTYISSUED", width: 12 },
  { header: "UOM", key: "UM", width: 8 },
  { header: "App Remark", key: "APP_REMARK", width: 25 },
  { header: "Remark", key: "REMARK", width: 30 },
];

function formatDate(dateString) {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function annotateRows(rows = []) {
  return rows.map((row) => ({
    ...row,
    VRDATE: formatDate(row.VRDATE ?? row.vrdate),
  }));
}

export async function getPending(req, res) {
  try {
    const rows = await getPendingRepairGatePass();
    return res.json({
      success: true,
      data: rows,
      total: rows.length,
    });
  } catch (error) {
    console.error("getPending error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch pending repair gate pass",
    });
  }
}

export async function getReceived(req, res) {
  try {
    const rows = await getReceivedRepairGatePass();
    return res.json({
      success: true,
      data: rows,
      total: rows.length,
    });
  } catch (error) {
    console.error("getReceived error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch received repair gate pass",
    });
  }
}

export async function getCounts(req, res) {
  try {
    const counts = await getRepairGatePassCounts();
    return res.json({
      success: true,
      data: counts,
    });
  } catch (error) {
    console.error("getCounts error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch repair gate pass counts",
    });
  }
}

export async function downloadPending(req, res) {
  try {
    const rows = await getPendingRepairGatePass();
    const preparedRows = annotateRows(rows);

    await sendRowsAsExcel(res, {
      rows: preparedRows,
      columns: pendingColumns,
      sheetName: "Pending Repair Gate Pass",
      fileName: buildDownloadFilename("repair-gate-pass-pending"),
    });
  } catch (error) {
    console.error("downloadPending error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to download pending repair gate pass",
    });
  }
}
