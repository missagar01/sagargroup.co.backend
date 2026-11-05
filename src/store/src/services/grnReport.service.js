import { getConnection } from "../config/db.js";
import oracledb from "oracledb";
import { getOrSetCache, cacheKeys, DEFAULT_TTL } from "./redisCache.js";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function getFirstDayOfCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDateInput(value, fallback) {
  if (!value || !ISO_DATE_PATTERN.test(String(value).trim())) {
    return fallback;
  }

  return String(value).trim();
}

function resolveDateRange(fromDate, toDate) {
  const safeFromDate = normalizeDateInput(fromDate, getFirstDayOfCurrentMonth());
  const safeToDate = normalizeDateInput(toDate, getTodayDateString());

  if (safeFromDate <= safeToDate) {
    return { fromDate: safeFromDate, toDate: safeToDate };
  }

  return { fromDate: safeToDate, toDate: safeFromDate };
}

const GRN_REPORT_QUERY = `
  SELECT
    lhs_utility.get_name('div_code', t.div_code) AS division,
    lhs_utility.get_name('dept_code', t.dept_code) AS department,
    lhs_utility.get_name('cost_code', t.cost_code) AS cost_center,
    TO_CHAR(t.vrdate, 'yyyy-mm-dd') AS grn_date,
    t.vrno AS grn_no,
    t.item_name,
    t.um,
    NVL(SUM(NVL(t.partyqty, 0)), 0) AS challan_qty,
    NVL(SUM(NVL(t.qtyrecd, 0)), 0) AS accepted_qty,
    SUM(NVL(t.afield1, 0)) AS net_material_value,
    NVL(SUM(NVL(t.cramt, 0)), 0) AS bill_pass_amount,
    SUM(NVL(t.tax_amount, 0) + NVL(t.tax_amount1, 0)) AS total_tax_value
  FROM view_itemtran_engine t
  WHERE t.entity_code = 'SR'
    AND t.series = 'G3'
    AND t.item_nature = 'SI'
    AND t.vrdate >= TO_DATE(:fromDate, 'YYYY-MM-DD')
    AND t.vrdate < TO_DATE(:toDate, 'YYYY-MM-DD') + 1
  GROUP BY t.div_code, t.dept_code, t.cost_code, t.vrdate, t.vrno, t.item_name, t.um
  ORDER BY
    lhs_utility.get_name('div_code', t.div_code) ASC,
    lhs_utility.get_name('dept_code', t.dept_code) ASC,
    lhs_utility.get_name('cost_code', t.cost_code) ASC,
    t.vrdate ASC
`;

export async function getGrnReportRecords(options = {}) {
  const { fromDate, toDate } = resolveDateRange(options.fromDate, options.toDate);

  return getOrSetCache(
    cacheKeys.grnReport(fromDate, toDate),
    async () => {
      const conn = await getConnection();

      try {
        const result = await conn.execute(
          GRN_REPORT_QUERY,
          { fromDate, toDate },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        return result.rows || [];
      } catch (error) {
        console.error("Error fetching GRN report records:", error);
        throw error;
      } finally {
        if (conn) {
          try {
            await conn.close();
          } catch (closeError) {
            console.error("Error closing Store Oracle connection:", closeError);
          }
        }
      }
    },
    DEFAULT_TTL.GRN_REPORT
  );
}

export { resolveDateRange as resolveGrnReportDateRange };
