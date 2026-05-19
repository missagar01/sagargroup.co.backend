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


const DASHBOARD_DEPENDENCY_TIMEOUT_MS = Number(
  process.env.STORE_DASHBOARD_DEPENDENCY_TIMEOUT_MS || 8000
);
const DASHBOARD_ORACLE_CONCURRENCY = Math.max(
  1,
  Number(process.env.STORE_DASHBOARD_ORACLE_CONCURRENCY || 3)
);
const GOOGLE_FEEDBACK_TIMEOUT_MS = Number(
  process.env.STORE_DASHBOARD_FEEDBACK_TIMEOUT_MS || 5000
);
const GOOGLE_FEEDBACK_MAX_ATTEMPTS = Math.max(
  1,
  Number(process.env.STORE_DASHBOARD_FEEDBACK_MAX_ATTEMPTS || 2)
);

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

function getCurrentMonthStart() {
  const currentMonthStart = new Date();
  currentMonthStart.setDate(1);
  currentMonthStart.setHours(0, 0, 0, 0);
  return currentMonthStart.getTime();
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

function parseRowDate(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (!value) {
      continue;
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getTime();
    }
  }

  return null;
}

function filterRowsFromCurrentMonth(rows, keys) {
  const monthStart = getCurrentMonthStart();

  return (rows || []).filter((row) => {
    const parsedTime = parseRowDate(row, keys);
    return parsedTime !== null && parsedTime >= monthStart;
  });
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
        "Oracle indent summary",
        () => storeIndentService.getDashboardMetrics(),
        {}
      ),
    () =>
      runDashboardTask(
        "Oracle pending indents",
        () => storeIndentService.getPending(currentMonthStartDate),
        []
      ),
    () =>
      runDashboardTask(
        "Oracle history indents",
        () => storeIndentService.getHistory(currentMonthStartDate),
        []
      ),
    () =>
      runDashboardTask(
        "Oracle pending PO",
        () => poService.getPoPending(currentMonthStartDate),
        { rows: [], total: 0 }
      ),
    () =>
      runDashboardTask(
        "Oracle PO history",
        () => poService.getPoHistory(currentMonthStartDate),
        { rows: [], total: 0 }
      ),
    () =>
      runDashboardTask(
        "Oracle pending repair gate pass",
        () => repairGatePassService.getPendingRepairGatePass(currentMonthStartDate),
        []
      ),
    () =>
      runDashboardTask(
        "Oracle repair gate pass history",
        () => repairGatePassService.getReceivedRepairGatePass(currentMonthStartDate),
        []
      ),
    () =>
      runDashboardTask(
        "Oracle returnable details",
        () => returnableService.getReturnableDetails(currentMonthStartDate),
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

  const currentMonthPendingIndents = filterRowsFromCurrentMonth(
    pendingIndents,
    ["INDENT_DATE", "indent_date", "PLANNEDTIMESTAMP", "plannedtimestamp"]
  );
  const currentMonthHistoryIndents = filterRowsFromCurrentMonth(
    historyIndents,
    [
      "ACKNOWLEDGEDATE",
      "acknowledgedate",
      "INDENT_DATE",
      "indent_date",
      "PLANNEDTIMESTAMP",
      "plannedtimestamp",
    ]
  );
  const currentMonthPoPending = filterRowsFromCurrentMonth(poPendingData?.rows, [
    "VRDATE",
    "vrdate",
    "PLANNED_TIMESTAMP",
    "planned_timestamp",
  ]);
  const currentMonthPoHistory = filterRowsFromCurrentMonth(poHistoryData?.rows, [
    "VRDATE",
    "vrdate",
    "PLANNED_TIMESTAMP",
    "planned_timestamp",
  ]);
  const currentMonthRepairPending = filterRowsFromCurrentMonth(repairPending, [
    "VRDATE",
    "vrdate",
  ]);
  const currentMonthRepairHistory = filterRowsFromCurrentMonth(repairHistory, [
    "RECEIVED_DATE",
    "received_date",
    "VRDATE",
    "vrdate",
  ]);
  const currentMonthReturnableDetails = filterRowsFromCurrentMonth(
    returnableDetails,
    ["VRDATE", "vrdate"]
  );

  const vendorFeedbacks = await googleFetchPromise;

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
    pendingIndents: currentMonthPendingIndents,
    historyIndents: currentMonthHistoryIndents,
    poPending: currentMonthPoPending,
    poHistory: currentMonthPoHistory,
    repairPending: currentMonthRepairPending,
    repairHistory: currentMonthRepairHistory,
    returnableDetails: currentMonthReturnableDetails,
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




