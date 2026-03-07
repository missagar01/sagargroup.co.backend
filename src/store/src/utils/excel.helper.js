const EXCEL_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DEFAULT_SHEET_NAME = "Report";
const CSV_MIME = "text/csv; charset=utf-8";

let excelJsPromise;

async function getExcelJs() {
  if (!excelJsPromise) {
    excelJsPromise = import("exceljs")
      .then((module) => module.default ?? module)
      .catch(() => null);
  }
  return excelJsPromise;
}

function normalizeColumns(columns = []) {
  return columns.map((column) => ({
    width: column.width ?? 20,
    header: column.header,
    key: column.key,
    style: column.style,
  }));
}

export async function createWorkbook(rows = [], columns = [], sheetName) {
  const ExcelJS = await getExcelJs();
  if (!ExcelJS) return null;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Store Backend";
  const sheet = workbook.addWorksheet(sheetName ?? DEFAULT_SHEET_NAME);
  sheet.columns = normalizeColumns(columns);
  sheet.addRows(rows);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  return workbook;
}

function safeFileName(value) {
  const replaced = String(value ?? "").replace(/"/g, "'");
  return replaced;
}

function buildDispositionHeader(fileName) {
  const safeName = safeFileName(fileName);
  const encodedName = encodeURIComponent(safeName);
  return `attachment; filename="${safeName}"; filename*=UTF-8''${encodedName}`;
}

export async function streamWorkbook(res, workbook, fileName) {
  res.setHeader("Content-Type", EXCEL_MIME);
  res.setHeader("Content-Disposition", buildDispositionHeader(fileName));
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
  await workbook.xlsx.write(res);
  res.end();
}

function toCsvValue(value) {
  if (value === null || value === undefined) return "";
  const stringValue = String(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
}

function rowsToCsv(rows = [], columns = []) {
  const keys = columns.map((column) => column.key);
  const header = columns.map((column) => toCsvValue(column.header ?? column.key)).join(",");
  const lines = rows.map((row) => keys.map((key) => toCsvValue(row?.[key])).join(","));
  return [header, ...lines].join("\n");
}

async function streamCsv(res, rows, columns, fileName) {
  const csvFileName = String(fileName || "report.csv").replace(/\.xlsx$/i, ".csv");
  const content = rowsToCsv(rows, columns);
  res.setHeader("Content-Type", CSV_MIME);
  res.setHeader("Content-Disposition", buildDispositionHeader(csvFileName));
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
  res.send(content);
}

export async function sendRowsAsExcel(res, options) {
  const workbook = await createWorkbook(
    options.rows,
    options.columns,
    options.sheetName
  );
  if (!workbook) {
    await streamCsv(res, options.rows, options.columns, options.fileName);
    return;
  }

  await streamWorkbook(res, workbook, options.fileName);
}

export function buildDownloadFilename(baseName) {
  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const normalized = String(baseName ?? "export").replace(/\s+/g, "-");
  return `${normalized}-${now}.xlsx`;
}
