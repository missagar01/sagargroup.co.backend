import pool from "../config/postgres.js";
import { getConnection } from "../config/db.js";
import oracledb from "../config/oracleClient.js";
import {
  getOrSetCache,
  setCache,
  deleteCache,
  cacheKeys,
  DEFAULT_TTL,
} from "./redisCache.js";

const DASHBOARD_DEPENDENCY_TIMEOUT_MS = Number(
  process.env.STORE_DASHBOARD_DEPENDENCY_TIMEOUT_MS || 30000
);
const DASHBOARD_ORACLE_CONCURRENCY = Math.max(
  1,
  Number(process.env.STORE_DASHBOARD_ORACLE_CONCURRENCY || 2)
);
const GOOGLE_FEEDBACK_TIMEOUT_MS = Number(
  process.env.STORE_DASHBOARD_FEEDBACK_TIMEOUT_MS || 5000
);
const GOOGLE_FEEDBACK_MAX_ATTEMPTS = Math.max(
  1,
  Number(process.env.STORE_DASHBOARD_FEEDBACK_MAX_ATTEMPTS || 2)
);
const DASHBOARD_ORACLE_START_SQL = "DATE '2025-04-01'";
const DASHBOARD_RETURNABLE_START_SQL = "TO_DATE('01-APR-2025', 'DD-MON-YYYY')";
const ORACLE_EXECUTE_OPTIONS = { outFormat: oracledb.OUT_FORMAT_OBJECT };
const DASHBOARD_CACHE_KEY = "dashboard_cache_v5";

function isMissingTableError(error) {
  return String(error?.message || "").includes("does not exist");
}

function buildEmptyDashboardPayload() {
  return {
    tasks: [],
    pendingCount: 0,
    completedCount: 0,
    totalRepairCost: 0,
    departmentStatus: [],
    paymentTypeDistribution: [],
    vendorWiseCosts: [],
  };
}

function buildPgFallbackRows(type) {
  if (type === "stats") {
    return [
      {
        total_count: 0,
        completed_count: 0,
        pending_count: 0,
        total_repair_cost: 0,
      },
    ];
  }

  return [];
}

function getCurrentMonthStartDate() {
  const currentMonthStart = new Date();
  currentMonthStart.setDate(1);
  currentMonthStart.setHours(0, 0, 0, 0);

  const year = currentMonthStart.getFullYear();
  const month = String(currentMonthStart.getMonth() + 1).padStart(2, "0");
  const day = String(currentMonthStart.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function toNumber(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getDashboardDateSql(fromDate, fallbackSql = DASHBOARD_ORACLE_START_SQL) {
  return fromDate ? "TO_DATE(:fromDate, 'YYYY-MM-DD')" : fallbackSql;
}

function getDashboardBinds(fromDate) {
  return fromDate ? { fromDate } : {};
}

async function withOracleDashboardConnection(task) {
  const conn = await getConnection();
  try {
    return await task(conn);
  } finally {
    await conn.close();
  }
}

async function executeOracleRows(conn, sql, binds = {}) {
  const result = await conn.execute(sql, binds, ORACLE_EXECUTE_OPTIONS);
  return result.rows || [];
}

async function runDashboardPgQuery(label, queryText, fallbackType = "list") {
  try {
    return await pool.query(queryText);
  } catch (error) {
    console.error(
      `[store dashboard] PostgreSQL ${label} query failed:`,
      error.message || error
    );

    return {
      rows: buildPgFallbackRows(fallbackType),
    };
  }
}

function createTimeoutError(label, timeoutMs) {
  const error = new Error(`${label} timed out after ${timeoutMs}ms`);
  error.code = "ETIMEDOUT";
  return error;
}

async function withTimeout(task, timeoutMs, label) {
  let timeoutId;

  try {
    return await Promise.race([
      Promise.resolve().then(task),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(createTimeoutError(label, timeoutMs));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function runDashboardTask(label, task, fallbackValue) {
  try {
    return await withTimeout(task, DASHBOARD_DEPENDENCY_TIMEOUT_MS, label);
  } catch (error) {
    console.error(`[store dashboard] ${label} failed:`, error.message || error);
    return fallbackValue;
  }
}

async function runTasksWithConcurrency(taskFactories, concurrency) {
  const results = new Array(taskFactories.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < taskFactories.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await taskFactories[currentIndex]();
    }
  };

  const workerCount = Math.min(concurrency, taskFactories.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Feedback endpoint returned HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw createTimeoutError("Google Forms feedback fetch", timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeFeedbackRows(json) {
  if (!json || !json.success || !Array.isArray(json.data) || json.data.length <= 1) {
    return [];
  }

  const headers = json.data[0];
  const dataRows = json.data.slice(1).map((row) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });

  return dataRows
    .filter(
      (feedback) =>
        feedback.Timestamp && String(feedback.Timestamp).trim() !== ""
    )
    .sort(
      (a, b) => new Date(b.Timestamp).getTime() - new Date(a.Timestamp).getTime()
    );
}

async function fetchVendorFeedbacks() {
  const endpoint = String(process.env.GOOGLE_FEEDBACK_STORE || "").trim();
  if (!endpoint) {
    return [];
  }

  for (let attempt = 1; attempt <= GOOGLE_FEEDBACK_MAX_ATTEMPTS; attempt += 1) {
    try {
      const url = new URL(endpoint);
      if (attempt > 1) {
        url.searchParams.set("_t", Date.now().toString());
      }

      const json = await fetchJsonWithTimeout(
        url.toString(),
        GOOGLE_FEEDBACK_TIMEOUT_MS
      );

      return normalizeFeedbackRows(json);
    } catch (error) {
      console.warn(
        `[store dashboard] feedback fetch attempt ${attempt}/${GOOGLE_FEEDBACK_MAX_ATTEMPTS} failed:`,
        error.message || error
      );
    }
  }

  return [];
}

function buildReturnableDashboardCte(fromDate = null) {
  const scopedFromDate = getDashboardDateSql(
    fromDate,
    DASHBOARD_RETURNABLE_START_SQL
  );

  return `
    WITH issued_rows AS (
      SELECT
        t.vrno,
        t.vrdate,
        t.series,
        t.acc_code,
        t.item_code,
        t.item_name,
        t.remark,
        t.um,
        t.qtyissued,
        t.mobile,
        t.email
      FROM view_itemtran_engine t
      WHERE t.entity_code = 'SR'
        AND t.series IN ('R3', 'N3')
        AND t.vrdate >= ${scopedFromDate}
    ),
    received_rows AS (
      SELECT
        a.ref1_vrno,
        a.item_code,
        MAX(a.qtyrecd) AS qtyreceived
      FROM view_itemtran_engine a
      WHERE a.entity_code = 'SR'
        AND a.trantype = 'RGP'
        AND a.ref1_vrno IS NOT NULL
        AND a.vrdate >= ${scopedFromDate}
      GROUP BY a.ref1_vrno, a.item_code
    )
  `;
}

function buildTopPurchasedItems(rows) {
  const itemMap = new Map();

  for (const row of rows || []) {
    const itemName = String(row?.ITEM_NAME || row?.item_name || "").trim();
    if (!itemName) {
      continue;
    }

    const existing = itemMap.get(itemName) || {
      itemName,
      orderCount: 0,
      totalOrderQty: 0,
    };

    existing.orderCount += 1;
    existing.totalOrderQty += toNumber(row?.QTYORDER || row?.qtyorder);
    itemMap.set(itemName, existing);
  }

  return Array.from(itemMap.values())
    .sort(
      (a, b) =>
        b.totalOrderQty - a.totalOrderQty || b.orderCount - a.orderCount
    )
    .slice(0, 10);
}

function buildTopVendors(rows) {
  const vendorMap = new Map();

  for (const row of rows || []) {
    const vendorName = String(
      row?.VENDOR_NAME || row?.vendor_name || row?.ACC_NAME || row?.acc_name || ""
    ).trim();

    if (!vendorName) {
      continue;
    }

    const existing = vendorMap.get(vendorName) || {
      vendorName,
      uniquePoCount: 0,
      totalItems: 0,
      _vrnos: new Set(),
    };

    const vrno = String(row?.VRNO || row?.vrno || "").trim();
    if (vrno && !existing._vrnos.has(vrno)) {
      existing._vrnos.add(vrno);
      existing.uniquePoCount += 1;
    }

    existing.totalItems += 1;
    vendorMap.set(vendorName, existing);
  }

  return Array.from(vendorMap.values())
    .map(({ _vrnos, ...vendor }) => vendor)
    .sort(
      (a, b) =>
        b.uniquePoCount - a.uniquePoCount || b.totalItems - a.totalItems
    )
    .slice(0, 10);
}

async function fetchOracleDashboardSummary() {
  return withOracleDashboardConnection(async (conn) => {
    const statusRows = await executeOracleRows(
      conn,
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
      `
    );

    const purchaseRows = await executeOracleRows(
      conn,
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
      `
    );

    const pendingPurchaseRows = await executeOracleRows(
      conn,
      `
        SELECT COUNT(*) AS PENDING_PURCHASE_ORDERS
        FROM view_order_engine t
        WHERE t.entity_code = 'SR'
          AND t.series = 'U3'
          AND NVL(t.qtycancelled, 0) = 0
          AND t.vrdate >= ${DASHBOARD_ORACLE_START_SQL}
          AND NVL(t.qtyexecute, 0) < NVL(t.qtyorder, 0)
      `
    );

    let totalIssuedQuantity = 0;
    try {
      const issueRows = await executeOracleRows(
        conn,
        `
          SELECT NVL(SUM(NVL(t.qtyissue, 0)), 0) AS TOTAL_ISSUED_QTY
          FROM view_issue_engine t
          WHERE t.entity_code = 'SR'
            AND t.vrdate >= ${DASHBOARD_ORACLE_START_SQL}
        `
      );
      totalIssuedQuantity = toNumber(issueRows[0]?.TOTAL_ISSUED_QTY);
    } catch (error) {
      console.warn(
        "[store dashboard] Oracle issue summary failed:",
        error.message || error
      );
    }

    let outOfStockCount = 0;
    try {
      const stockRows = await executeOracleRows(
        conn,
        `
          SELECT COUNT(*) AS OUT_OF_STOCK_COUNT
          FROM view_item_stock_engine t
          WHERE t.entity_code = 'SR'
            AND NVL(t.yrclqty_engine, 0) <= 0
            AND NVL(t.yropaqty, 0) > 0
            AND t.item_nature IN ('SI')
        `
      );
      outOfStockCount = toNumber(stockRows[0]?.OUT_OF_STOCK_COUNT);
    } catch (error) {
      console.warn(
        "[store dashboard] Oracle stock summary failed:",
        error.message || error
      );
    }

    const statusData = statusRows[0] || {};
    const purchaseData = purchaseRows[0] || {};
    const pendingPurchaseData = pendingPurchaseRows[0] || {};
    const totalIndents = toNumber(statusData.TOTAL_INDENTS);
    const completedIndents = toNumber(statusData.COMPLETED_INDENTS);
    const pendingIndents = toNumber(statusData.PENDING_INDENTS);
    const upcomingIndents = toNumber(statusData.UPCOMING_INDENTS);
    const overdueIndents = toNumber(statusData.OVERDUE_INDENTS);

    const roundPercent = (value) => Math.round(value * 10) / 10;
    const overallProgress = totalIndents > 0 ? (completedIndents / totalIndents) * 100 : 0;
    const completedPercent = totalIndents > 0 ? (completedIndents / totalIndents) * 100 : 0;
    const pendingPercent = totalIndents > 0 ? (pendingIndents / totalIndents) * 100 : 0;
    const upcomingPercent = totalIndents > 0 ? (upcomingIndents / totalIndents) * 100 : 0;
    const overduePercent = totalIndents > 0 ? (overdueIndents / totalIndents) * 100 : 0;

    return {
      totalIndents,
      completedIndents,
      pendingIndents,
      upcomingIndents,
      overdueIndents,
      pendingPurchaseOrders: toNumber(
        pendingPurchaseData.PENDING_PURCHASE_ORDERS
      ),
      overallProgress: roundPercent(overallProgress),
      completedPercent: roundPercent(completedPercent),
      pendingPercent: roundPercent(pendingPercent),
      upcomingPercent: roundPercent(upcomingPercent),
      overduePercent: roundPercent(overduePercent),
      totalIndentedQuantity: toNumber(statusData.TOTAL_INDENTED_QTY),
      totalPurchaseOrders: toNumber(purchaseData.TOTAL_PURCHASE_ORDERS),
      totalPurchasedQuantity: toNumber(purchaseData.TOTAL_PURCHASED_QTY),
      totalIssuedQuantity,
      outOfStockCount,
      topPurchasedItems: [],
      topVendors: [],
    };
  });
}

async function fetchOracleDashboardIndentRows(fromDate) {
  const scopedDateSql = getDashboardDateSql(fromDate);
  const binds = getDashboardBinds(fromDate);

  return withOracleDashboardConnection(async (conn) => {
    const pendingRows = await executeOracleRows(
      conn,
      `
        WITH indent_rows AS (
          SELECT
            t.lastupdate + INTERVAL '3' DAY AS plannedtimestamp,
            t.acknowledgedate,
            lhs_utility.get_name('user_code', t.acknowledgeby) AS purchaser,
            t.vrno AS indent_number,
            t.vrdate AS indent_date,
            UPPER(lhs_utility.get_name('emp_code', h.createdby)) AS indenter_name,
            lhs_utility.get_name('div_code', t.div_code) AS division,
            UPPER(lhs_utility.get_name('dept_code', t.dept_code)) AS department,
            UPPER(t.item_name) AS item_name,
            t.um,
            t.qtyindent AS required_qty,
            t.purpose_remark AS remark,
            UPPER(t.remark) AS specification,
            lhs_utility.get_name('cost_code', t.cost_code) AS cost_project
          FROM view_indent_engine t
          LEFT JOIN indent_head h
            ON h.vrno = t.vrno
          WHERE t.entity_code = 'SR'
            AND t.po_no IS NULL
            AND t.cancelleddate IS NULL
            AND t.vrdate >= ${scopedDateSql}
        )
        SELECT
          plannedtimestamp,
          acknowledgedate,
          purchaser,
          indent_number,
          indent_date,
          indenter_name,
          indenter_name AS employee_name,
          division,
          department,
          item_name,
          um,
          required_qty,
          required_qty AS indent_quantity,
          remark,
          specification,
          cost_project
        FROM indent_rows
        ORDER BY indent_date DESC, indent_number DESC
      `,
      binds
    );

    const historyRows = await executeOracleRows(
      conn,
      `
        WITH indent_rows AS (
          SELECT
            t.lastupdate + INTERVAL '3' DAY AS plannedtimestamp,
            t.vrno AS indent_number,
            t.vrdate AS indent_date,
            UPPER(lhs_utility.get_name('emp_code', h.createdby)) AS indenter_name,
            lhs_utility.get_name('div_code', t.div_code) AS division,
            lhs_utility.get_name('dept_code', t.dept_code) AS department,
            t.item_code,
            UPPER(t.item_name) AS item_name,
            t.qtyindent AS required_qty,
            t.um,
            t.acknowledgedate,
            lhs_utility.get_name('user_code', t.acknowledgeby) AS purchaser,
            t.purpose_remark AS remark,
            UPPER(t.remark) AS specification,
            lhs_utility.get_name('cost_code', t.cost_code) AS cost_project,
            t.cancelleddate,
            t.cancelled_remark
          FROM view_indent_engine t
          LEFT JOIN indent_head h
            ON h.vrno = t.vrno
          WHERE t.entity_code = 'SR'
            AND t.vrdate >= ${scopedDateSql}
        )
        SELECT
          plannedtimestamp,
          indent_number,
          indent_date,
          indenter_name,
          indenter_name AS employee_name,
          division,
          department,
          item_code,
          item_name,
          required_qty,
          required_qty AS indent_quantity,
          um,
          acknowledgedate,
          purchaser,
          remark,
          specification,
          cost_project,
          cancelleddate,
          cancelled_remark
        FROM indent_rows
        ORDER BY indent_date DESC, indent_number DESC
      `,
      binds
    );

    return { pendingRows, historyRows };
  });
}

async function fetchOracleDashboardPoRows(fromDate) {
  const scopedDateSql = getDashboardDateSql(fromDate);
  const binds = getDashboardBinds(fromDate);

  return withOracleDashboardConnection(async (conn) => {
    const pendingRows = await executeOracleRows(
      conn,
      `
        WITH indent_lookup AS (
          SELECT vrno, MAX(indent_remark) AS indent_remark
          FROM view_indent_engine
          WHERE entity_code = 'SR'
          GROUP BY vrno
        )
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
          (NVL(t.qtyorder, 0) - NVL(t.qtyexecute, 0)) AS BALANCE_QTY
        FROM view_order_engine t
        LEFT JOIN indent_lookup a
          ON a.vrno = t.indent_vrno
        WHERE t.entity_code = 'SR'
          AND t.series = 'U3'
          AND NVL(t.qtycancelled, 0) = 0
          AND t.vrdate >= ${scopedDateSql}
          AND NVL(t.qtyexecute, 0) < NVL(t.qtyorder, 0)
        ORDER BY t.vrdate DESC, t.vrno DESC
      `,
      binds
    );

    const historyRows = await executeOracleRows(
      conn,
      `
        WITH indent_lookup AS (
          SELECT vrno, MAX(indent_remark) AS indent_remark
          FROM view_indent_engine
          WHERE entity_code = 'SR'
          GROUP BY vrno
        )
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
          (NVL(t.qtyorder, 0) - NVL(t.qtyexecute, 0)) AS BALANCE_QTY
        FROM view_order_engine t
        LEFT JOIN indent_lookup a
          ON a.vrno = t.indent_vrno
        WHERE t.entity_code = 'SR'
          AND t.series = 'U3'
          AND NVL(t.qtycancelled, 0) = 0
          AND t.vrdate >= ${scopedDateSql}
          AND (NVL(t.qtyorder, 0) - NVL(t.qtyexecute, 0)) <= 0
        ORDER BY t.vrdate DESC, t.vrno DESC
      `,
      binds
    );

    return {
      pendingRows,
      historyRows,
      pendingTotal: pendingRows.length,
      historyTotal: historyRows.length,
    };
  });
}

async function fetchOracleDashboardRepairRows(fromDate) {
  const scopedDateSql = getDashboardDateSql(fromDate);
  const binds = getDashboardBinds(fromDate);

  return withOracleDashboardConnection(async (conn) => {
    const pendingRows = await executeOracleRows(
      conn,
      `
        SELECT
          t.vrno,
          t.vrdate,
          lhs_utility.get_name('dept_code', t.dept_code) AS department,
          lhs_utility.get_name('acc_code', t.acc_code) AS partyname,
          t.item_name,
          t.item_code,
          t.qtyissued,
          t.um,
          t.app_remark,
          t.remark
        FROM view_itemtran_engine t
        WHERE t.entity_code = 'SR'
          AND t.series = 'P3'
          AND t.vrdate >= ${scopedDateSql}
          AND t.qty1 IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM view_itemtran_engine a
            WHERE a.entity_code = 'SR'
              AND a.series = 'A3'
              AND a.ref1_vrno = t.vrno
              AND a.vrdate >= ${scopedDateSql}
          )
        ORDER BY t.vrdate DESC, t.vrno DESC
      `,
      binds
    );

    const historyRows = await executeOracleRows(
      conn,
      `
        SELECT
          t.ref1_vrno AS repair_gate_pass,
          t.vrno AS receive_gate_pass,
          t.vrdate AS received_date,
          lhs_utility.get_name('dept_code', t.dept_code) AS department,
          lhs_utility.get_name('acc_code', t.acc_code) AS partyname,
          t.item_name,
          t.item_code,
          t.qtyrecd,
          t.um,
          t.app_remark,
          t.remark
        FROM view_itemtran_engine t
        WHERE t.entity_code = 'SR'
          AND t.series = 'A3'
          AND t.vrdate >= ${scopedDateSql}
        ORDER BY t.vrdate DESC, t.vrno DESC
      `,
      binds
    );

    return { pendingRows, historyRows };
  });
}

async function fetchOracleDashboardReturnableRows(fromDate) {
  const binds = getDashboardBinds(fromDate);

  return withOracleDashboardConnection(async (conn) => {
    return executeOracleRows(
      conn,
      `
        ${buildReturnableDashboardCte(fromDate)}
        SELECT
          CASE
            WHEN i.series = 'R3' THEN 'RETURNABLE'
            WHEN i.series = 'N3' THEN 'NON RETURANABLE'
            ELSE 'OTHER'
          END AS GATEPASS_TYPE,
          i.vrdate AS VRDATE,
          i.vrno AS VRNO,
          lhs_utility.get_name('acc_code', i.acc_code) AS PARTY_NAME,
          i.item_code AS ITEM_CODE,
          i.item_name AS ITEM_NAME,
          i.remark AS REMARK,
          i.um AS UNIT,
          i.qtyissued AS QTYISSUED,
          r.qtyreceived AS QTYRECEIVED,
          i.mobile AS MOBILE,
          i.email AS EMAIL,
          CASE
            WHEN r.ref1_vrno IS NOT NULL THEN 'COMPLETED'
            ELSE 'PENDING'
          END AS GATEPASS_STATUS
        FROM issued_rows i
        LEFT JOIN received_rows r
          ON r.ref1_vrno = i.vrno
         AND r.item_code = i.item_code
        ORDER BY i.vrdate DESC
      `,
      binds
    );
  });
}

function normalizeCacheScope(fromDate) {
  return fromDate || "all";
}

export async function fetchDashboardPendingIndents(fromDate = null) {
  return getOrSetCache(
    cacheKeys.indentPending(normalizeCacheScope(fromDate)),
    async () => {
      const result = await fetchOracleDashboardIndentRows(fromDate);
      return result.pendingRows || [];
    },
    DEFAULT_TTL.INDENT
  );
}

export async function fetchDashboardIndentHistory(fromDate = null) {
  return getOrSetCache(
    cacheKeys.indentHistory(normalizeCacheScope(fromDate)),
    async () => {
      const result = await fetchOracleDashboardIndentRows(fromDate);
      return result.historyRows || [];
    },
    DEFAULT_TTL.INDENT
  );
}

export async function fetchDashboardPoPending(fromDate = null) {
  return getOrSetCache(
    cacheKeys.poPending(normalizeCacheScope(fromDate)),
    async () => {
      const result = await fetchOracleDashboardPoRows(fromDate);
      return {
        rows: result.pendingRows || [],
        total: toNumber(result.pendingTotal),
      };
    },
    DEFAULT_TTL.PO
  );
}

export async function fetchDashboardPoHistory(fromDate = null) {
  return getOrSetCache(
    cacheKeys.poHistory(normalizeCacheScope(fromDate)),
    async () => {
      const result = await fetchOracleDashboardPoRows(fromDate);
      return {
        rows: result.historyRows || [],
        total: toNumber(result.historyTotal),
      };
    },
    DEFAULT_TTL.PO
  );
}

export async function fetchDashboardRepairPending(fromDate = null) {
  return getOrSetCache(
    cacheKeys.gatePassPending(normalizeCacheScope(fromDate)),
    async () => {
      const result = await fetchOracleDashboardRepairRows(fromDate);
      return result.pendingRows || [];
    },
    DEFAULT_TTL.GATE_PASS
  );
}

export async function fetchDashboardRepairHistory(fromDate = null) {
  return getOrSetCache(
    cacheKeys.gatePassReceived(normalizeCacheScope(fromDate)),
    async () => {
      const result = await fetchOracleDashboardRepairRows(fromDate);
      return result.historyRows || [];
    },
    DEFAULT_TTL.GATE_PASS
  );
}

export async function fetchDashboardReturnableDetails(fromDate = null) {
  return getOrSetCache(
    cacheKeys.returnableDetails(normalizeCacheScope(fromDate)),
    () => fetchOracleDashboardReturnableRows(fromDate),
    DEFAULT_TTL.RETURNABLE
  );
}

export async function fetchDashboardRepairCounts(fromDate = null) {
  const [pendingRows, historyRows] = await Promise.all([
    fetchDashboardRepairPending(fromDate),
    fetchDashboardRepairHistory(fromDate),
  ]);

  return {
    pending: pendingRows.length,
    history: historyRows.length,
  };
}

export async function fetchDashboardReturnableStats(fromDate = null) {
  const rows = await fetchDashboardReturnableDetails(fromDate);

  return {
    TOTAL_COUNT: rows.length,
    RETURNABLE_COUNT: rows.filter((row) => row.GATEPASS_TYPE === "RETURNABLE").length,
    NON_RETURNABLE_COUNT: rows.filter(
      (row) => row.GATEPASS_TYPE === "NON RETURANABLE"
    ).length,
    RETURNABLE_COMPLETED_COUNT: rows.filter(
      (row) =>
        row.GATEPASS_TYPE === "RETURNABLE" &&
        row.GATEPASS_STATUS === "COMPLETED"
    ).length,
    RETURNABLE_PENDING_COUNT: rows.filter(
      (row) =>
        row.GATEPASS_TYPE === "RETURNABLE" &&
        row.GATEPASS_STATUS === "PENDING"
    ).length,
  };
}

async function buildDashboardPayload() {
  const currentMonthStartDate = getCurrentMonthStartDate();
  const googleFetchPromise = fetchVendorFeedbacks();

  // Attach error handlers immediately so a PostgreSQL timeout cannot surface
  // as a detached rejection while Oracle fetches are still in progress.
  const postgresPromise = Promise.all([
    runDashboardPgQuery(
      "recent repairs",
      `
        SELECT id, status, department, total_bill_amount, vendor_name, payment_type
        FROM repair_system
        ORDER BY id DESC
        LIMIT 100
      `
    ),
    runDashboardPgQuery(
      "repair stats",
      `
        SELECT
          COUNT(*) AS total_count,
          COUNT(*) FILTER (WHERE status = 'done') AS completed_count,
          COUNT(*) FILTER (WHERE status IS NULL OR status <> 'done') AS pending_count,
          COALESCE(SUM(total_bill_amount), 0) AS total_repair_cost
        FROM repair_system
      `,
      "stats"
    ),
    runDashboardPgQuery(
      "department totals",
      `
        SELECT department, COUNT(*) AS count
        FROM repair_system
        GROUP BY department
        ORDER BY department ASC
      `
    ),
    runDashboardPgQuery(
      "payment totals",
      `
        SELECT payment_type AS type, SUM(total_bill_amount) AS amount
        FROM repair_system
        GROUP BY payment_type
      `
    ),
    runDashboardPgQuery(
      "top vendors",
      `
        SELECT vendor_name AS vendor, SUM(total_bill_amount) AS cost
        FROM repair_system
        GROUP BY vendor_name
        ORDER BY cost DESC
        LIMIT 5
      `
    ),
  ]);

  const oracleFetchers = [
    () =>
      runDashboardTask(
        "Oracle summary",
        () => fetchOracleDashboardSummary(),
        {}
      ),
    () =>
      runDashboardTask(
        "Oracle pending indents",
        () => fetchDashboardPendingIndents(),
        []
      ),
    () =>
      runDashboardTask(
        "Oracle history indents",
        () => fetchDashboardIndentHistory(),
        []
      ),
    () =>
      runDashboardTask(
        "Oracle pending purchase orders",
        () => fetchDashboardPoPending(),
        { rows: [], total: 0 }
      ),
    () =>
      runDashboardTask(
        "Oracle purchase order history",
        () => fetchDashboardPoHistory(),
        { rows: [], total: 0 }
      ),
    () =>
      runDashboardTask(
        "Oracle pending repair gate passes",
        () => fetchDashboardRepairPending(currentMonthStartDate),
        []
      ),
    () =>
      runDashboardTask(
        "Oracle repair gate pass history",
        () => fetchDashboardRepairHistory(currentMonthStartDate),
        []
      ),
    () =>
      runDashboardTask(
        "Oracle returnable details",
        () => fetchDashboardReturnableDetails(currentMonthStartDate),
        []
      ),
  ];

  const oracleData = await runTasksWithConcurrency(
    oracleFetchers,
    DASHBOARD_ORACLE_CONCURRENCY
  );

  const [
    tasksResult,
    statsResult,
    deptWiseResult,
    paymentResult,
    vendorResult,
  ] = await postgresPromise;

  const [
    indentSummary,
    pendingIndents,
    historyIndents,
    poPendingData,
    poHistoryData,
    repairPending,
    repairHistory,
    returnableDetails,
  ] = oracleData;

  const vendorFeedbacks = await googleFetchPromise;
  const combinedPoRows = [
    ...(poPendingData.rows || []),
    ...(poHistoryData.rows || []),
  ];

  const stats = statsResult.rows?.[0] || {};
  const derivedTotalIndents = historyIndents.length;
  const derivedPendingIndents = pendingIndents.length;
  const derivedCompletedIndents = Math.max(
    derivedTotalIndents - derivedPendingIndents,
    0
  );
  const derivedTotalIndentedQuantity = historyIndents.reduce(
    (total, row) =>
      total + toNumber(row?.INDENT_QUANTITY || row?.indent_quantity || row?.REQUIRED_QTY || row?.required_qty),
    0
  );
  const derivedOverallProgress =
    derivedTotalIndents > 0
      ? Math.round((derivedCompletedIndents / derivedTotalIndents) * 1000) / 10
      : 0;
  const derivedPendingPercent =
    derivedTotalIndents > 0
      ? Math.round((derivedPendingIndents / derivedTotalIndents) * 1000) / 10
      : 0;
  const derivedCompletedPercent =
    derivedTotalIndents > 0
      ? Math.round((derivedCompletedIndents / derivedTotalIndents) * 1000) / 10
      : 0;
  const summary = {
    ...(indentSummary || {}),
    totalIndents: Number(indentSummary?.totalIndents || derivedTotalIndents),
    completedIndents: Number(
      indentSummary?.completedIndents || derivedCompletedIndents
    ),
    pendingIndents: Number(indentSummary?.pendingIndents || derivedPendingIndents),
    totalIndentedQuantity: Number(
      indentSummary?.totalIndentedQuantity || derivedTotalIndentedQuantity
    ),
    totalPurchaseOrders: Number(
      indentSummary?.totalPurchaseOrders || poHistoryData.rows.length
    ),
    pendingPurchaseOrders: Number(poPendingData.total),
    overallProgress: Number(
      indentSummary?.overallProgress || derivedOverallProgress
    ),
    completedPercent: Number(
      indentSummary?.completedPercent || derivedCompletedPercent
    ),
    pendingPercent: Number(
      indentSummary?.pendingPercent || derivedPendingPercent
    ),
    topPurchasedItems: buildTopPurchasedItems(combinedPoRows),
    topVendors: buildTopVendors(combinedPoRows),
  };

  return {
    tasks: tasksResult.rows || [],
    pendingCount: Number(stats.pending_count || 0),
    completedCount: Number(stats.completed_count || 0),
    totalRepairCost: Number(stats.total_repair_cost || 0),
    departmentStatus: deptWiseResult.rows || [],
    paymentTypeDistribution: paymentResult.rows || [],
    vendorWiseCosts: vendorResult.rows || [],
    summary,
    pendingIndents: pendingIndents || [],
    historyIndents: historyIndents || [],
    poPending: poPendingData.rows,
    poHistory: poHistoryData.rows,
    repairPending: repairPending || [],
    repairHistory: repairHistory || [],
    returnableDetails: returnableDetails || [],
    feedbacks: vendorFeedbacks,
  };
}

export async function invalidateRepairDashboardCache() {
  await deleteCache(cacheKeys.dashboardRepair());
  await deleteCache("dashboard_cache_v1");
  await deleteCache("dashboard_cache_v2");
  await deleteCache("dashboard_cache_v3");
  await deleteCache("dashboard_cache_v4");
  await deleteCache(DASHBOARD_CACHE_KEY);
}

export async function refreshDashboardData() {
  const cacheKey = DASHBOARD_CACHE_KEY;

  try {
    const payload = await buildDashboardPayload();
    await setCache(cacheKey, payload, 300);
    return payload;
  } catch (error) {
    console.error("Error in refreshDashboardData:", error.message || error);
    if (isMissingTableError(error)) {
      return buildEmptyDashboardPayload();
    }

    return buildEmptyDashboardPayload();
  }
}

export async function fetchDashboardMetricsSnapshot() {
  const cacheKey = DASHBOARD_CACHE_KEY;

  try {
    const data = await getOrSetCache(cacheKey, buildDashboardPayload, 300);
    return data || buildEmptyDashboardPayload();
  } catch (error) {
    console.error("Error in fetchDashboardMetricsSnapshot:", error.message || error);
    return buildEmptyDashboardPayload();
  }
}




