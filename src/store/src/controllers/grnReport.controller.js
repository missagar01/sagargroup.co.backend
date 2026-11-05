import {
  getGrnReportRecords,
  resolveGrnReportDateRange,
} from "../services/grnReport.service.js";
import {
  buildDownloadFilename,
  sendRowsAsExcel,
} from "../utils/excel.helper.js";

const EXCEL_COLUMNS = [
  { header: "Division", key: "DIVISION", width: 18 },
  { header: "Department", key: "DEPARTMENT", width: 20 },
  { header: "Cost Center", key: "COST_CENTER", width: 18 },
  { header: "GRN Date", key: "GRN_DATE", width: 12 },
  { header: "GRN No", key: "GRN_NO", width: 14 },
  { header: "Item Name", key: "ITEM_NAME", width: 30 },
  { header: "UM", key: "UM", width: 8 },
  { header: "Challan Qty", key: "CHALLAN_QTY", width: 14 },
  { header: "Accepted Qty", key: "ACCEPTED_QTY", width: 14 },
  { header: "Net Material Value", key: "NET_MATERIAL_VALUE", width: 18 },
  { header: "Bill Pass Amount", key: "BILL_PASS_AMOUNT", width: 18 },
  { header: "Total Tax Value", key: "TOTAL_TAX_VALUE", width: 16 },
];

export async function getGrnReport(req, res) {
  try {
    const { fromDate, toDate } = req.query;
    const range = resolveGrnReportDateRange(fromDate, toDate);
    const rows = await getGrnReportRecords(range);

    return res.json({
      success: true,
      data: rows,
      total: rows.length,
      filters: range,
    });
  } catch (error) {
    console.error("getGrnReport error:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch GRN report",
    });
  }
}

function toDdMmYyyy(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ""));
  if (!match) return isoDate || "";

  const [, year, month, day] = match;
  return `${day}-${month}-${year}`;
}

function annotateRowsForExcel(rows = []) {
  return rows.map((row) => ({
    ...row,
    GRN_DATE: toDdMmYyyy(row.GRN_DATE),
  }));
}

export async function downloadGrnReport(req, res) {
  try {
    const { fromDate, toDate } = req.query;
    const range = resolveGrnReportDateRange(fromDate, toDate);
    const rows = await getGrnReportRecords(range);

    await sendRowsAsExcel(res, {
      rows: annotateRowsForExcel(rows),
      columns: EXCEL_COLUMNS,
      sheetName: "GRN Report",
      fileName: buildDownloadFilename(`grn-report-${range.fromDate}-to-${range.toDate}`),
    });
  } catch (error) {
    console.error("downloadGrnReport error:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Failed to download GRN report",
    });
  }
}
