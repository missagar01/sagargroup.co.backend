// src/services/po.service.js
import { getConnection } from "../config/db.js";
import oracledb from "oracledb";
import { getOrSetCache, cacheKeys, DEFAULT_TTL } from "./redisCache.js";

/**
 * 🔹 PENDING PO – full list (no backend pagination)
 * Uses Redis cache for fast retrieval
 */
export async function getPoPending() {
  return await getOrSetCache(
    cacheKeys.poPending(),
    async () => {
      const conn = await getConnection();
      try {
        const sql = `
          SELECT 
        t.duedate + NUMTODSINTERVAL(20,'HOUR') AS PLANNED_TIMESTAMP,
        NVL(a.indent_remark, '') AS INDENTER,
        NVL(a.vrno, '') AS INDENT_NO,
        t.vrno AS VRNO,
        t.vrdate AS VRDATE,
        lhs_utility.get_name('acc_code', t.acc_code) AS VENDOR_NAME,
        t.item_name AS ITEM_NAME,
        t.qtyorder AS QTYORDER,
        t.um AS UM,
        NVL(t.qtyexecute, 0) AS QTYEXECUTE,
        (NVL(t.qtyorder, 0) - NVL(t.qtyexecute, 0)) AS BALANCE_QTY
      FROM view_order_engine t
      LEFT JOIN (
        SELECT DISTINCT vrno, indent_remark 
        FROM view_indent_engine
      ) a ON a.vrno = t.indent_vrno
      WHERE t.entity_code = 'SR'
        AND t.series = 'U3'
        AND NVL(t.qtycancelled, 0) = 0
        AND NVL(t.qtyexecute, 0) < NVL(t.qtyorder, 0)
      ORDER BY t.vrdate DESC, t.vrno DESC
        `;

        const result = await conn.execute(sql, [], {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
        });

        const rows = result.rows || [];

        // Debug logging - check first row
        if (rows.length > 0) {
          const firstRow = rows[0];
          console.log("🔍 PO Pending - First row keys:", Object.keys(firstRow));
          console.log("🔍 PO Pending - INDENT_NO:", firstRow.INDENT_NO);
          console.log("🔍 PO Pending - INDENTER:", firstRow.INDENTER);
        }

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

/**
 * 🔹 HISTORY PO – full list (no backend pagination)
 * Uses Redis cache for fast retrieval
 */
export async function getPoHistory() {
  return await getOrSetCache(
    cacheKeys.poHistory(),
    async () => {
      const conn = await getConnection();
      try {
        const sql = `
          SELECT
        t.duedate + INTERVAL '20' HOUR AS PLANNED_TIMESTAMP,
        NVL(a.indent_remark, '') AS INDENTER,
        NVL(a.vrno, '') AS INDENT_NO,
        t.vrno AS VRNO,
        t.vrdate AS VRDATE,
        lhs_utility.get_name('acc_code', t.acc_code) AS VENDOR_NAME,
        t.item_name AS ITEM_NAME,
        t.qtyorder AS QTYORDER,
        t.um AS UM,
        t.qtyexecute AS QTYEXECUTE
      FROM view_order_engine t
      LEFT JOIN (
        SELECT DISTINCT vrno, indent_remark 
        FROM view_indent_engine
      ) a ON a.vrno = t.indent_vrno
      WHERE t.entity_code = 'SR'
        AND t.series = 'U3'
        AND t.qtycancelled IS NULL
        AND t.vrdate >= '01-apr-2025'
        AND (
          (t.qtyorder - t.qtyexecute) = 0
          OR (t.qtyorder - t.qtyexecute) > t.qtyorder
        )
      ORDER BY t.vrdate DESC, t.vrno DESC
        `;

        const result = await conn.execute(sql, [], {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
        });

        const rows = result.rows || [];

        // Debug logging - check first row
        if (rows.length > 0) {
          const firstRow = rows[0];
          console.log("🔍 PO History - First row keys:", Object.keys(firstRow));
          console.log("🔍 PO History - INDENT_NO:", firstRow.INDENT_NO);
          console.log("🔍 PO History - INDENTER:", firstRow.INDENTER);
        }

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
