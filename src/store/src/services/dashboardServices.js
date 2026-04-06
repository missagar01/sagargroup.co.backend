import pool from "../config/postgres.js";
import {
  getOrSetCache,
  setCache,
  deleteCache,
  cacheKeys,
} from "./redisCache.js";
import * as storeIndentService from "./storeIndent.service.js";
import * as poService from "./po.service.js";
import * as repairGatePassService from "./repairGatePass.service.js";
import * as returnableService from "./returnable.service.js";

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

async function buildDashboardPayload() {
  const googleFetchPromise = process.env.GOOGLE_FEEDBACK_STORE
    ? fetch(process.env.GOOGLE_FEEDBACK_STORE)
        .then((res) => res.json())
        .catch((err) => {
          console.error("Failed to fetch Google Forms feedback:", err.message || err);
          return null;
        })
    : Promise.resolve(null);

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

  // Keep Oracle work sequential to avoid exhausting the Oracle pool.
  const oracleFetchers = [
    () => storeIndentService.getDashboardMetrics(),
    () => storeIndentService.getPending(),
    () => storeIndentService.getHistory(),
    () => poService.getPoPending(),
    () => poService.getPoHistory(),
    () => repairGatePassService.getPendingRepairGatePass(),
    () => repairGatePassService.getReceivedRepairGatePass(),
    () => returnableService.getReturnableDetails(),
  ];

  const oracleData = [];
  for (const fetchFn of oracleFetchers) {
    try {
      oracleData.push(await fetchFn());
    } catch (error) {
      console.error(
        "Oracle fetch error in dashboard background sync:",
        error.message || error
      );
      oracleData.push(null);
    }
  }

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

  let vendorFeedbacks = [];
  try {
    const json = await googleFetchPromise;
    if (json && json.success && json.data && json.data.length > 1) {
      const headers = json.data[0];
      const dataRows = json.data.slice(1).map((row) => {
        const obj = {};
        headers.forEach((header, index) => {
          obj[header] = row[index];
        });
        return obj;
      });

      vendorFeedbacks = dataRows.filter(
        (feedback) =>
          feedback.Timestamp && String(feedback.Timestamp).trim() !== ""
      );

      vendorFeedbacks.sort(
        (a, b) => new Date(b.Timestamp).getTime() - new Date(a.Timestamp).getTime()
      );
    }
  } catch (error) {
    console.error("Failed to parse Google Forms feedback:", error.message || error);
  }

  const stats = statsResult.rows?.[0] || {};

  return {
    tasks: tasksResult.rows || [],
    pendingCount: Number(stats.pending_count || 0),
    completedCount: Number(stats.completed_count || 0),
    totalRepairCost: Number(stats.total_repair_cost || 0),
    departmentStatus: deptWiseResult.rows || [],
    paymentTypeDistribution: paymentResult.rows || [],
    vendorWiseCosts: vendorResult.rows || [],
    summary: indentSummary || {},
    pendingIndents: pendingIndents || [],
    historyIndents: historyIndents || [],
    poPending: poPendingData?.rows || [],
    poHistory: poHistoryData?.rows || [],
    repairPending: repairPending || [],
    repairHistory: repairHistory || [],
    returnableDetails: returnableDetails || [],
    feedbacks: vendorFeedbacks,
  };
}

export async function invalidateRepairDashboardCache() {
  await deleteCache(cacheKeys.dashboardRepair());
  await deleteCache("dashboard_cache_v1");
}

export async function refreshDashboardData() {
  const cacheKey = "dashboard_cache_v1";

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
  const cacheKey = "dashboard_cache_v1";

  try {
    const data = await getOrSetCache(cacheKey, buildDashboardPayload, 300);
    return data || buildEmptyDashboardPayload();
  } catch (error) {
    console.error("Error in fetchDashboardMetricsSnapshot:", error.message || error);
    return buildEmptyDashboardPayload();
  }
}
