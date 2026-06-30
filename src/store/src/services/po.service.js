import { getConnection } from "../config/db.js";
import oracledb from "oracledb";
import { getOrSetCache, cacheKeys, DEFAULT_TTL } from "./redisCache.js";

const DEFAULT_PO_FROM_DATE = "2025-04-01";

function resolvePoFromDate(fromDate) {
  return typeof fromDate === "string" && fromDate.trim()
    ? fromDate.trim()
    : DEFAULT_PO_FROM_DATE;
}

function normalizeCacheScope(fromDate) {
  return resolvePoFromDate(fromDate);
}

export async function getPoPending(fromDate = null) {
  const resolvedFromDate = resolvePoFromDate(fromDate);
  return getOrSetCache(
    cacheKeys.poPending(normalizeCacheScope(resolvedFromDate)),
    async () => {
      const conn = await getConnection();
      try {
        const sql = `
          SELECT 
            t.duedate + NUMTODSINTERVAL(20, 'HOUR') AS PLANNED_TIMESTAMP,
            NVL(a.indent_remark, '') AS INDENTER,
            NVL(a.vrno, '') AS INDENT_NO,
            t.vrno AS VRNO,
            t.vrdate AS VRDATE,
            lhs_utility.get_name('acc_code', t.acc_code) AS VENDOR_NAME,
            t.item_name AS ITEM_NAME,
            NVL(t.cramt, 0) AS POAMOUNT,
            t.qtyorder AS QTYORDER,
            t.um AS UM,
            NVL(t.qtyexecute, 0) AS QTYEXECUTE,
            (NVL(t.qtyorder, 0) - NVL(t.qtyexecute, 0)) AS BALANCE_QTY,
            lhs_utility.get_name('div_code', a.div_code) AS DIVISION_NAME,
            lhs_utility.get_name('dept_code', a.dept_code) AS DEPARTMENT_NAME
          FROM view_order_engine t
          LEFT JOIN (
            SELECT DISTINCT vrno, indent_remark, div_code, dept_code
            FROM view_indent_engine
            WHERE entity_code = 'SR'
          ) a ON a.vrno = t.indent_vrno
          WHERE t.entity_code = 'SR'
            AND t.series = 'U3'
            AND NVL(t.qtycancelled, 0) = 0
            AND t.vrdate >= TO_DATE(:fromDate, 'YYYY-MM-DD')
            AND NVL(t.qtyexecute, 0) < NVL(t.qtyorder, 0)
          ORDER BY t.vrdate DESC, t.vrno DESC
        `;

        const result = await conn.execute(sql, { fromDate: resolvedFromDate }, {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
        });

        const rows = result.rows || [];

        return {
          rows,
          total: rows.length,
        };
      } finally {
        await conn.close();
      }
    },
    DEFAULT_TTL.PO
  );
}

export async function getPoHistory(fromDate = null) {
  const resolvedFromDate = resolvePoFromDate(fromDate);
  return getOrSetCache(
    cacheKeys.poHistory(normalizeCacheScope(resolvedFromDate)),
    async () => {
      const conn = await getConnection();
      try {
        const sql = `
          SELECT
            t.duedate + NUMTODSINTERVAL(20, 'HOUR') AS PLANNED_TIMESTAMP,
            NVL(a.indent_remark, '') AS INDENTER,
            NVL(a.vrno, '') AS INDENT_NO,
            t.vrno AS VRNO,
            t.vrdate AS VRDATE,
            lhs_utility.get_name('acc_code', t.acc_code) AS VENDOR_NAME,
            t.item_name AS ITEM_NAME,
            NVL(t.cramt, 0) AS POAMOUNT,
            t.qtyorder AS QTYORDER,
            t.um AS UM,
            t.qtyexecute AS QTYEXECUTE,
            (NVL(t.qtyorder, 0) - NVL(t.qtyexecute, 0)) AS BALANCE_QTY,
            lhs_utility.get_name('div_code', a.div_code) AS DIVISION_NAME,
            lhs_utility.get_name('dept_code', a.dept_code) AS DEPARTMENT_NAME
          FROM view_order_engine t
          LEFT JOIN (
            SELECT DISTINCT vrno, indent_remark, div_code, dept_code
            FROM view_indent_engine
            WHERE entity_code = 'SR'
          ) a ON a.vrno = t.indent_vrno
          WHERE t.entity_code = 'SR'
            AND t.series = 'U3'
            AND (t.qtycancelled IS NULL OR t.qtycancelled = 0)
            AND t.vrdate >= TO_DATE(:fromDate, 'YYYY-MM-DD')
            AND (NVL(t.qtyorder, 0) - NVL(t.qtyexecute, 0)) <= 0
          ORDER BY t.vrdate DESC, t.vrno DESC
        `;

        const result = await conn.execute(sql, { fromDate: resolvedFromDate }, {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
        });

        const rows = result.rows || [];

        return {
          rows,
          total: rows.length,
        };
      } finally {
        await conn.close();
      }
    },
    DEFAULT_TTL.PO
  );
}
