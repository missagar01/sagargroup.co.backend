import * as chatbotService from "../services/chatbotService.js";
import jwt from "jsonwebtoken";
import axios from "axios";

/**
 * Endpoint to search items in ITEM_MAST
 */
export const searchItems = async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.status(200).json([]);
    }
    const items = await chatbotService.searchItems(q.trim());
    res.status(200).json(items);
  } catch (err) {
    next(err);
  }
};

/**
 * Endpoint to get stock for an item
 */
export const getItemStock = async (req, res, next) => {
  try {
    const { itemCode } = req.params;
    if (!itemCode) {
      return res.status(400).json({ error: 'Item code is required.' });
    }
    const stock = await chatbotService.getItemStock(itemCode.trim());
    res.status(200).json({ stock });
  } catch (err) {
    next(err);
  }
};

/**
 * Endpoint to get all indent series options
 */
export const getIndentSeries = async (req, res, next) => {
  try {
    const series = await chatbotService.getIndentSeries();
    res.status(200).json(series);
  } catch (err) {
    next(err);
  }
};

/**
 * Endpoint to get list of distinct departments
 */
export const getDepartments = async (req, res, next) => {
  try {
    const depts = await chatbotService.getDepartments();
    res.status(200).json(depts);
  } catch (err) {
    next(err);
  }
};

/**
 * Endpoint to get list of cost codes
 */
export const getCostCodes = async (req, res, next) => {
  try {
    const costCodes = await chatbotService.getCostCodes();
    res.status(200).json(costCodes);
  } catch (err) {
    next(err);
  }
};

/**
 * Endpoint to get list of employees
 */
export const getEmployees = async (req, res, next) => {
  try {
    const emps = await chatbotService.getEmployees();
    res.status(200).json(emps);
  } catch (err) {
    next(err);
  }
};

/**
 * Endpoint to get list of makes
 */
export const getMakes = async (req, res, next) => {
  try {
    const makes = await chatbotService.getMakes();
    res.status(200).json(makes);
  } catch (err) {
    next(err);
  }
};

/**
 * Endpoint to raise a new indent in database
 */
export const createIndent = async (req, res, next) => {
  try {
    const { items, itemCode, qty, deptCode, series, specs, purpose, dueDate, make, userCode, costCode, empName, divCode } = req.body;

    const isValidText = (str) => {
      if (!str) return false;
      const trimmed = str.trim();
      const matches = trimmed.match(/[a-zA-Z0-9\u0900-\u097F]/g);
      return matches && matches.length >= 2;
    };

    // Fallback: if items array is not provided, construct it from single item fields
    let finalItems = items;
    if (!Array.isArray(finalItems) || finalItems.length === 0) {
      finalItems = [{ itemCode, qty, make, specs, purpose }];
    }

    // Basic Header Validations
    if (!deptCode) return res.status(400).json({ error: 'deptCode is required.' });
    if (!series) return res.status(400).json({ error: 'series code is required.' });
    if (!costCode) return res.status(400).json({ error: 'costCode is required.' });

    // Custom Validation for series I5 requiring division code
    if (series === 'I5' && !divCode) {
      return res.status(400).json({ error: 'divCode is required for series I5.' });
    }

    // Item validations
    for (const item of finalItems) {
      if (!item.itemCode) return res.status(400).json({ error: 'itemCode is required for all items.' });
      if (!item.qty || isNaN(item.qty) || Number(item.qty) <= 0) return res.status(400).json({ error: 'Valid positive qty is required for all items.' });
      if (!item.make) return res.status(400).json({ error: 'make (makeCode) is required for all items.' });
      if (!isValidText(item.specs)) return res.status(400).json({ error: 'Valid specs (at least 2 letters/numbers, no dots/symbols) are required for all items.' });
      if (!isValidText(item.purpose)) return res.status(400).json({ error: 'Valid purpose (at least 2 letters/numbers, no dots/symbols) is required for all items.' });
    }

    const result = await chatbotService.createIndent({
      items: finalItems.map(item => ({
        itemCode: item.itemCode.trim(),
        qty: Number(item.qty),
        make: item.make ? item.make.trim() : null,
        specs: item.specs.trim(),
        purpose: item.purpose.trim()
      })),
      deptCode: deptCode.trim(),
      series: series.trim(),
      dueDate,
      userCode: userCode ? userCode.trim() : 'SR002',
      costCode: costCode.trim(),
      empName: empName ? empName.trim() : '',
      divCode: divCode ? divCode.trim() : null
    });

    res.status(200).json({
      success: true,
      vrNo: result.vrNo,
      message: `Indent ${result.vrNo} raised successfully with ${finalItems.length} items in division ${result.divCode || result.entityCode}!`
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

/**
 * Helper to get JWT secret
 */
function getJwtSecret() {
  return (
    process.env.JWT_SECRET ||
    process.env.JWT_SCREAT ||
    process.env.JWT_SECREAT ||
    process.env.jwt_secret ||
    process.env.jwt_screat ||
    process.env.jwt_secreat ||
    null
  );
}

/**
 * Controller to query user data based on access constraints (role, designation, division, department)
 */

/**
 * Directly fetch accurate task counts from DB — bypasses LLM SQL generation.
 * Mirrors the exact logic in dashboardController.js countUnifiedChecklistRows.
 */
async function getDirectTaskSummary({ username, userRole, userDept, userDiv, userDepts }) {
  const pg = await import("../config/postgres.js");
  const pool = pg.default;

  const isAdmin = userRole === "admin";
  const isRegularUser = userRole === "user";

  let checklistCounts = { total: 0, completed: 0, pending: 0, notdone: 0, future: 0 };
  let maintenanceCounts = { total: 0, completed: 0, pending: 0, notdone: 0, future: 0 };
  let housekeepingCounts = { total: 0, completed: 0, pending: 0, notdone: 0, future: 0 };

  // ---- CHECKLIST ----
  {
    const qParams = [];
    let pi = 1;
    const whereClauses = [];

    if (isRegularUser) {
      whereClauses.push(`LOWER(name) = LOWER($${pi++})`);
      qParams.push(username);
    } else if (!isAdmin && userDept) {
      whereClauses.push(`LOWER(department) = LOWER($${pi++})`);
      qParams.push(userDept);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const sql = `
      SELECT
        COUNT(CASE WHEN task_start_date::date >= date_trunc('month', CURRENT_DATE) AND task_start_date::date <= CURRENT_DATE THEN 1 END) as total,
        COUNT(CASE WHEN task_start_date::date >= date_trunc('month', CURRENT_DATE) AND submission_date IS NOT NULL AND LOWER(status::text) = 'yes' THEN 1 END) as completed,
        COUNT(CASE WHEN task_start_date::date >= date_trunc('month', CURRENT_DATE) AND task_start_date::date <= CURRENT_DATE AND submission_date IS NULL THEN 1 END) as pending,
        COUNT(CASE WHEN task_start_date::date >= date_trunc('month', CURRENT_DATE) AND submission_date IS NOT NULL AND LOWER(status::text) = 'no' THEN 1 END) as notdone,
        COUNT(CASE WHEN task_start_date::date = CURRENT_DATE + 1 THEN 1 END) as future
      FROM checklist
      ${whereStr}
    `;
    try {
      const r = await pool.query(sql, qParams);
      if (r.rows[0]) {
        checklistCounts = {
          total: Number(r.rows[0].total || 0),
          completed: Number(r.rows[0].completed || 0),
          pending: Number(r.rows[0].pending || 0),
          notdone: Number(r.rows[0].notdone || 0),
          future: Number(r.rows[0].future || 0)
        };
      }
    } catch (e) {
      console.error("chatbot checklist summary error:", e.message);
    }
  }

  // ---- MAINTENANCE ----
  {
    const qParams = [];
    let pi = 1;
    const whereClauses = [];

    if (isRegularUser) {
      whereClauses.push(`LOWER(doer_name) = LOWER($${pi++})`);
      qParams.push(username);
    } else if (!isAdmin && userDept) {
      whereClauses.push(`LOWER(COALESCE(doer_department, machine_department)) = LOWER($${pi++})`);
      qParams.push(userDept);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const sql = `
      SELECT
        COUNT(CASE WHEN task_start_date::date >= date_trunc('month', CURRENT_DATE) AND task_start_date::date <= CURRENT_DATE THEN 1 END) as total,
        COUNT(CASE WHEN task_start_date::date >= date_trunc('month', CURRENT_DATE) AND actual_date IS NOT NULL AND LOWER(task_status::text) = 'yes' THEN 1 END) as completed,
        COUNT(CASE WHEN task_start_date::date >= date_trunc('month', CURRENT_DATE) AND task_start_date::date <= CURRENT_DATE AND actual_date IS NULL THEN 1 END) as pending,
        COUNT(CASE WHEN task_start_date::date >= date_trunc('month', CURRENT_DATE) AND actual_date IS NOT NULL AND LOWER(task_status::text) = 'no' THEN 1 END) as notdone,
        COUNT(CASE WHEN task_start_date::date = CURRENT_DATE + 1 THEN 1 END) as future
      FROM maintenance_task_assign
      ${whereStr}
    `;
    try {
      const r = await pool.query(sql, qParams);
      if (r.rows[0]) {
        maintenanceCounts = {
          total: Number(r.rows[0].total || 0),
          completed: Number(r.rows[0].completed || 0),
          pending: Number(r.rows[0].pending || 0),
          notdone: Number(r.rows[0].notdone || 0),
          future: Number(r.rows[0].future || 0)
        };
      }
    } catch (e) {
      console.error("chatbot maintenance summary error:", e.message);
    }
  }

  // ---- HOUSEKEEPING ----
  {
    const qParams = [];
    let pi = 1;
    const whereClauses = [];

    if (isRegularUser) {
      whereClauses.push(`LOWER(name) = LOWER($${pi++})`);
      qParams.push(username);
    } else if (!isAdmin && userDepts && userDepts.length > 0) {
      const placeholders = userDepts.map((_, i) => `$${pi + i}`).join(", ");
      whereClauses.push(`LOWER(department) = ANY(ARRAY[${placeholders}])`);
      qParams.push(...userDepts);
      pi += userDepts.length;
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const sql = `
      SELECT
        COUNT(CASE WHEN task_start_date::date >= date_trunc('month', CURRENT_DATE) AND task_start_date::date <= CURRENT_DATE THEN 1 END) as total,
        COUNT(CASE WHEN task_start_date::date >= date_trunc('month', CURRENT_DATE) AND submission_date IS NOT NULL AND LOWER(status::text) = 'yes' THEN 1 END) as completed,
        COUNT(CASE WHEN task_start_date::date >= date_trunc('month', CURRENT_DATE) AND task_start_date::date <= CURRENT_DATE AND submission_date IS NULL THEN 1 END) as pending,
        COUNT(CASE WHEN task_start_date::date >= date_trunc('month', CURRENT_DATE) AND submission_date IS NOT NULL AND LOWER(status::text) = 'no' THEN 1 END) as notdone,
        COUNT(CASE WHEN task_start_date::date = CURRENT_DATE + 1 THEN 1 END) as future
      FROM assign_task
      ${whereStr}
    `;
    try {
      const r = await pool.query(sql, qParams);
      if (r.rows[0]) {
        housekeepingCounts = {
          total: Number(r.rows[0].total || 0),
          completed: Number(r.rows[0].completed || 0),
          pending: Number(r.rows[0].pending || 0),
          notdone: Number(r.rows[0].notdone || 0),
          future: Number(r.rows[0].future || 0)
        };
      }
    } catch (e) {
      console.error("chatbot housekeeping summary error:", e.message);
    }
  }

  const totalSum = checklistCounts.total + maintenanceCounts.total + housekeepingCounts.total;
  const completedSum = checklistCounts.completed + maintenanceCounts.completed + housekeepingCounts.completed;
  const pendingSum = checklistCounts.pending + maintenanceCounts.pending + housekeepingCounts.pending;
  const notdoneSum = checklistCounts.notdone + maintenanceCounts.notdone + housekeepingCounts.notdone;
  const futureSum = checklistCounts.future + maintenanceCounts.future + housekeepingCounts.future;

  return {
    breakdown: [
      { module: "Total Tasks (aaj tak)", count: totalSum },
      { module: "Completed", count: completedSum },
      { module: "Pending", count: pendingSum },
      { module: "Not Done", count: notdoneSum },
      { module: "Future Tasks (Tomorrow)", count: futureSum }
    ],
    totalSum,
    completedSum,
    pendingSum,
    notdoneSum,
    futureSum
  };
}

/**
 * Detect if the user query is asking for task summary/count (so we can bypass LLM SQL).
 */
function detectTaskSummaryIntent(text) {
  const t = text.toLowerCase();
  
  // Completed patterns
  const completedPatterns = [
    /kitne\s+complete/,
    /completed\s+tasks?\s+count/,
    /kितने\s+complete/,
    /how\s+many.*complet/,
    /kaam\s+pur[aā]/,
  ];

  // Pending patterns
  const pendingPatterns = [
    /pending\s+tasks?/,
    /aaj\s+ke\s+pending/,
    /today.*pending/,
    /kitne\s+pending/,
    /baaki\s+kaam/,
  ];

  // Total / General summary patterns
  const totalPatterns = [
    /kitne\s+tasks?\s+(hain|hai|he)/,
    /how\s+many\s+tasks?/,
    /is\s+mahine\s+ke\s+.*(tasks?|checklist|kaam)/,
    /this\s+month.*tasks?\s+count/,
    /tasks?\s+count.*this\s+month/,
    /mere\s+tasks?\s+(kitne|count|kya|kaisa)/,
    /mera\s+(checklist|task)\s+status/,
    /checklist\s+ka\s+status/,
    /total\s+tasks?\s+this\s+month/,
    /monthly\s+tasks?\s+count/,
    /is\s+month.*kitne/,
    /tasks?\s+ke\s+baare\s+me/,
    /tasks?\s+summary/,
    /kaam\s+ke\s+baare\s+me/,
    /checklist\s+summary/,
    /tasks?\s+information/,
    /tasks?\s+info/,
    /status/,
    /summary/,
    /task/,
    /tasks/,
    /checklist/,
    /completed/,
    /pending/,
    /not\s+done/,
    /future/,
    /tomorrow/,
    /incomplete/,
    /aaj\s+tak/,
    /aaj\s+ke/,
    /details/,
  ];

  if (completedPatterns.some(p => p.test(t))) return "completed";
  if (pendingPatterns.some(p => p.test(t))) return "pending_today";
  if (totalPatterns.some(p => p.test(t))) return "total";
  return null;
}

/**
 * Detect if the user query is asking for a LIST of tasks for today or a date.
 * Returns: "today" | "month" | null
 */
function detectTaskListIntent(text) {
  const t = text.toLowerCase();
  const todayListPatterns = [
    /aaj\s+ke\s+(kya\s+kya\s+)?(tasks?|kaam|checklist)/,
    /today.*tasks?\s+(list|kya|kaun)/,
    /tasks?\s+(list\s+)?today/,
    /mere\s+aaj\s+ke/,
    /aaj\s+ke\s+mere/,
    /aaj\s+ka\s+(kaam|task)/,
    /today'?s?\s+(task|work|checklist)/,
    /what\s+are\s+my\s+tasks?\s+today/,
    /show\s+(me\s+)?(my\s+)?today.*tasks?/,
    /list\s+(of\s+)?(my\s+)?tasks?\s+(for\s+)?today/,
  ];
  const monthListPatterns = [
    /is\s+mahine\s+ke\s+(saare?|all|list)/,
    /this\s+month.*task\s+list/,
    /show\s+(me\s+)?(my\s+)?tasks?\s+(this\s+)?month/,
  ];

  if (todayListPatterns.some(p => p.test(t))) return "today";
  if (monthListPatterns.some(p => p.test(t))) return "month";
  return null;
}

/**
 * Directly fetch a list of tasks from DB for today or a date range.
 * Uses explicit CASTs to avoid UNION type mismatch errors from LLM-generated SQL.
 * Dashboard NEVER checks system_access — always queries all 3 tables.
 */
async function getDirectTaskList({ username, userRole, userDept, userDepts, dateFilter = "today" }) {
  const pg = await import("../config/postgres.js");
  const pool = pg.default;

  const isAdmin = userRole === "admin";
  const isRegularUser = userRole === "user";

  const allRows = [];

  // ---- CHECKLIST ----
  {
    const qParams = [];
    let pi = 1;
    const whereClauses = [];

    if (dateFilter === "today") {
      whereClauses.push(`task_start_date::date = CURRENT_DATE`);
    } else {
      whereClauses.push(`task_start_date::date >= date_trunc('month', CURRENT_DATE)`);
      whereClauses.push(`task_start_date::date <= CURRENT_DATE`);
    }

    if (isRegularUser) {
      whereClauses.push(`LOWER(name) = LOWER($${pi++})`);
      qParams.push(username);
    } else if (!isAdmin && userDept) {
      whereClauses.push(`LOWER(department) = LOWER($${pi++})`);
      qParams.push(userDept);
    }

    try {
      const r = await pool.query(
        `SELECT
          'Checklist'::text AS source,
          COALESCE(task_description, '')::text AS task_name,
          COALESCE(given_by, '')::text AS given_by,
          COALESCE(frequency, '')::text AS frequency,
          COALESCE(status::text, 'no')::text AS status,
          submission_date::text AS completed_at,
          COALESCE(delay::text, '')::text AS delay,
          task_start_date::text AS task_start_date
        FROM checklist
        WHERE ${whereClauses.join(" AND ")}
        ORDER BY task_start_date ASC, task_id ASC
        LIMIT 100`,
        qParams
      );
      allRows.push(...r.rows);
    } catch (e) {
      console.error("chatbot checklist list error:", e.message);
    }
  }

  // ---- MAINTENANCE ----
  {
    const qParams = [];
    let pi = 1;
    const whereClauses = [];

    if (dateFilter === "today") {
      whereClauses.push(`task_start_date::date = CURRENT_DATE`);
    } else {
      whereClauses.push(`task_start_date::date >= date_trunc('month', CURRENT_DATE)`);
      whereClauses.push(`task_start_date::date <= CURRENT_DATE`);
    }

    if (isRegularUser) {
      whereClauses.push(`LOWER(doer_name) = LOWER($${pi++})`);
      qParams.push(username);
    } else if (!isAdmin && userDept) {
      whereClauses.push(`LOWER(COALESCE(doer_department, machine_department)) = LOWER($${pi++})`);
      qParams.push(userDept);
    }

    try {
      const r = await pool.query(
        `SELECT
          'Maintenance'::text AS source,
          COALESCE(description, '')::text AS task_name,
          COALESCE(given_by, '')::text AS given_by,
          COALESCE(frequency, '')::text AS frequency,
          COALESCE(task_status::text, 'no')::text AS status,
          actual_date::text AS completed_at,
          COALESCE(delay::text, '')::text AS delay,
          task_start_date::text AS task_start_date
        FROM maintenance_task_assign
        WHERE ${whereClauses.join(" AND ")}
        ORDER BY task_start_date ASC, id ASC
        LIMIT 100`,
        qParams
      );
      allRows.push(...r.rows);
    } catch (e) {
      console.error("chatbot maintenance list error:", e.message);
    }
  }

  // ---- HOUSEKEEPING ----
  {
    const qParams = [];
    let pi = 1;
    const whereClauses = [];

    if (dateFilter === "today") {
      whereClauses.push(`task_start_date::date = CURRENT_DATE`);
    } else {
      whereClauses.push(`task_start_date::date >= date_trunc('month', CURRENT_DATE)`);
      whereClauses.push(`task_start_date::date <= CURRENT_DATE`);
    }

    if (isRegularUser) {
      whereClauses.push(`LOWER(name) = LOWER($${pi++})`);
      qParams.push(username);
    } else if (!isAdmin && userDepts.length > 0) {
      const placeholders = userDepts.map((_, i) => `$${pi + i}`).join(", ");
      whereClauses.push(`LOWER(department) = ANY(ARRAY[${placeholders}])`);
      qParams.push(...userDepts);
    }

    try {
      const r = await pool.query(
        `SELECT
          'Housekeeping'::text AS source,
          COALESCE(task_description, '')::text AS task_name,
          COALESCE(given_by, '')::text AS given_by,
          COALESCE(frequency, '')::text AS frequency,
          COALESCE(status::text, 'no')::text AS status,
          submission_date::text AS completed_at,
          COALESCE(delay::text, '')::text AS delay,
          task_start_date::text AS task_start_date
        FROM assign_task
        WHERE ${whereClauses.join(" AND ")}
        ORDER BY task_start_date ASC, id ASC
        LIMIT 100`,
        qParams
      );
      allRows.push(...r.rows);
    } catch (e) {
      console.error("chatbot housekeeping list error:", e.message);
    }
  }

  return allRows;
}

export const queryGeneral = async (req, res, next) => {
  try {
    const { queryText } = req.body;
    if (!queryText || !queryText.trim()) {
      return res.status(400).json({ error: "Query text is required." });
    }

    // 1. Extract and verify user JWT token from custom header "Authorization-User"
    const userTokenHeader = req.headers["authorization-user"];
    if (!userTokenHeader) {
      return res.status(401).json({ error: "User token header missing." });
    }

    const secret = getJwtSecret();
    if (!secret) {
      return res.status(500).json({ error: "JWT secret is not configured on backend." });
    }

    const token = userTokenHeader.split(" ")[1] || userTokenHeader;

    let decodedUser;
    try {
      decodedUser = jwt.verify(token, secret);
    } catch (err) {
      return res.status(401).json({ error: "Invalid user session token." });
    }

    const username = decodedUser.user_name || decodedUser.username;
    if (!username) {
      return res.status(400).json({ error: "Invalid user session payload." });
    }

    const userRole = (decodedUser.role || "").trim().toLowerCase();
    const userDesignation = (decodedUser.designation || "").trim().toLowerCase();
    const userDept = (decodedUser.department || "").trim();
    const userDiv = (decodedUser.division || "").trim();
    const systemAccess = (decodedUser.system_access || "").trim().toLowerCase();
    const userAccess1 = decodedUser.user_access1 || "";
    const userDepts = userAccess1.split(",").map(d => d.trim().toLowerCase()).filter(Boolean);

    // ─── DIRECT TASK LIST SHORTCUT ───────────────────────────────────────────
    // If user asks for a list of today's tasks, bypass LLM SQL to avoid UNION type errors.
    const listFilter = detectTaskListIntent(queryText);
    if (listFilter) {
      try {
        const taskRows = await getDirectTaskList({
          username, userRole, userDept, userDepts,
          dateFilter: listFilter
        });

        const kolkataDate3 = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        const todayStr = kolkataDate3.toLocaleDateString("en-CA");

        const dateLabel = listFilter === "today" ? `aaj (${todayStr})` : `is mahine (${todayStr} tak)`;

        let listMessage = "";
        if (taskRows.length === 0) {
          listMessage = `<p>Namaste <strong>${username}</strong>! ${dateLabel} ke liye koi tasks nahi mile.</p>`;
        } else {
          const doneCount = taskRows.filter(r => (r.status || "").toLowerCase() === "yes").length;
          const pendingCount = taskRows.length - doneCount;
          listMessage = `<p>Namaste <strong>${username}</strong>! Aapke <strong>${dateLabel}</strong> ke tasks (<strong>${taskRows.length} total</strong> — ${doneCount} done, ${pendingCount} pending):</p>`;
        }

        return res.status(200).json({
          success: true,
          resultType: "tasks",
          tasksList: taskRows,
          targetDate: todayStr,
          message: listMessage,
          summary: (() => {
            const map = {};
            taskRows.forEach(r => {
              if (!map[r.source]) map[r.source] = { module: r.source, total: 0, completed: 0, pending: 0 };
              map[r.source].total++;
              if ((r.status || "").toLowerCase() === "yes") map[r.source].completed++;
              else map[r.source].pending++;
            });
            return Object.values(map);
          })()
        });
      } catch (listErr) {
        console.error("Direct task list error:", listErr.message);
        // Fall through to normal OpenAI flow on error
      }
    }

    // ─── DIRECT TASK SUMMARY SHORTCUT ───────────────────────────────────────
    // If user is asking about task counts, bypass LLM SQL generation entirely.
    // This guarantees numbers match the dashboard 100%.
    const summaryType = detectTaskSummaryIntent(queryText);
    if (summaryType) {
      try {
        const result = await getDirectTaskSummary({
          username, userRole, userDept, userDiv, userDepts
        });
        const { breakdown, totalSum, completedSum, pendingSum, notdoneSum, futureSum } = result;

        const kolkataDate2 = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        const currentDateStr2 = kolkataDate2.toLocaleDateString("en-CA");

        let total = totalSum;
        if (summaryType === "completed") {
          total = completedSum;
        } else if (summaryType === "pending_today") {
          total = pendingSum;
        } else if (summaryType === "notdone") {
          total = notdoneSum;
        }

        const summaryRows = breakdown.map(b =>
          `<tr><td><strong>${b.module}</strong></td><td>${b.count}</td></tr>`
        ).join("");

        const summaryMessage = `
<p>Namaste <strong>${username}</strong>! Aapke tasks ka summary (${currentDateStr2} tak):</p>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
  <thead><tr><th>Status Category</th><th>Count</th></tr></thead>
  <tbody>${summaryRows}</tbody>
</table>
<br/>Agar kisi specific module ya date range ke baare mein jaanna chahte hain, toh zaroor poochhen!`;

        return res.status(200).json({
          success: true,
          resultType: "tasksCountBreakdown",
          isCount: true,
          breakdown,
          countType: summaryType,          // "total" | "completed" | "pending_today" | "notdone"
          totalNotDone: total,
          message: summaryMessage
        });
      } catch (directErr) {
        console.error("Direct task summary error:", directErr.message);
        // Fall through to normal OpenAI flow on error
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    // Make sure we have OpenAI key configured
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not configured on backend." });
    }

    // 2. Call OpenAI to analyze intent, parse queries and generate SQL
    // We'll give it the DB Schema and constraints.
    // Also supply the current date in Kolkata time.
    const kolkataDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const currentDateStr = kolkataDate.toLocaleDateString("en-CA"); // YYYY-MM-DD
    const currentTimeStr = kolkataDate.toLocaleTimeString("en-US", { hour12: false }); // HH:MM:SS


    const systemPrompt1 = `You are Sagar Pipe Agent, a highly intelligent database assistant for a PostgreSQL database.
Your role is to understand the user's input intent and translate it into a safe, read-only SQL query, conversational reply, or item search parameter.

CURRENT DATE IN KOLKATA (IST): ${currentDateStr} (Use this date to resolve relative date terms like "today", "yesterday", "tomorrow", "this week", "this month", "last month").
Current Time: ${currentTimeStr}

DATABASE SCHEMA INFORMATION:
1. Table: public.users
   - Description: Stores user profile records.
   - Columns:
     * user_name (VARCHAR): Unique username (e.g. 'aakash', 'sheelesh').
     * employee_id (VARCHAR): Unique employee identifier.
     * role (VARCHAR): System role (e.g. 'admin', 'hod', 'user').
     * designation (VARCHAR): Job title (e.g. 'manager', 'director', 'hod').
     * department (VARCHAR): Department name.
     * division (VARCHAR): Division name.
     * status (VARCHAR): 'active' or 'inactive'.

2. Table: public.checklist
   - Description: Daily operations tasks completed by users.
   - Columns:
     * name (VARCHAR): The username of the user performing the task (joins with users.user_name).
     * task_description (TEXT): Description of what needs to be checked.
     * given_by (VARCHAR): Person who assigned the task.
     * frequency (VARCHAR): Frequency of the task ('daily', 'weekly', 'monthly', 'quarterly').
     * status (VARCHAR): Status of completion ('yes' for completed, 'no' for not completed).
     * submission_date (TIMESTAMPTZ): Timestamp when the user submitted the task (NULL if not completed yet).
     * delay (VARCHAR): Information about delays.
     * task_start_date (DATE): Scheduled date for this task.
     * department (VARCHAR): Department this task belongs to.

3. Table: public.maintenance_task_assign
   - Description: Maintenance tasks assigned to specific doers.
   - Columns:
     * doer_name (VARCHAR): Username of the maintenance doer (joins with users.user_name).
     * description (TEXT): Description of the maintenance task.
     * given_by (VARCHAR): Person who assigned the task.
     * frequency (VARCHAR): Task frequency ('daily', 'weekly', 'monthly', 'quarterly').
     * task_status (VARCHAR): Status of completion ('yes' for completed, 'no' for not completed).
     * actual_date (TIMESTAMPTZ): Timestamp when task was completed (NULL if not completed yet).
     * delay (VARCHAR): Information about delays.
     * task_start_date (DATE): Scheduled date for the task.
     * doer_department (VARCHAR): Department of the doer.
     * machine_department (VARCHAR): Department of the machine.

4. Table: public.assign_task
   - Description: Housekeeping tasks assigned to departments.
   - Columns:
     * department (VARCHAR): Department responsible for the task.
     * name (VARCHAR): Username of the user responsible (joins with users.user_name).
     * task_description (TEXT): Task details.
     * given_by (VARCHAR): Person who assigned the task.
     * frequency (VARCHAR): Frequency of the task ('daily', 'weekly', 'monthly', 'quarterly').
     * status (VARCHAR): Status of completion ('yes' for completed, 'no' for not completed).
     * submission_date (TIMESTAMPTZ): Completion timestamp (NULL if not completed yet).
     * delay (VARCHAR): Information about delays.
     * task_start_date (DATE): Scheduled date for the task.
     * hod (TEXT): Comma-separated list of HOD usernames/names supervising the task (e.g. 'amit, manoj').

5. Table: public.repair_system
   - Description: Breakdown repair maintenance requests for machines and equipment.
   - Columns:
     * id (SERIAL PRIMARY KEY)
     * time_stamp (TIMESTAMPTZ): Time when the request was entered.
     * task_no (VARCHAR): Unique task identifier.
     * serial_no (VARCHAR): Serial number.
     * machine_name (TEXT): Name of the machine requiring repair.
     * machine_part_name (TEXT): Specific part needing repair.
     * given_by (VARCHAR): Person reporting/assigning the repair.
     * doer_name (VARCHAR): Person performing the repair.
     * problem_with_machine (TEXT): Description of the issue.
     * enable_reminders (BOOLEAN)
     * require_attachment (BOOLEAN)
     * task_start_date (DATE)
     * task_ending_date (DATE)
     * priority (VARCHAR): 'high', 'medium', 'low'.
     * department (VARCHAR)
     * location (VARCHAR)
     * image_link (TEXT)
     * status (VARCHAR): Current status of the repair (e.g., 'pending', 'completed').
     * created_at, updated_at (TIMESTAMPTZ)

6. Table: public.repair_followup
   - Description: Repair gate pass follow-up tracking for items sent outside for repair.
   - Columns:
     * id (SERIAL PRIMARY KEY)
     * gate_pass_date (DATE)
     * gate_pass_no (VARCHAR)
     * department (VARCHAR)
     * party_name (VARCHAR): External vendor/party name.
     * item_name (TEXT)
     * item_code (VARCHAR)
     * remarks (TEXT)
     * uom (VARCHAR)
     * qty_issued (NUMERIC)
     * lead_time (INTEGER)
     * planned1, actual1 (DATE), time_delay1 (INTEGER), stage1_status (VARCHAR)
     * planned2, actual2 (DATE), time_delay2 (INTEGER), stage2_status (VARCHAR)
     * gate_pass_status (VARCHAR): Status of the gate pass (e.g., 'pending', 'returned').
     * extended_date (DATE)

USER PROFILE & ROW-LEVEL DATA VISIBILITY CONSTRAINTS:
The logged-in user running this query is:
- Username: ${username}
- Role: ${userRole}
- Designation: ${userDesignation}
- Department: ${userDept}
- Division: ${userDiv}
- System Access Modules: ${systemAccess} (e.g. contains checklist, maintenance, housekeeping)
- Allowed Housekeeping Departments (user_access1): ${userDepts.join(', ')}

EXACT ROW-LEVEL DATA FILTER RULES (match the dashboard exactly):
These rules define which rows each user can see. Apply them strictly in every SQL query.

RULE 1 - For 'admin' role:
  → No name/department/division filter. Admin sees ALL records across all users.
  → If a staff filter name is mentioned explicitly (e.g., "show tasks of manoj"), add: LOWER(name) = LOWER('manoj') for checklist/assign_task, LOWER(doer_name) = LOWER('manoj') for maintenance_task_assign.

RULE 2 - For regular user (role = 'user'):
  → ALWAYS filter by their own name only. No exceptions.
  → For checklist table: LOWER(name) = LOWER('${username}')
  → For maintenance_task_assign: LOWER(doer_name) = LOWER('${username}')
  → For assign_task: LOWER(name) = LOWER('${username}')

RULE 3 - For managers and HODs (role is NOT 'user' AND NOT 'admin'):
  → They see ALL records for their team. Do NOT filter by their own name.
  → Manager sees all tasks in their department: filter checklist by department = '${userDept}', assign_task by department = '${userDept}'.
  → HOD sees all tasks in their division: join with users table on division = '${userDiv}'.
  → If user explicitly asks "my tasks" or "meri tasks", then add name filter for their own name only.
  → For maintenance_task_assign for managers/HODs: filter by COALESCE(doer_department, machine_department) = '${userDept}' (for manager) or join users for division filter (for HOD).

TASK DEFINITIONS (match dashboard exactly):
- "Total tasks this month": All tasks with task_start_date between first day of current month and today (inclusive). Do NOT filter by status.
- "Completed tasks this month": Tasks with task_start_date in current month range AND (status ILIKE 'yes' for checklist/assign_task, task_status ILIKE 'yes' AND actual_date IS NOT NULL for maintenance_task_assign).
- "Pending tasks" / "Aaj ke pending tasks": Tasks with task_start_date::date = CURRENT_DATE AND submission_date IS NULL (for checklist/assign_task) OR actual_date IS NULL (for maintenance). This is today's unsubmitted tasks.
- "Overdue tasks": Tasks with task_start_date::date < CURRENT_DATE AND submission_date IS NULL (within current month).
- "Upcoming tasks": Tasks with task_start_date::date = (CURRENT_DATE + INTERVAL '1 day')::date AND submission_date IS NULL.
- "Not done / incomplete tasks": Tasks with LOWER(status) = 'no' (or LOWER(task_status) = 'no' for maintenance) within current month range.
- "Score": Completed tasks count / Total tasks count × 100 for the period.

IMPORTANT: When user asks about their "checklist status" or "dashboard" or "tasks today", the dashboard shows:
  - Total tasks = checklist + maintenance + housekeeping combined count for current month
  - Completed = checklist + maintenance + housekeeping completed combined
  - Pending = today's unsubmitted tasks combined from all 3 sources
  Generate 3 separate COUNT queries and combine using UNION ALL for accuracy, or use a single CTE.

GENERAL TASK QUERY RULES:
- CASE-INSENSITIVE MATCHING FOR STATUS AND NAMES:
  * Whenever you filter by status, completion, or task_status (e.g., comparing with 'yes' or 'no'), you must ALWAYS use LOWER(status) = 'yes' (or 'no') or status ILIKE 'yes' (or 'no'). The database values are mixed case (like 'Yes', 'no', 'No', 'yes'), so case-sensitive matches like status = 'yes' will FAIL.
  * Whenever you compare user names, doer names, or employee names (like name, doer_name, user_name), you must ALWAYS use LOWER(column) = LOWER($X) or column ILIKE $X to ensure safety against casing differences.
- CRITICAL: NEVER JOIN public.users table when querying checklist, maintenance_task_assign, or assign_task for task counts or task lists. The user identity is already embedded in the name/doer_name columns. Joining users causes row multiplication and inflated counts. Filter directly: e.g. LOWER(name) = LOWER($1), LOWER(doer_name) = LOWER($1).
- CRITICAL: For maintenance_task_assign, the user's name is in the "doer_name" column, NOT "name". Always use doer_name for filtering, not name.
- When the user asks for "tasks", "checklist", "my tasks", "score", or "performance", they are referring to the tasks in public.checklist, public.maintenance_task_assign, and public.assign_task.
- If they ask for count or list of general tasks, you should query/union these three tables (public.checklist, public.maintenance_task_assign, public.assign_task).
- DO NOT query public.repair_system or public.repair_followup unless they specifically mention "repair", "breakdown", "machine", "repair system", "repair followup", or "gate pass".
- For daily tasks list queries, the output columns should match resultType: "tasks" (source, task_name, given_by, frequency, status, completed_at, delay, task_start_date).
- For uncompleted tasks count query (ONLY when they specify uncompleted, pending, incomplete, missed, or failed, e.g. "not done count"), the output columns must be: module (e.g. 'Checklist', 'Maintenance', 'Housekeeping') and count.
- If they ask for total count of tasks (e.g., "kitne tasks hain", "how many tasks do I have", "total tasks count" without specifying "not done" / "pending"), DO NOT filter by status = 'no' or status = 'yes'. Generate a SELECT query that counts the total number of tasks (completed and uncompleted combined) for the user. Keep it scoped to the requested date range (like "this month" -> date_trunc('month', CURRENT_DATE) or similar). Use resultType = 'general' if the output doesn't match standard card shapes.
- Current month range for queries: task_start_date >= date_trunc('month', CURRENT_DATE) AND task_start_date <= CURRENT_DATE
- EXAMPLE correct query for a regular user's total tasks this month (NO JOIN with users):
  SELECT
    'Checklist' AS module, COUNT(*) AS count FROM checklist WHERE LOWER(name) = LOWER($1) AND task_start_date >= date_trunc('month', CURRENT_DATE) AND task_start_date <= CURRENT_DATE
  UNION ALL
  SELECT 'Maintenance' AS module, COUNT(*) AS count FROM maintenance_task_assign WHERE LOWER(doer_name) = LOWER($1) AND task_start_date >= date_trunc('month', CURRENT_DATE) AND task_start_date <= CURRENT_DATE
  UNION ALL
  SELECT 'Housekeeping' AS module, COUNT(*) AS count FROM assign_task WHERE LOWER(name) = LOWER($1) AND task_start_date >= date_trunc('month', CURRENT_DATE) AND task_start_date <= CURRENT_DATE

INTENT CLASSIFICATION RULES:
Determine the intent of the user's query and output a JSON response:
- "conversational": Standard greetings (e.g., hello, namaste, hi), gratitude, polite conversation, or general non-database questions.
- "search_item": If the user is asking to look up a store item, check item stock, or raise an indent (e.g. "show me stock of bearing", "check item bolt", "indent of pipe"). You must extract the clean item search term (e.g. "bearing", "bolt", "pipe").
- "modify_blocked": If the query tries to modify the database (inserts, updates, deletes, alters, drops, etc.).
- "sql_query": If the user wants to fetch data from any of the schemas. You must construct a valid PostgreSQL query. Always use parameterized placeholders ($1, $2, etc.) for variables (like usernames, statuses, dates, names) and list the values in the "params" array.

OUTPUT FORMAT:
Your response must be a single, valid, raw JSON object. Do not wrap it in markdown backticks or any other text.
JSON Structure:
{
  "intent": "conversational" | "search_item" | "modify_blocked" | "sql_query" | "error",
  "sql": "SELECT ...", // ONLY if intent is sql_query
  "params": [], // placeholders values corresponding to $1, $2... in the SQL query
  "resultType": "users" | "tasks" | "tasksSummary" | "taskDiagnostic" | "tasksCountBreakdown" | "scoreData" | "general", // ONLY if intent is sql_query
  "reply": "Standard conversational message...", // ONLY if intent is conversational, modify_blocked, or error
  "searchTerm": "Clean search term..." // ONLY if intent is search_item
}

Keep SQL queries clean, optimal, and strictly read-only SELECT. Always select explicit columns rather than SELECT *. Keep row limits reasonable (LIMIT 30 or 50).`;

    // Perform OpenAI Call 1
    let aiResponse;
    try {
      const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt1 },
            { role: "user", content: queryText }
          ],
          temperature: 0.1
        },
        {
          headers: {
            "Authorization": `Bearer ${openaiKey}`,
            "Content-Type": "application/json"
          }
        }
      );
      aiResponse = JSON.parse(response.data.choices[0].message.content.trim());
    } catch (err) {
      console.error("OpenAI Call 1 error:", err.message);
      return res.status(200).json({
        success: false,
        error: "OpenAI context lookup failed. Please try again."
      });
    }

    const { intent, sql, params, resultType, reply, searchTerm } = aiResponse;

    if (intent === "conversational") {
      return res.status(200).json({
        success: true,
        resultType: "general",
        message: reply
      });
    }

    if (intent === "modify_blocked") {
      return res.status(200).json({
        success: false,
        message: "मुझे क्षमा करें, मुझे केवल डेटा दिखाने की अनुमति है। यदि आपका यह कार्य बहुत आवश्यक है, तो कृपया ऑटोमेशन टीम से संपर्क करें।\n\n(I apologize, I only have permission to display data. If it is essential for you to perform this action, please contact the Automation Team.)"
      });
    }

    if (intent === "search_item") {
      // Redirect to standard searchItems
      const items = await chatbotService.searchItems((searchTerm || queryText).trim());
      return res.status(200).json({
        success: true,
        resultType: "items",
        items
      });
    }

    if (intent === "sql_query" && sql) {
      // 3. Strict safety checks on generated SQL
      const trimmedSql = sql.trim().toLowerCase();
      const forbiddenKeywords = /\b(insert|update|delete|drop|alter|truncate|create|replace|grant|revoke|set|rename)\b/i;
      const startsWithSelectOrWith = trimmedSql.startsWith("select") || trimmedSql.startsWith("with");

      if (!startsWithSelectOrWith || forbiddenKeywords.test(trimmedSql)) {
        return res.status(200).json({
          success: false,
          message: "मुझे क्षमा करें, मुझे केवल डेटा दिखाने की अनुमति है। यदि आपका यह कार्य बहुत आवश्यक है, तो कृपया ऑटोमेशन टीम से संपर्क करें।\n\n(I apologize, I only have permission to display data. If it is essential for you to perform this action, please contact the Automation Team.)"
        });
      }

      // Execute SQL in Postgres
      let dbRows = [];
      try {
        const pg = await import("../config/postgres.js");
        const pool = pg.default;
        const queryResult = await pool.query(sql, params || []);
        dbRows = queryResult.rows;
      } catch (dbErr) {
        console.error("Postgres execution error on LLM query:", dbErr.message);
        console.error("SQL tried:", sql, "Params:", params);
        return res.status(200).json({
          success: false,
          error: "डेटाबेस क्वेरी निष्पादित करते समय त्रुटि हुई। (Error executing query in database: " + dbErr.message + ")"
        });
      }

      // 4. Summarize results using OpenAI Call 2
      const systemPrompt2 = `You are Sagar Pipe Agent, a database query explainer.
The user asked: "${queryText}"
The SQL run was: "${sql}"
The parameters were: ${JSON.stringify(params)}
The database returned the following rows:
${JSON.stringify(dbRows.slice(0, 50), null, 2)}

Your task is to write a short, professional, and friendly response in Hinglish/Hindi/English summarizing these results for the user.
Use basic HTML tags for styling (like <strong>, <br/>, <ul>, <li>, <table>, <tr>, <td>, <th>, <thead>, <tbody>) to make the response look polished.
If no data was found, state it politely.
Do not output raw json or markdown code. Just output clean HTML message.`;

      let summaryText = "";
      try {
        const response2 = await axios.post(
          "https://api.openai.com/v1/chat/completions",
          {
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: systemPrompt2 }
            ],
            temperature: 0.3
          },
          {
            headers: {
              "Authorization": `Bearer ${openaiKey}`,
              "Content-Type": "application/json"
            }
          }
        );
        summaryText = response2.data.choices[0].message.content.trim();
      } catch (err) {
        console.error("OpenAI Call 2 error:", err.message);
        summaryText = `मैंने क्वेरी चला ली है और मुझे ${dbRows.length} परिणाम मिले हैं। (Executed query and got ${dbRows.length} results).`;
      }

      // Return the summarized message and map standard cards for frontend compatibility
      const resPayload = {
        success: true,
        resultType,
        message: summaryText
      };

      // Map DB results to match existing frontend card fields if appropriate
      if (resultType === "users") {
        resPayload.users = dbRows.map(r => ({
          user_name: r.user_name || "",
          employee_id: r.employee_id || r.emp_id || "",
          role: r.role || "",
          designation: r.designation || "",
          department: r.department || "",
          division: r.division || "",
          status: r.status || ""
        }));
      } else if (resultType === "tasks") {
        resPayload.tasksList = dbRows.map(r => ({
          source: r.source || "Checklist",
          task_name: r.task_name || r.task_description || r.description || "",
          given_by: r.given_by || "",
          frequency: r.frequency || "",
          status: r.status || r.task_status || "",
          completed_at: r.completed_at || r.submission_date || r.actual_date || null,
          delay: r.delay || null,
          task_start_date: r.task_start_date || ""
        }));
        // Compute counts to show the summary badge if tasks lists are returned
        const summaryMap = {};
        dbRows.forEach(r => {
          const src = r.source || "Checklist";
          if (!summaryMap[src]) summaryMap[src] = { module: src, total: 0, completed: 0, pending: 0 };
          summaryMap[src].total++;
          const statusVal = String(r.status || r.task_status || "").toLowerCase();
          if (statusVal === "yes" || r.completed_at || r.submission_date || r.actual_date) {
            summaryMap[src].completed++;
          } else {
            summaryMap[src].pending++;
          }
        });
        resPayload.summary = Object.values(summaryMap);
        resPayload.targetDate = dbRows[0]?.task_start_date || currentDateStr;
      } else if (resultType === "tasksSummary") {
        resPayload.summary = dbRows.map(r => ({
          module: r.module || r.source || "Checklist",
          total: Number(r.total || r.total_tasks || r.count || 0),
          completed: Number(r.completed || r.completed_tasks || 0),
          pending: Number(r.pending || r.pending_tasks || r.count || 0)
        }));
        resPayload.targetDate = currentDateStr;
      } else if (resultType === "taskDiagnostic") {
        const latestRow = dbRows[0];
        if (latestRow) {
          resPayload.isDiagnostic = true;
          resPayload.latestTask = {
            source: latestRow.source || "Checklist",
            task_name: latestRow.task_name || latestRow.task_description || latestRow.description || "",
            task_start_date: latestRow.task_start_date || "",
            submission_date: latestRow.completed_at || latestRow.submission_date || latestRow.actual_date || "",
            status: latestRow.status || latestRow.task_status || ""
          };
          resPayload.diagnosis = summaryText; // Use LLM response as diagnosis details
        }
      } else if (resultType === "tasksCountBreakdown") {
        resPayload.isCount = true;
        resPayload.breakdown = dbRows;
        resPayload.totalNotDone = dbRows.reduce((a, b) => a + Number(b.count || 0), 0);
      } else if (resultType === "scoreData") {
        resPayload.isScore = true;
        resPayload.scoreData = dbRows[0] || null;
        resPayload.startDate = dbRows[0]?.start_date || currentDateStr;
        resPayload.endDate = dbRows[0]?.end_date || currentDateStr;
      }

      return res.status(200).json(resPayload);
    }

    return res.status(200).json({
      success: false,
      error: "Unable to parse intent."
    });

  } catch (err) {
    next(err);
  }
};

export const queryUsers = async (req, res, next) => {
  return queryGeneral(req, res, next);
};

export const queryTasks = async (req, res, next) => {
  return queryGeneral(req, res, next);
};
