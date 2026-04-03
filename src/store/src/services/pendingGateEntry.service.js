import { getConnection } from "../config/db.js";
import oracledb from "oracledb";
import { getOrSetCache, cacheKeys, DEFAULT_TTL } from "./redisCache.js";

const DEFAULT_FROM_DATE = "2026-04-01";
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const PENDING_GATE_ENTRY_QUERY = `
  SELECT
    TO_CHAR(t.vrdate, 'yyyy-mm-dd') AS gate_entry_date,
    t.vrno AS gate_entry_number,
    lhs_utility.get_name('acc_code', t.acc_code) AS supplier,
    t.item_name,
    t.um,
    a.vrdate AS grn_date,
    a.vrno AS grn_number,
    lhs_utility.get_name('div_code', a.div_code) AS division,
    UPPER(lhs_utility.get_name('dept_code', a.dept_code)) AS department,
    lhs_utility.get_name('cost_code', a.cost_code) AS cost_center,
    NVL(a.order_qty, 0) AS order_qty,
    NVL(a.partyqty, 0) AS challan_qty,
    NVL(a.reachedqty, 0) AS reached_qty,
    NVL(a.qtyrecd, 0) AS accepted_qty,
    NVL(a.cramt, 0) AS bill_pass_amount,
    TO_CHAR(a.inspecteddate, 'yyyy-mm-dd') AS inspect_date,
    lhs_utility.get_name('user_code', a.inspectedby) AS inspection_officer
  FROM view_gatetran_engine t
  LEFT JOIN (
    SELECT *
    FROM (
      SELECT
        a.*,
        ROW_NUMBER() OVER (
          PARTITION BY a.vrno, a.item_code, a.entity_code
          ORDER BY a.vrdate DESC
        ) AS rn
      FROM view_itemtran_engine a
    )
    WHERE rn = 1
  ) a
    ON a.vrno = t.grn_vrno
   AND a.item_code = t.item_code
   AND a.entity_code = t.entity_code
  WHERE t.entity_code = 'SR'
    AND t.series = 'S4'
    AND t.vrdate >= TO_DATE(:fromDate, 'YYYY-MM-DD')
    AND t.vrdate < TO_DATE(:toDate, 'YYYY-MM-DD') + 1
  ORDER BY t.vrdate ASC
`;

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
  const safeFromDate = normalizeDateInput(fromDate, DEFAULT_FROM_DATE);
  const safeToDate = normalizeDateInput(toDate, getTodayDateString());

  if (safeFromDate <= safeToDate) {
    return {
      fromDate: safeFromDate,
      toDate: safeToDate,
    };
  }

  return {
    fromDate: safeToDate,
    toDate: safeFromDate,
  };
}

export async function getPendingGateEntryRecords(options = {}) {
  const { fromDate, toDate } = resolveDateRange(
    options.fromDate,
    options.toDate
  );

  return getOrSetCache(
    cacheKeys.pendingGateEntry(fromDate, toDate),
    async () => {
      const conn = await getConnection();

      try {
        const result = await conn.execute(
          PENDING_GATE_ENTRY_QUERY,
          {
            fromDate,
            toDate,
          },
          {
            outFormat: oracledb.OUT_FORMAT_OBJECT,
          }
        );

        return result.rows || [];
      } catch (error) {
        console.error("Error fetching pending gate entry records:", error);
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
    DEFAULT_TTL.GATE_ENTRY
  );
}


