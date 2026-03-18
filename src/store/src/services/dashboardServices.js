import pool from "../config/postgres.js";
import { getOrSetCache, deleteCache, cacheKeys, DEFAULT_TTL } from "./redisCache.js";
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

export async function invalidateRepairDashboardCache() {
  await deleteCache(cacheKeys.dashboardRepair());
}

export async function fetchDashboardMetricsSnapshot() {
  return getOrSetCache(
    cacheKeys.dashboardRepair(),
    async () => {
      try {
        const [
          // Original Repair System queries (PostgreSQL)
          tasksResult,
          statsResult,
          deptWiseResult,
          paymentResult,
          vendorResult,
        ] = await Promise.all([
          pool.query(`
            SELECT *
            FROM repair_system
            ORDER BY id DESC
          `),
          pool.query(`
            SELECT
              COUNT(*) AS total_count,
              COUNT(*) FILTER (WHERE status = 'done') AS completed_count,
              COUNT(*) FILTER (WHERE status IS NULL OR status <> 'done') AS pending_count,
              COALESCE(SUM(total_bill_amount), 0) AS total_repair_cost
            FROM repair_system
          `),
          pool.query(`
            SELECT department, COUNT(*) AS count
            FROM repair_system
            GROUP BY department
            ORDER BY department ASC
          `),
          pool.query(`
            SELECT payment_type AS type, SUM(total_bill_amount) AS amount
            FROM repair_system
            GROUP BY payment_type
          `),
          pool.query(`
            SELECT vendor_name AS vendor, SUM(total_bill_amount) AS cost
            FROM repair_system
            GROUP BY vendor_name
            ORDER BY cost DESC
            LIMIT 5
          `)
        ]);

        // Fetch Store Data (Oracle) sequentially to prevent connection rejection / ORA-12541 errors
        const indentSummary = await storeIndentService.getDashboardMetrics();
        const pendingIndents = await storeIndentService.getPending();
        const historyIndents = await storeIndentService.getHistory();
        const poPendingData = await poService.getPoPending();
        const poHistoryData = await poService.getPoHistory();
        const repairPending = await repairGatePassService.getPendingRepairGatePass();
        const repairHistory = await repairGatePassService.getReceivedRepairGatePass();
        const returnableDetails = await returnableService.getReturnableDetails();

        // Fetch Google Sheet Feedback Data
        let vendorFeedbacks = [];
        try {
          if (process.env.GOOGLE_FEEDBACK_STORE) {
            // Using native fetch if available, else require('axios')
            const res = await fetch(process.env.GOOGLE_FEEDBACK_STORE);
            const json = await res.json();
            if (json && json.success && json.data && json.data.length > 1) {
              const headers = json.data[0];
              let dataRows = json.data.slice(1).map((row) => {
                const obj = {};
                headers.forEach((h, i) => {
                  obj[h] = row[i];
                });
                return obj;
              });

              // Filter out completely empty rows (checking where Timestamp exists)
              vendorFeedbacks = dataRows.filter(fb => fb.Timestamp && String(fb.Timestamp).trim() !== "");

              // Sort by Timestamp descending (latest first)
              vendorFeedbacks.sort((a, b) => new Date(b.Timestamp).getTime() - new Date(a.Timestamp).getTime());
            }
          }
        } catch (err) {
          console.error("Failed to fetch Google Forms feedback:", err.message || err);
        }

        const stats = statsResult.rows?.[0] || {};

        return {
          // Original structure maintained
          tasks: tasksResult.rows || [],
          pendingCount: Number(stats.pending_count || 0),
          completedCount: Number(stats.completed_count || 0),
          totalRepairCost: Number(stats.total_repair_cost || 0),
          departmentStatus: deptWiseResult.rows || [],
          paymentTypeDistribution: paymentResult.rows || [],
          vendorWiseCosts: vendorResult.rows || [],

          // New Consolidated Store Data
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
      } catch (error) {
        console.error("Error in fetchDashboardMetricsSnapshot:", error.message || error);
        if (isMissingTableError(error)) {
          return buildEmptyDashboardPayload();
        }
        throw error;
      }
    },
    DEFAULT_TTL.DASHBOARD
  );
}
