// src/controllers/stockController.js
import { fetchItemStock } from "../services/stockService.js";

const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

// JS Date -> "DD-MON-RR"
function toOracleDateFromJs(date) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = MONTHS[date.getMonth()];
  const y = date.getFullYear().toString().slice(-2);
  return `${d}-${m}-${y}`;
}

// "DD-MM-YYYY" -> "DD-MON-RR"
function toOracleFromDdMmYyyy(str) {
  const parts = str.split("-");
  if (parts.length !== 3) return str;
  const [dd, mm, yyyy] = parts;
  const day = dd.padStart(2, "0");
  const monthIndex = Number(mm) - 1;
  const mon = MONTHS[monthIndex] || "JAN";
  const yy = yyyy.slice(-2);
  return `${day}-${mon}-${yy}`;
}

export async function getStock(req, res) {
  try {
    // ⬅️ yahan sirf search, fromDate, toDate le rahe hain
    let { fromDate, toDate, search = "" } = req.query;

    // 🗓 Date handling (same logic as before)
    if (!fromDate || !toDate) {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      fromDate = toOracleDateFromJs(first);
      toDate = toOracleDateFromJs(now);
    } else {
      // Frontend se agar "DD-MM-YYYY" aa raha hai
      if (/^\d{2}-\d{2}-\d{4}$/.test(fromDate)) {
        fromDate = toOracleFromDdMmYyyy(fromDate);
      }
      if (/^\d{2}-\d{2}-\d{4}$/.test(toDate)) {
        toDate = toOracleFromDdMmYyyy(toDate);
      }
    }

    // 🔹 1) Get full rows for this date window (with cache)
    const rows = await fetchItemStock(fromDate, toDate);

    // 🔍 2) Global search on COL1 / COL2 / COL3
    const q = (search || "").trim().toLowerCase();
    let filtered = rows;

    if (q) {
      filtered = rows.filter((r) => {
        const c1 = (r.COL1 || "").toLowerCase(); // ITEM_CODE
        const c2 = (r.COL2 || "").toLowerCase(); // ITEM_NAME
        const c3 = (r.COL3 || "").toLowerCase(); // UOM
        return c1.includes(q) || c2.includes(q) || c3.includes(q);
      });
    }

    const total = filtered.length;

    // ❌ No pagination: send all filtered rows
    res.json({
      success: true,
      fromDate,
      toDate,
      total,
      search: q, // optional, debug ke liye
      data: filtered,
    });
  } catch (err) {
    console.error("getStock error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch item stock from Oracle",
    });
  }
}
