import { getConnection } from './src/config/db.js';
import oracledb from 'oracledb';

const DASHBOARD_ORACLE_START_SQL = "DATE '2025-04-01'";
const ORACLE_EXECUTE_OPTIONS = { outFormat: oracledb.OUT_FORMAT_OBJECT };

function toNumber(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchOracleDashboardSummary() {
  const conn = await getConnection();
  try {
    const startTime = Date.now();
    console.log('Fetching summary metrics...');
    const statusRows = await conn.execute(
      `
        SELECT
          COUNT(*) AS TOTAL_INDENTS,
          COUNT(CASE WHEN t.po_no IS NOT NULL THEN 1 END) AS COMPLETED_INDENTS,
          COUNT(CASE WHEN t.po_no IS NULL AND t.cancelleddate IS NULL THEN 1 END) AS PENDING_INDENTS,
          COUNT(CASE WHEN t.po_no IS NULL AND t.cancelleddate IS NULL AND t.vrdate >= SYSDATE - 7 THEN 1 END) AS UPCOMING_INDENTS,
          COUNT(CASE WHEN t.po_no IS NULL AND t.cancelleddate IS NULL AND t.vrdate < SYSDATE - 30 THEN 1 END) AS OVERDUE_INDENTS,
          NVL(SUM(NVL(t.qtyindent, 0)), 0) AS TOTAL_INDENTED_QTY
        FROM view_indent_engine t
        WHERE t.entity_code = 'SR'
          AND t.vrdate >= ${DASHBOARD_ORACLE_START_SQL}
      `,
      [],
      ORACLE_EXECUTE_OPTIONS
    );
    console.log(`Status rows fetched in ${Date.now() - startTime}ms`);

    const startPoTime = Date.now();
    const purchaseRows = await conn.execute(
      `
        SELECT
          COUNT(*) AS TOTAL_PURCHASE_ORDERS,
          NVL(SUM(NVL(t.qtyorder, 0)), 0) AS TOTAL_PURCHASED_QTY
        FROM view_order_engine t
        WHERE t.entity_code = 'SR'
          AND t.series = 'U3'
          AND t.qtycancelled IS NULL
          AND t.vrdate >= ${DASHBOARD_ORACLE_START_SQL}
          AND (
            (t.qtyorder - t.qtyexecute) = 0
            OR (t.qtyorder - t.qtyexecute) > t.qtyorder
          )
      `,
      [],
      ORACLE_EXECUTE_OPTIONS
    );
    console.log(`Purchase rows fetched in ${Date.now() - startPoTime}ms`);

    let totalIssuedQuantity = 0;
    try {
      const issueRows = await conn.execute(
        `
          SELECT NVL(SUM(NVL(t.qtyissue, 0)), 0) AS TOTAL_ISSUED_QTY
          FROM view_issue_engine t
          WHERE t.entity_code = 'SR'
            AND t.vrdate >= ${DASHBOARD_ORACLE_START_SQL}
        `,
        [],
        ORACLE_EXECUTE_OPTIONS
      );
      totalIssuedQuantity = toNumber(issueRows.rows?.[0]?.TOTAL_ISSUED_QTY);
    } catch (error) {
      console.warn(
        "[store dashboard] Oracle issue summary failed:",
        error.message || error
      );
    }

    let outOfStockCount = 0;
    try {
      const stockRows = await conn.execute(
        `
          SELECT COUNT(*) AS OUT_OF_STOCK_COUNT
          FROM view_item_stock_engine t
          WHERE t.entity_code = 'SR'
            AND NVL(t.yrclqty_engine, 0) <= 0
            AND NVL(t.yropaqty, 0) > 0
            AND t.item_nature IN ('SI')
        `,
        [],
        ORACLE_EXECUTE_OPTIONS
      );
      outOfStockCount = toNumber(stockRows.rows?.[0]?.OUT_OF_STOCK_COUNT);
    } catch (error) {
      console.warn(
        "[store dashboard] Oracle stock summary failed:",
        error.message || error
      );
    }

    const statusData = statusRows.rows?.[0] || {};
    const purchaseData = purchaseRows.rows?.[0] || {};
    console.log('Result data:', {
      statusData,
      purchaseData,
      totalIssuedQuantity,
      outOfStockCount
    });

  } finally {
    await conn.close();
    process.exit(0);
  }
}

fetchOracleDashboardSummary();
