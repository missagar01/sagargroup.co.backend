// src/controllers/storeIndent.controller.js
import * as storeIndentService from "../services/storeIndent.service.js";
import {
  buildDownloadFilename,
  sendRowsAsExcel,
} from "../utils/excel.helper.js";

const pendingIndentDownloadColumns = [
  { header: "Planned Timestamp", key: "PLANNEDTIMESTAMP", width: 22 },
  { header: "Indent Number", key: "INDENT_NUMBER", width: 16 },
  { header: "Indent Date", key: "INDENT_DATE", width: 14 },
  { header: "Indenter", key: "INDENTER_NAME", width: 20 },
  { header: "Division", key: "DIVISION", width: 18 },
  { header: "Department", key: "DEPARTMENT", width: 18 },
  { header: "Item Name", key: "ITEM_NAME", width: 28 },
  { header: "UOM", key: "UM", width: 10 },
  { header: "Required Qty", key: "REQUIRED_QTY", width: 15 },
  { header: "Purpose Remark", key: "REMARK", width: 28 },
  { header: "Specification", key: "SPECIFICATION", width: 28 },
  { header: "Cost Project", key: "COST_PROJECT", width: 20 },
];

const historyIndentDownloadColumns = [
  { header: "Indent No", key: "INDENT_NO", width: 16 },
  { header: "Indent Date", key: "INDENT_DATE", width: 14 },
  { header: "Indenter", key: "INDENTER", width: 20 },
  { header: "Division", key: "DIVISION", width: 18 },
  { header: "Department", key: "DEPARTMENT", width: 18 },
  { header: "Item Code", key: "ITEM_CODE", width: 15 },
  { header: "Item Name", key: "ITEM_NAME", width: 28 },
  { header: "Qty Indent", key: "QTYINDENT", width: 15 },
  { header: "UOM", key: "UM", width: 10 },
  { header: "Acknowledge Date", key: "ACKNOWLEDGEDATE", width: 20 },
  { header: "Purchaser", key: "PURCHASER", width: 20 },
  { header: "PO Number", key: "PO_NUMBER", width: 25 },
  { header: "GRN No", key: "GRN_NO", width: 25 },
  { header: "GRN Date", key: "GRN_DATE", width: 25 },
];

function buildIndentFilename(type) {
  return buildDownloadFilename(`indent-${type}`);
}


export async function createStoreIndent(req, res) {
  try {
    const data = await storeIndentService.create(req.body);

    // data change hone ke baad cache clear
    await storeIndentService.invalidateIndentCaches();

    return res.json({ success: true, ...data });
  } catch (err) {
    console.error("createStoreIndent error:", err);
    return res
      .status(500)
      .json({ success: false, error: err.message || "Internal server error" });
  }
}


export async function approveStoreIndent(req, res) {
  try {
    await storeIndentService.approve(req.body);

    // approve ke baad cache clear
    await storeIndentService.invalidateIndentCaches();

    return res.json({
      success: true,
      message: "Indent approved successfully",
    });
  } catch (err) {
    console.error("approveStoreIndent error:", err);
    return res
      .status(500)
      .json({ success: false, error: err.message || "Internal server error" });
  }
}

export async function getPendingIndents(req, res) {
  try {
    const rows = await storeIndentService.getPending();

    return res.json({
      success: true,
      total: rows.length,
      data: rows,
    });
  } catch (err) {
    console.error("getPendingIndents error:", err);
    return res
      .status(500)
      .json({ success: false, error: err.message || "Internal server error" });
  }
}

export async function getHistory(req, res) {
  try {
    const rows = await storeIndentService.getHistory();

    return res.json({
      success: true,
      total: rows.length,
      data: rows,
    });
  } catch (err) {
    console.error("getHistory error:", err);
    return res
      .status(500)
      .json({ success: false, error: err.message || "Internal server error" });
  }
}

export async function getDashboard(req, res) {
  try {
    const data = await storeIndentService.getDashboardMetrics();
    return res.json({ success: true, data });
  } catch (err) {
    console.error("getDashboard error:", err);
    return res
      .status(500)
      .json({ success: false, error: err.message || "Internal server error" });
  }
}

export async function downloadPendingIndents(req, res) {
  try {
    const rows = await storeIndentService.getPending();
    await sendRowsAsExcel(res, {
      rows,
      columns: pendingIndentDownloadColumns,
      sheetName: "Pending Indents",
      fileName: buildIndentFilename("pending"),
    });
  } catch (err) {
    console.error("downloadPendingIndents error:", err);
    return res
      .status(500)
      .json({ success: false, error: err.message || "Internal server error" });
  }
}

export async function downloadHistoryIndents(req, res) {
  try {
    const rows = await storeIndentService.getHistory();
    await sendRowsAsExcel(res, {
      rows,
      columns: historyIndentDownloadColumns,
      sheetName: "Indent History",
      fileName: buildIndentFilename("history"),
    });
  } catch (err) {
    console.error("downloadHistoryIndents error:", err);
    return res
      .status(500)
      .json({ success: false, error: err.message || "Internal server error" });
  }
}

export async function getAllVendors(req, res) {
  try {
    const data = await storeIndentService.getAllVendors();
    return res.json({ success: true, data });
  } catch (err) {
    console.error("getAllVendors error:", err);
    return res.status(500).json({ success: false, error: err.message || "Internal server error" });
  }
}

export async function getAllProducts(req, res) {
  try {
    const data = await storeIndentService.getAllProducts();
    return res.json({ success: true, data });
  } catch (err) {
    console.error("getAllProducts error:", err);
    return res.status(500).json({ success: false, error: err.message || "Internal server error" });
  }
}
