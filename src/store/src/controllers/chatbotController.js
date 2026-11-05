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
    console.warn("searchItems error (Oracle DB down):", err.message);
    res.status(200).json([]);
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
    console.warn("getItemStock error (Oracle DB down):", err.message);
    res.status(200).json({ stock: 0 });
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
    console.warn("getIndentSeries error (Oracle DB down):", err.message);
    res.status(200).json([]);
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
    console.warn("getDepartments error (Oracle DB down):", err.message);
    res.status(200).json([]);
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
    console.warn("getCostCodes error (Oracle DB down):", err.message);
    res.status(200).json([]);
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
    console.warn("getEmployees error (Oracle DB down):", err.message);
    res.status(200).json([]);
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
    console.warn("getMakes error (Oracle DB down):", err.message);
    res.status(200).json([]);
  }
};

/**
 * Endpoint to list distinct task departments across checklist/maintenance/
 * housekeeping/delegation (Postgres side — separate from the Oracle store
 * departments returned by getDepartments()). Used to power the admin-only
 * "Department Report" quick action in the chatbot intro panel.
 */
export const getTaskDepartments = async (req, res, next) => {
  try {
    const pg = await import("../config/postgres.js");
    const pool = pg.default;
    const result = await pool.query(`
      SELECT department FROM (
        SELECT department FROM checklist WHERE department IS NOT NULL
        UNION
        SELECT COALESCE(doer_department, machine_department) AS department FROM maintenance_task_assign
        UNION
        SELECT doer_department AS department FROM assign_task WHERE doer_department IS NOT NULL
        UNION
        SELECT department FROM delegation WHERE department IS NOT NULL
      ) d
      WHERE department IS NOT NULL AND TRIM(department) <> ''
      ORDER BY department ASC
    `);
    res.status(200).json(result.rows.map((r) => r.department));
  } catch (err) {
    console.warn("getTaskDepartments error:", err.message);
    res.status(200).json([]);
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
        COUNT(CASE WHEN task_start_date::date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND task_start_date::date <= CURRENT_DATE AND submission_date IS NULL THEN 1 END) as pending,
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
        COUNT(CASE WHEN task_start_date::date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND task_start_date::date <= CURRENT_DATE AND actual_date IS NULL THEN 1 END) as pending,
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
        COUNT(CASE WHEN task_start_date::date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND task_start_date::date <= CURRENT_DATE AND submission_date IS NULL THEN 1 END) as pending,
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
/**
 * Parse date or period from query text.
 */
const MONTH_NAME_TO_INDEX = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
};

/**
 * Detect an explicit date RANGE ("1 july se 10 july tak", "2026-07-01 to 2026-07-10",
 * "01-07-2026 se 10-07-2026") in free text. Returns { from, to } (YYYY-MM-DD strings)
 * or null. Must run before single-date parsing, which would otherwise greedily grab
 * just the first date and silently drop the "...to X" part of a range.
 */
function parseDateRange(text) {
  const t = text.toLowerCase();
  const pad = (n) => String(n).padStart(2, "0");

  // "YYYY-MM-DD se/to YYYY-MM-DD"
  let m = t.match(/(\d{4}-\d{2}-\d{2})\s*(?:se|to|se\s*lekar|-)\s*(\d{4}-\d{2}-\d{2})/);
  if (m) return { from: m[1], to: m[2] };

  // "DD-MM-YYYY se/to DD-MM-YYYY"
  m = t.match(/(\d{2})[-/](\d{2})[-/](\d{4})\s*(?:se|to)\s*(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (m) {
    return { from: `${m[3]}-${m[2]}-${m[1]}`, to: `${m[6]}-${m[5]}-${m[4]}` };
  }

  // "1 july se 10 july tak" / "1 to 10 july" (month name mentioned once or twice)
  const monthNames = Object.keys(MONTH_NAME_TO_INDEX).join("|");
  m = t.match(new RegExp(`\\b(\\d{1,2})\\s*(${monthNames})?\\s*(?:se|to)\\s*(\\d{1,2})\\s*(${monthNames})\\b`, "i"));
  if (m) {
    const day1 = parseInt(m[1], 10);
    const day2 = parseInt(m[3], 10);
    const month2Idx = MONTH_NAME_TO_INDEX[m[4].toLowerCase()];
    const month1Idx = m[2] ? MONTH_NAME_TO_INDEX[m[2].toLowerCase()] : month2Idx;
    if (day1 >= 1 && day1 <= 31 && day2 >= 1 && day2 <= 31 && month1Idx !== undefined) {
      const year = new Date().getFullYear();
      return {
        from: `${year}-${pad(month1Idx + 1)}-${pad(day1)}`,
        to: `${year}-${pad(month2Idx + 1)}-${pad(day2)}`
      };
    }
  }

  return null;
}

function parseDateFilter(text) {
  const t = text.toLowerCase();

  // Check for an explicit date RANGE first — single-date matching below would
  // otherwise greedily grab just the first date and ignore the "...to X" part.
  const range = parseDateRange(t);
  if (range) return range;

  // Custom date pattern (YYYY-MM-DD)
  const yyyymmdd = t.match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (yyyymmdd) return yyyymmdd[0];
  
  // Custom date pattern (DD-MM-YYYY)
  const ddmmyyyy = t.match(/(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (ddmmyyyy) {
    const parts = ddmmyyyy[0].split(/[-/]/);
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }

  if (/\b(today|aaj)\b/.test(t)) return "today";
  
  // Intercept ambiguous 'kal' (could mean yesterday or tomorrow)
  if (/\bkal\b/.test(t) && !/\b(yesterday|bita|beeta|pass|pehle|tomorrow|aane|aane\s+wala|aane\s+vale)\b/.test(t)) {
    return "ambiguous_kal";
  }
  
  if (/\b(yesterday|kal\s+(bita|beeta|pass))\b/.test(t) || (/\bkal\b/.test(t) && !/\b(tomorrow|aane|aane\s+wala|aane\s+vale)\b/.test(t))) {
    return "yesterday";
  }
  if (/\b(tomorrow|kal\s+aane|aane\s+wala|aane\s+vale)\b/.test(t)) return "tomorrow";
  // "Not done" = task was already submitted with status 'no' (distinct from "pending" = not yet submitted).
  if (/not[\s-]*done|nahi\s+hua|nahi\s+kiya|असफल|फेल/.test(t)) return "notdone";
  if (/\b(pending|losh|incomplete|uncompleted|baaki|incomplete)\b/.test(t)) return "pending";
  if (/\b(month|mahina|is\s+mahine)\b/.test(t)) return "month";
  
  return null;
}

// Common filler words to strip out when pulling a candidate department name
// out of free text like "mujhe automation department ke tasks dikhao".
const DEPARTMENT_PHRASE_STOPWORDS = new Set([
  "mujhe", "ke", "ka", "ki", "hai", "ho", "mera", "meri", "humein", "hume",
  "is", "ye", "wo", "kitne", "kitna", "kitni", "tasks", "task", "pending",
  "dekhna", "dekhni", "dekhne", "chahiye", "please", "show", "me", "the",
  "batao", "dikhao", "kya", "hain", "sabhi", "all", "of", "for", "in", "and"
]);

/**
 * Pull a candidate department name out of free text like
 * "automation department ke kitne tasks pending hai" -> "automation".
 * Looks at the 1-3 tokens immediately before the word department/dept/vibhag.
 */
function extractDepartmentPhrase(text) {
  const tokens = text.toLowerCase().replace(/[^\w\sऀ-ॿ]/g, " ").split(/\s+/).filter(Boolean);
  const deptIdx = tokens.findIndex((t) => t === "department" || t === "dept" || t === "vibhag" || t === "विभाग");
  if (deptIdx === -1) return null;

  const candidates = [];
  for (let i = Math.max(0, deptIdx - 3); i < deptIdx; i++) {
    if (!DEPARTMENT_PHRASE_STOPWORDS.has(tokens[i])) candidates.push(tokens[i]);
  }
  const phrase = candidates.join(" ").trim();
  return phrase.length >= 2 ? phrase : null;
}

const MODULE_KEYWORD_PATTERNS = {
  checklist: /\bchecklist\b/,
  maintenance: /\bmaintenance\b/,
  housekeeping: /\bhousekeeping\b/,
  delegation: /\bdelegation\b/
};

/**
 * Detect whether the query names exactly ONE of the four task modules
 * (checklist/maintenance/housekeeping/delegation), e.g. "delegation me aaj ke
 * kitne tasks pending hain". If none or more than one are named, returns null
 * so the query stays scoped to all four modules combined (the normal case).
 */
function extractModuleFilter(text) {
  const matched = Object.keys(MODULE_KEYWORD_PATTERNS).filter((key) => MODULE_KEYWORD_PATTERNS[key].test(text));
  return matched.length === 1 ? matched[0] : null;
}

/**
 * Resolve a fuzzy department phrase against the real department values used
 * across checklist/maintenance/housekeeping/delegation, so "automation" matches
 * the actual stored value (e.g. "AUTOMATION") regardless of exact casing/spacing.
 */
async function resolveExplicitDepartment(pool, phrase) {
  if (!phrase) return null;
  const needle = phrase.trim().toLowerCase();
  if (!needle) return null;

  const result = await pool.query(
    `SELECT department FROM (
      SELECT department FROM checklist WHERE department IS NOT NULL
      UNION
      SELECT COALESCE(doer_department, machine_department) AS department FROM maintenance_task_assign
      UNION
      SELECT doer_department AS department FROM assign_task WHERE doer_department IS NOT NULL
      UNION
      SELECT department FROM delegation WHERE department IS NOT NULL
    ) d
    WHERE department IS NOT NULL AND LOWER(department) LIKE '%' || $1 || '%'
    ORDER BY LENGTH(department) ASC
    LIMIT 1`,
    [needle]
  );

  return result.rows[0]?.department || null;
}

// Words to strip out when pulling a candidate staff/employee name out of free
// text like "ajit kumar gupta ke tasks dikhao" or "tasks for manoj".
const STAFF_NAME_PHRASE_STOPWORDS = new Set([
  ...DEPARTMENT_PHRASE_STOPWORDS,
  "aaj", "kal", "today", "yesterday", "tomorrow", "month", "mahine",
  "department", "dept", "vibhag", "checklist", "maintenance", "housekeeping",
  "delegation", "not", "done", "nahi", "hua", "kiya", "kon", "se", "liye",
  "employee", "staff", "user", "person", "wale", "waale"
]);

/**
 * Pull a candidate staff/employee name out of free text like
 * "ajit kumar gupta ke kitne tasks pending hain" -> "ajit kumar gupta".
 * Looks at the tokens immediately before a "ke"/"ka"/"ki" connector, mirroring
 * the phrase-then-connector shape used to ask about a specific person's tasks.
 */
function extractStaffNamePhrase(text) {
  const tokens = text.toLowerCase().replace(/[^\w\sऀ-ॿ]/g, " ").split(/\s+/).filter(Boolean);
  const connectorIdx = tokens.findIndex((t) => t === "ke" || t === "ka" || t === "ki");
  if (connectorIdx === -1) return null;

  const candidates = [];
  for (let i = Math.max(0, connectorIdx - 4); i < connectorIdx; i++) {
    if (!STAFF_NAME_PHRASE_STOPWORDS.has(tokens[i])) candidates.push(tokens[i]);
  }
  // Require >= 3 chars: a short 2-char code (e.g. "pc") is far more likely a
  // department/location code than a person's name, and a fuzzy LIKE match on
  // just 2 characters risks false-positive substring hits inside unrelated
  // full names (e.g. "pc" matched inside "Bopche").
  const phrase = candidates.join(" ").trim();
  return phrase.length >= 3 ? phrase : null;
}

/**
 * Resolve a fuzzy name phrase against real usernames stored in public.users
 * (task tables' name/doer_name columns join against users.user_name, and per
 * staffTasksController this holds full display names like "Sheelesh Marele",
 * not just logins). Returns null when nothing matches, which is what keeps a
 * false-positive phrase extraction (e.g. a stray date word) harmless — the
 * caller falls back to the normal unfiltered/own-username behavior.
 */
async function resolveExplicitStaffName(pool, phrase) {
  if (!phrase) return null;
  const needle = phrase.trim().toLowerCase();
  if (!needle) return null;

  const result = await pool.query(
    `SELECT user_name FROM public.users
     WHERE user_name IS NOT NULL AND LOWER(user_name) LIKE '%' || $1 || '%'
     ORDER BY LENGTH(user_name) ASC
     LIMIT 1`,
    [needle]
  );

  return result.rows[0]?.user_name || null;
}

/**
 * Unified helper to intercept direct task queries.
 */
async function handleDirectTaskInterception({ queryText, username, userRole, userDept, userDepts }) {
  const cleanText = queryText.toLowerCase();
  
  // Match any query about tasks
  const isTaskQuery = /(task|tasks|checklist|maintenance|housekeeping|delegation|kaam|काम|ड्यूटी|duty|schedule|not done|uncompleted|incomplete|missed|fail|score|performance|marks|points|स्कोर|प्रदर्शन|मार्क्स)/i.test(cleanText);
  if (!isTaskQuery) return null;

  // If an elevated role (admin/manager/hod) explicitly names a department
  // ("automation department ke tasks"), scope the query to that department
  // instead of forcing it to the requester's own username — a plain "user"
  // role (or a missing/blank role, which must NOT be treated as elevated)
  // can never do this, it always stays scoped to their own tasks.
  // This (and the module scope below) must be resolved BEFORE any early-return
  // "which date?" prompt, so its follow-up buttons can carry the same scope
  // forward instead of silently reverting to all-modules/own-username.
  const isElevatedRole = Boolean(userRole) && userRole !== "user";

  // A literal "department"/"dept"/"vibhag" keyword is a precise, unambiguous
  // signal and must be checked FIRST — e.g. "PC department ke tasks" should
  // resolve "PC" as a department, not risk the generic staff-name heuristic
  // below fuzzy-matching a short code like "pc" against an unrelated person's
  // name (it previously matched "Anup Kumar Bo-PC-he" this way). Only when no
  // department keyword/phrase resolves do we try treating the phrase as a
  // named staff member ("ajit kumar gupta ke tasks" has no "department" word).
  let explicitStaffName = null;
  let explicitDept = null;
  if (isElevatedRole) {
    const deptPhrase = extractDepartmentPhrase(cleanText);
    if (deptPhrase) {
      try {
        const pg = await import("../config/postgres.js");
        explicitDept = await resolveExplicitDepartment(pg.default, deptPhrase);
      } catch (deptErr) {
        console.error("Department resolution error:", deptErr.message);
      }
    }

    if (!explicitDept) {
      const namePhrase = extractStaffNamePhrase(cleanText);
      if (namePhrase) {
        try {
          const pg = await import("../config/postgres.js");
          explicitStaffName = await resolveExplicitStaffName(pg.default, namePhrase);
        } catch (nameErr) {
          console.error("Staff name resolution error:", nameErr.message);
        }
      }
    }
  }

  // If the query names exactly one module ("delegation me...", "housekeeping
  // ke...") scope everything to just that module instead of all four.
  const moduleFilter = extractModuleFilter(cleanText);

  // Appended to every follow-up button's action text below so a resolved
  // module/department/staff-name scope survives into the next request
  // (parseDateFilter/extractModuleFilter/extractDepartmentPhrase/
  // extractStaffNamePhrase re-parse that text from scratch). The staff-name
  // suffix is phrased with "ke" so extractStaffNamePhrase's connector-based
  // extraction picks it back up.
  const scopeSuffix = (moduleFilter ? ` in ${moduleFilter}` : "") +
    (explicitDept ? ` in ${explicitDept} department` : "") +
    (explicitStaffName ? ` for ${explicitStaffName} ke tasks` : "");

  // Check if a date filter is specified
  const dateFilter = parseDateFilter(cleanText);
  if (!dateFilter) {
    // Ask for the date/details first
    return {
      success: true,
      resultType: "general",
      message: "Aap kis date (तारीख) ya category ke tasks dekhna chahte hain? Kripya options me se select karein, single date type karein (e.g., YYYY-MM-DD), ya date range batayein (e.g., '01-07-2026 se 10-07-2026 tak'):",
      options: [
        { label: "📅 Today / आज", action: `today's tasks${scopeSuffix}` },
        { label: "📅 Yesterday / कल", action: `yesterday's tasks${scopeSuffix}` },
        { label: "📅 Tomorrow / कल (आने वाला)", action: `tomorrow's tasks${scopeSuffix}` },
        { label: "🕒 Pending / लंबित (आज तक)", action: `pending tasks${scopeSuffix}` },
        { label: "❌ Not Done / नहीं हुए", action: `not done tasks${scopeSuffix}` },
        { label: "📅 This Month / इस महीने", action: `this month's tasks${scopeSuffix}` }
      ]
    };
  }

  // Handle ambiguous "kal"
  if (dateFilter === "ambiguous_kal") {
    return {
      success: true,
      resultType: "general",
      message: "Aap 'कल' (kal) se kaun sa din ke tasks dekhna chahte hain? Kripya select karein:",
      options: [
        { label: "📅 Yesterday / कल (बीता हुआ)", action: `yesterday's tasks${scopeSuffix}` },
        { label: "📅 Tomorrow / कल (आने वाला)", action: `tomorrow's tasks${scopeSuffix}` }
      ]
    };
  }

  // Fetch the tasks. A plain "user" role always stays scoped to their own
  // tasks (forceUsernameFilter). An elevated role (admin/manager/hod) is NOT
  // forced to their own username even without an explicit department — asking
  // "aaj ke kitne tasks pending hain" as admin means "across all users", not
  // "my own admin account's tasks" (which would always be empty). A resolved
  // explicitDept further narrows an elevated role's view to one department.
  // `rows` is capped at 100/module for display; `counts` is an unlimited
  // COUNT(*) aggregation so summary totals stay accurate even when a module
  // has >100 rows.
  const { rows: taskRows, counts } = await getDirectTaskList({
    username,
    userRole,
    userDept,
    userDepts,
    dateFilter,
    explicitDept,
    explicitStaffName,
    moduleFilter,
    forceUsernameFilter: !isElevatedRole
  });

  const summary = {
    checklist: counts.checklist,
    maintenance: counts.maintenance,
    housekeeping: counts.housekeeping,
    delegation: counts.delegation,
    total: {
      total: counts.checklist.total + counts.maintenance.total + counts.housekeeping.total + counts.delegation.total,
      completed: counts.checklist.completed + counts.maintenance.completed + counts.housekeeping.completed + counts.delegation.completed,
      pending: counts.checklist.pending + counts.maintenance.pending + counts.housekeeping.pending + counts.delegation.pending,
      notdone: counts.checklist.notdone + counts.maintenance.notdone + counts.housekeeping.notdone + counts.delegation.notdone
    }
  };
  
  const isDateRange = dateFilter && typeof dateFilter === "object" && dateFilter.from && dateFilter.to;

  let dateLabel = dateFilter;
  if (isDateRange) dateLabel = `${dateFilter.from} se ${dateFilter.to} tak`;
  else if (dateFilter === "today") dateLabel = "aaj (today)";
  else if (dateFilter === "yesterday") dateLabel = "kal (yesterday)";
  else if (dateFilter === "tomorrow") dateLabel = "kal (tomorrow)";
  else if (dateFilter === "pending") dateLabel = "pending (losh)";
  else if (dateFilter === "notdone") dateLabel = "not done (नहीं हुए)";
  else if (dateFilter === "month") dateLabel = "is mahine (this month)";

  const subjectLabel = explicitStaffName
    ? `<strong>${explicitStaffName}</strong> ke`
    : explicitDept
    ? `<strong>${explicitDept}</strong> department ke`
    : (isElevatedRole ? "" : "Aapke");

  const MODULE_LABELS = { checklist: "Checklist", maintenance: "Maintenance", housekeeping: "Housekeeping", delegation: "Delegation" };
  const modulesToShow = moduleFilter ? [moduleFilter] : ["checklist", "maintenance", "housekeeping", "delegation"];

  // "notdone" already filters rows to (submission_date/actual_date IS NOT NULL AND status = 'no')
  // at the SQL level (see getDirectTaskList), so its "total" IS the not-done count — showing
  // Done/Pending columns here would be tautological. Render a dedicated single-count table instead.
  const summaryHtml = dateFilter === "notdone" ? `
<p>Namaste <strong>${username}</strong>! ${subjectLabel} <strong>${dateLabel}</strong> tasks ka count niche diya gaya hai:</p>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse; margin: 10px 0; width: 100%; max-width: 400px; font-size: 13px;">
  <thead>
    <tr style="background-color: rgba(0,0,0,0.05); text-align: left;">
      <th style="padding: 8px;">Module</th>
      <th style="padding: 8px;">Not Done</th>
    </tr>
  </thead>
  <tbody>
    ${modulesToShow.map((key) => `
    <tr>
      <td style="padding: 8px;"><strong>${MODULE_LABELS[key]}</strong></td>
      <td style="padding: 8px; color: #b45309;">${summary[key].total}</td>
    </tr>`).join("")}
    ${modulesToShow.length > 1 ? `
    <tr style="font-weight: bold; background-color: rgba(0,0,0,0.02);">
      <td style="padding: 8px;">Total</td>
      <td style="padding: 8px; color: #b45309;">${summary.total.total}</td>
    </tr>` : ""}
  </tbody>
</table>
` : `
<p>Namaste <strong>${username}</strong>! ${subjectLabel} <strong>${dateLabel}</strong> ke tasks ka count summary niche diya gaya hai:</p>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse; margin: 10px 0; width: 100%; max-width: 400px; font-size: 13px;">
  <thead>
    <tr style="background-color: rgba(0,0,0,0.05); text-align: left;">
      <th style="padding: 8px;">Module</th>
      <th style="padding: 8px;">Total</th>
      <th style="padding: 8px;">Done</th>
      <th style="padding: 8px;">Pending</th>
      <th style="padding: 8px;">Not Done</th>
    </tr>
  </thead>
  <tbody>
    ${modulesToShow.map((key) => `
    <tr>
      <td style="padding: 8px;"><strong>${MODULE_LABELS[key]}</strong></td>
      <td style="padding: 8px;">${summary[key].total}</td>
      <td style="padding: 8px; color: green;">${summary[key].completed}</td>
      <td style="padding: 8px; color: ${summary[key].pending > 0 ? '#b45309' : 'inherit'};">${summary[key].pending}</td>
      <td style="padding: 8px; color: ${summary[key].notdone > 0 ? '#dc2626' : 'inherit'};">${summary[key].notdone}</td>
    </tr>`).join("")}
    ${modulesToShow.length > 1 ? `
    <tr style="font-weight: bold; background-color: rgba(0,0,0,0.02);">
      <td style="padding: 8px;">Total</td>
      <td style="padding: 8px;">${summary.total.total}</td>
      <td style="padding: 8px; color: green;">${summary.total.completed}</td>
      <td style="padding: 8px; color: ${summary.total.pending > 0 ? '#b45309' : 'inherit'};">${summary.total.pending}</td>
      <td style="padding: 8px; color: ${summary.total.notdone > 0 ? '#dc2626' : 'inherit'};">${summary.total.notdone}</td>
    </tr>` : ""}
  </tbody>
</table>
`;

  // Check if they asked for the list/details
  const isListQuery = /\b(list|detail|details|dekhna|show|dikhao)\b/i.test(cleanText);
  if (isListQuery) {
    return {
      success: true,
      resultType: "tasks",
      tasksList: taskRows,
      targetDate: dateFilter,
      message: summaryHtml + `<p>Aapke details niche diye gaye hain 👇</p>`,
      summary: modulesToShow.map((key) => ({
        module: MODULE_LABELS[key],
        total: summary[key].total,
        completed: summary[key].completed,
        pending: summary[key].pending,
        notdone: summary[key].notdone
      }))
    };
  } else {
    // Rebuild a follow-up query string for the "Show List" button — reuses the
    // same scopeSuffix as the date-prompt buttons above so the module/department
    // scope survives into the next request instead of silently reverting to
    // all-modules (parseDateFilter/extractModuleFilter re-parse this from scratch).
    const dateFilterText = isDateRange ? `${dateFilter.from} se ${dateFilter.to} tak` : dateFilter;
    const followUpQuery = `show list of ${dateFilterText} tasks${scopeSuffix}`;

    return {
      success: true,
      resultType: "general",
      message: summaryHtml,
      exportRows: modulesToShow.map((key) => ({
        module: MODULE_LABELS[key],
        total: summary[key].total,
        completed: summary[key].completed,
        pending: summary[key].pending,
        notdone: summary[key].notdone
      })),
      exportFilename: `tasks_summary_${typeof dateFilter === "string" ? dateFilter : "range"}`,
      options: [
        { label: "📋 Show List / सूची दिखाएं", action: followUpQuery },
        { label: "❌ Close / बंद करें", action: "thanks" }
      ]
    };
  }
}

/**
 * Directly fetch a list of tasks from DB for today or a date range.
 * Uses explicit CASTs to avoid UNION type mismatch errors from LLM-generated SQL.
 * Dashboard NEVER checks system_access — always queries all 3 tables.
 */
async function getDirectTaskList({ username, userRole, userDept, userDepts, dateFilter = "today", forceUsernameFilter = false, explicitDept = null, explicitStaffName = null, moduleFilter = null }) {
  const pg = await import("../config/postgres.js");
  const pool = pg.default;

  const isAdmin = userRole === "admin";
  const isRegularUser = userRole === "user";

  // "pending"/"notdone" span the current + previous month and can easily exceed the
  // LIMIT 100 row cap below — order newest-first there so recent (current month) rows
  // are never pushed out by an older backlog. Other filters keep chronological order.
  // (Delegation ignores this — see its own block below, it always orders ASC since its
  // "pending" filter is unbounded and can include future planned_dates.)
  const orderDirection = (dateFilter === "pending" || dateFilter === "notdone") ? "DESC" : "ASC";

  const allRows = [];
  const counts = {
    checklist: { total: 0, completed: 0, pending: 0, notdone: 0 },
    maintenance: { total: 0, completed: 0, pending: 0, notdone: 0 },
    housekeeping: { total: 0, completed: 0, pending: 0, notdone: 0 },
    delegation: { total: 0, completed: 0, pending: 0, notdone: 0 }
  };
  const isDateRange = dateFilter && typeof dateFilter === "object" && dateFilter.from && dateFilter.to;
  const isCustomDate = typeof dateFilter === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateFilter);

  // ---- CHECKLIST ----
  if (!moduleFilter || moduleFilter === "checklist") {
    const qParams = [];
    let pi = 1;
    const whereClauses = [];

    if (isDateRange) {
      whereClauses.push(`task_start_date::date >= $${pi++} AND task_start_date::date <= $${pi++}`);
      qParams.push(dateFilter.from, dateFilter.to);
    } else if (dateFilter === "today") {
      whereClauses.push(`task_start_date::date = CURRENT_DATE`);
    } else if (dateFilter === "yesterday") {
      whereClauses.push(`task_start_date::date = (CURRENT_DATE - INTERVAL '1 day')::date`);
    } else if (dateFilter === "tomorrow") {
      whereClauses.push(`task_start_date::date = (CURRENT_DATE + INTERVAL '1 day')::date`);
    } else if (dateFilter === "pending") {
      whereClauses.push(`task_start_date::date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND task_start_date::date <= CURRENT_DATE AND submission_date IS NULL`);
    } else if (dateFilter === "notdone") {
      whereClauses.push(`task_start_date::date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND task_start_date::date <= CURRENT_DATE AND submission_date IS NOT NULL AND LOWER(status::text) = 'no'`);
    } else if (dateFilter === "month") {
      whereClauses.push(`task_start_date::date >= date_trunc('month', CURRENT_DATE) AND task_start_date::date <= CURRENT_DATE`);
    } else if (isCustomDate) {
      whereClauses.push(`task_start_date::date = $${pi++}`);
      qParams.push(dateFilter);
    } else {
      whereClauses.push(`task_start_date::date = CURRENT_DATE`);
    }

    if (explicitStaffName) {
      whereClauses.push(`LOWER(name) = LOWER($${pi++})`);
      qParams.push(explicitStaffName);
    } else if (explicitDept) {
      whereClauses.push(`LOWER(department) = LOWER($${pi++})`);
      qParams.push(explicitDept);
    } else if (isRegularUser || forceUsernameFilter) {
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
          COALESCE(name, '')::text AS doer_name,
          COALESCE(given_by, '')::text AS given_by,
          COALESCE(frequency, '')::text AS frequency,
          COALESCE(status::text, 'pending')::text AS status,
          submission_date::text AS completed_at,
          COALESCE(delay::text, '')::text AS delay,
          task_start_date::text AS task_start_date
        FROM checklist
        WHERE ${whereClauses.join(" AND ")}
        ORDER BY task_start_date ${orderDirection}, task_id ${orderDirection}
        LIMIT 100`,
        qParams
      );
      allRows.push(...r.rows);

      const countResult = await pool.query(
        `SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE LOWER(status::text) = 'yes') AS completed,
          COUNT(*) FILTER (WHERE submission_date IS NULL) AS pending,
          COUNT(*) FILTER (WHERE submission_date IS NOT NULL AND LOWER(status::text) = 'no') AS notdone
        FROM checklist
        WHERE ${whereClauses.join(" AND ")}`,
        qParams
      );
      counts.checklist = {
        total: Number(countResult.rows[0]?.total || 0),
        completed: Number(countResult.rows[0]?.completed || 0),
        pending: Number(countResult.rows[0]?.pending || 0),
        notdone: Number(countResult.rows[0]?.notdone || 0)
      };
    } catch (e) {
      console.error("chatbot checklist list error:", e.message);
    }
  }

  // ---- MAINTENANCE ----
  if (!moduleFilter || moduleFilter === "maintenance") {
    const qParams = [];
    let pi = 1;
    const whereClauses = [];

    if (isDateRange) {
      whereClauses.push(`task_start_date::date >= $${pi++} AND task_start_date::date <= $${pi++}`);
      qParams.push(dateFilter.from, dateFilter.to);
    } else if (dateFilter === "today") {
      whereClauses.push(`task_start_date::date = CURRENT_DATE`);
    } else if (dateFilter === "yesterday") {
      whereClauses.push(`task_start_date::date = (CURRENT_DATE - INTERVAL '1 day')::date`);
    } else if (dateFilter === "tomorrow") {
      whereClauses.push(`task_start_date::date = (CURRENT_DATE + INTERVAL '1 day')::date`);
    } else if (dateFilter === "pending") {
      whereClauses.push(`task_start_date::date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND task_start_date::date <= CURRENT_DATE AND actual_date IS NULL`);
    } else if (dateFilter === "notdone") {
      whereClauses.push(`task_start_date::date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND task_start_date::date <= CURRENT_DATE AND actual_date IS NOT NULL AND LOWER(task_status::text) = 'no'`);
    } else if (dateFilter === "month") {
      whereClauses.push(`task_start_date::date >= date_trunc('month', CURRENT_DATE) AND task_start_date::date <= CURRENT_DATE`);
    } else if (isCustomDate) {
      whereClauses.push(`task_start_date::date = $${pi++}`);
      qParams.push(dateFilter);
    } else {
      whereClauses.push(`task_start_date::date = CURRENT_DATE`);
    }

    if (explicitStaffName) {
      whereClauses.push(`LOWER(doer_name) = LOWER($${pi++})`);
      qParams.push(explicitStaffName);
    } else if (explicitDept) {
      whereClauses.push(`LOWER(COALESCE(doer_department, machine_department)) = LOWER($${pi++})`);
      qParams.push(explicitDept);
    } else if (isRegularUser || forceUsernameFilter) {
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
          COALESCE(doer_name, '')::text AS doer_name,
          COALESCE(given_by, '')::text AS given_by,
          COALESCE(frequency, '')::text AS frequency,
          COALESCE(task_status::text, 'no')::text AS status,
          actual_date::text AS completed_at,
          COALESCE(delay::text, '')::text AS delay,
          task_start_date::text AS task_start_date
        FROM maintenance_task_assign
        WHERE ${whereClauses.join(" AND ")}
        ORDER BY task_start_date ${orderDirection}, id ${orderDirection}
        LIMIT 100`,
        qParams
      );
      allRows.push(...r.rows);

      const countResult = await pool.query(
        `SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE LOWER(task_status::text) = 'yes') AS completed,
          COUNT(*) FILTER (WHERE actual_date IS NULL) AS pending,
          COUNT(*) FILTER (WHERE actual_date IS NOT NULL AND LOWER(task_status::text) = 'no') AS notdone
        FROM maintenance_task_assign
        WHERE ${whereClauses.join(" AND ")}`,
        qParams
      );
      counts.maintenance = {
        total: Number(countResult.rows[0]?.total || 0),
        completed: Number(countResult.rows[0]?.completed || 0),
        pending: Number(countResult.rows[0]?.pending || 0),
        notdone: Number(countResult.rows[0]?.notdone || 0)
      };
    } catch (e) {
      console.error("chatbot maintenance list error:", e.message);
    }
  }

  // ---- HOUSEKEEPING ----
  if (!moduleFilter || moduleFilter === "housekeeping") {
    const qParams = [];
    let pi = 1;
    const whereClauses = [];

    if (isDateRange) {
      whereClauses.push(`task_start_date::date >= $${pi++} AND task_start_date::date <= $${pi++}`);
      qParams.push(dateFilter.from, dateFilter.to);
    } else if (dateFilter === "today") {
      whereClauses.push(`task_start_date::date = CURRENT_DATE`);
    } else if (dateFilter === "yesterday") {
      whereClauses.push(`task_start_date::date = (CURRENT_DATE - INTERVAL '1 day')::date`);
    } else if (dateFilter === "tomorrow") {
      whereClauses.push(`task_start_date::date = (CURRENT_DATE + INTERVAL '1 day')::date`);
    } else if (dateFilter === "pending") {
      whereClauses.push(`task_start_date::date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND task_start_date::date <= CURRENT_DATE AND submission_date IS NULL`);
    } else if (dateFilter === "notdone") {
      whereClauses.push(`task_start_date::date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND task_start_date::date <= CURRENT_DATE AND submission_date IS NOT NULL AND LOWER(status::text) = 'no'`);
    } else if (dateFilter === "month") {
      whereClauses.push(`task_start_date::date >= date_trunc('month', CURRENT_DATE) AND task_start_date::date <= CURRENT_DATE`);
    } else if (isCustomDate) {
      whereClauses.push(`task_start_date::date = $${pi++}`);
      qParams.push(dateFilter);
    } else {
      whereClauses.push(`task_start_date::date = CURRENT_DATE`);
    }

    // HOUSEKEEPING ACCESS RULES:
    // Admin sees all (unless an explicit staff name/department was named).
    // Non-admin filters by allowed departments (user_access1 / userDept).
    if (explicitStaffName) {
      whereClauses.push(`LOWER(name) = LOWER($${pi++})`);
      qParams.push(explicitStaffName);
    } else if (explicitDept) {
      // assign_task.department is actually a location/area, not the real
      // department — an explicitly named department must match doer_department.
      whereClauses.push(`LOWER(doer_department) = LOWER($${pi++})`);
      qParams.push(explicitDept);
    } else if (!isAdmin) {
      const allowedDepts = Array.from(
        new Set(
          [
            ...(userDepts || []),
            userDept ? userDept : ""
          ].map(d => d.trim().toLowerCase()).filter(Boolean)
        )
      );

      if (allowedDepts.length > 0) {
        const placeholders = allowedDepts.map((_, i) => `$${pi + i}`).join(", ");
        whereClauses.push(`LOWER(department) = ANY(ARRAY[${placeholders}])`);
        qParams.push(...allowedDepts);
        pi += allowedDepts.length;
      } else {
        // Fallback to name if no departments are configured
        whereClauses.push(`LOWER(name) = LOWER($${pi++})`);
        qParams.push(username);
      }
    }

    try {
      const r = await pool.query(
        `SELECT
          'Housekeeping'::text AS source,
          COALESCE(task_description, '')::text AS task_name,
          COALESCE(name, '')::text AS doer_name,
          COALESCE(given_by, '')::text AS given_by,
          COALESCE(frequency, '')::text AS frequency,
          COALESCE(status::text, 'pending')::text AS status,
          submission_date::text AS completed_at,
          COALESCE(delay::text, '')::text AS delay,
          task_start_date::text AS task_start_date
        FROM assign_task
        WHERE ${whereClauses.join(" AND ")}
        ORDER BY task_start_date ${orderDirection}, id ${orderDirection}
        LIMIT 100`,
        qParams
      );
      allRows.push(...r.rows);

      const countResult = await pool.query(
        `SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE LOWER(status::text) = 'yes') AS completed,
          COUNT(*) FILTER (WHERE submission_date IS NULL) AS pending,
          COUNT(*) FILTER (WHERE submission_date IS NOT NULL AND LOWER(status::text) = 'no') AS notdone
        FROM assign_task
        WHERE ${whereClauses.join(" AND ")}`,
        qParams
      );
      counts.housekeeping = {
        total: Number(countResult.rows[0]?.total || 0),
        completed: Number(countResult.rows[0]?.completed || 0),
        pending: Number(countResult.rows[0]?.pending || 0),
        notdone: Number(countResult.rows[0]?.notdone || 0)
      };
    } catch (e) {
      console.error("chatbot housekeeping list error:", e.message);
    }
  }

  // ---- DELEGATION (one-time tasks; can be extended to a later date) ----
  // Delegation has no "failed"/status='no' concept — a task is only 'done', 'extend'
  // (deferred to a new planned_date), or NULL (never actioned). We filter/display by
  // planned_date (the current effective due date, updated whenever a task is extended)
  // rather than task_start_date (the original, immutable assignment date).
  if (!moduleFilter || moduleFilter === "delegation") {
    const qParams = [];
    let pi = 1;
    const whereClauses = [];

    if (isDateRange) {
      whereClauses.push(`planned_date::date >= $${pi++} AND planned_date::date <= $${pi++}`);
      qParams.push(dateFilter.from, dateFilter.to);
    } else if (dateFilter === "today") {
      whereClauses.push(`planned_date::date = CURRENT_DATE`);
    } else if (dateFilter === "yesterday") {
      whereClauses.push(`planned_date::date = (CURRENT_DATE - INTERVAL '1 day')::date`);
    } else if (dateFilter === "tomorrow") {
      whereClauses.push(`planned_date::date = (CURRENT_DATE + INTERVAL '1 day')::date`);
    } else if (dateFilter === "pending") {
      // Unlike the recurring modules, a delegation task can be assigned with a
      // planned_date far in the future and is still "pending" from day one — so
      // this is NOT bounded to <= CURRENT_DATE (matches the dedicated Delegation
      // "Pending Tasks" admin view, which has no date restriction either).
      whereClauses.push(`(status IS NULL OR status = 'extend')`);
    } else if (dateFilter === "notdone") {
      // No failure state exists for delegation tasks — never matches.
      whereClauses.push(`FALSE`);
    } else if (dateFilter === "month") {
      whereClauses.push(`planned_date::date >= date_trunc('month', CURRENT_DATE) AND planned_date::date <= CURRENT_DATE`);
    } else if (isCustomDate) {
      whereClauses.push(`planned_date::date = $${pi++}`);
      qParams.push(dateFilter);
    } else {
      whereClauses.push(`planned_date::date = CURRENT_DATE`);
    }

    if (explicitStaffName) {
      whereClauses.push(`LOWER(name) = LOWER($${pi++})`);
      qParams.push(explicitStaffName);
    } else if (explicitDept) {
      whereClauses.push(`LOWER(department) = LOWER($${pi++})`);
      qParams.push(explicitDept);
    } else if (isRegularUser || forceUsernameFilter) {
      whereClauses.push(`LOWER(name) = LOWER($${pi++})`);
      qParams.push(username);
    } else if (!isAdmin && userDept) {
      whereClauses.push(`LOWER(department) = LOWER($${pi++})`);
      qParams.push(userDept);
    }

    try {
      const r = await pool.query(
        `SELECT
          'Delegation'::text AS source,
          COALESCE(task_description, '')::text AS task_name,
          COALESCE(name, '')::text AS doer_name,
          COALESCE(given_by, '')::text AS given_by,
          COALESCE(frequency, '')::text AS frequency,
          CASE WHEN status = 'done' THEN 'yes' ELSE 'pending' END::text AS status,
          submission_date::text AS completed_at,
          COALESCE(delay::text, '')::text AS delay,
          planned_date::text AS task_start_date
        FROM delegation
        WHERE ${whereClauses.join(" AND ")}
        ORDER BY planned_date ASC, task_id ASC
        LIMIT 100`,
        qParams
      );
      allRows.push(...r.rows);

      const countResult = await pool.query(
        `SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'done') AS completed,
          COUNT(*) FILTER (WHERE status IS NULL OR status = 'extend') AS pending
        FROM delegation
        WHERE ${whereClauses.join(" AND ")}`,
        qParams
      );
      counts.delegation = {
        total: Number(countResult.rows[0]?.total || 0),
        completed: Number(countResult.rows[0]?.completed || 0),
        pending: Number(countResult.rows[0]?.pending || 0),
        notdone: 0
      };
    } catch (e) {
      console.error("chatbot delegation list error:", e.message);
    }
  }

  return { rows: allRows, counts };
}

/**
 * Build a simple bordered HTML table matching the style already used for the
 * checklist/maintenance/housekeeping/delegation summary card.
 */
function buildHtmlTable(headers, rows) {
  return `
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse; margin: 10px 0; width: 100%; max-width: 480px; font-size: 13px;">
  <thead>
    <tr style="background-color: rgba(0,0,0,0.05); text-align: left;">
      ${headers.map((h) => `<th style="padding: 8px;">${h}</th>`).join("")}
    </tr>
  </thead>
  <tbody>
    ${rows.map((row) => `
    <tr>
      ${row.map((cell) => `<td style="padding: 8px;">${cell}</td>`).join("")}
    </tr>`).join("")}
  </tbody>
</table>
`;
}

/**
 * Admin-only report: staff members who most often leave tasks overdue/not-done
 * across all four modules in the trailing 30 days — a "chronic defaulters" view
 * for accountability follow-up.
 */
async function getChronicDefaultersReport() {
  const pg = await import("../config/postgres.js");
  const pool = pg.default;

  const { rows } = await pool.query(`
    WITH combined AS (
      SELECT name AS doer, department FROM checklist
        WHERE task_start_date::date < CURRENT_DATE
          AND task_start_date::date >= CURRENT_DATE - INTERVAL '30 days'
          AND (submission_date IS NULL OR LOWER(status::text) = 'no')
      UNION ALL
      SELECT doer_name AS doer, COALESCE(doer_department, machine_department) AS department FROM maintenance_task_assign
        WHERE task_start_date::date < CURRENT_DATE
          AND task_start_date::date >= CURRENT_DATE - INTERVAL '30 days'
          AND (actual_date IS NULL OR LOWER(task_status::text) = 'no')
      UNION ALL
      SELECT name AS doer, doer_department AS department FROM assign_task
        WHERE task_start_date::date < CURRENT_DATE
          AND task_start_date::date >= CURRENT_DATE - INTERVAL '30 days'
          AND (submission_date IS NULL OR LOWER(status::text) = 'no')
      UNION ALL
      SELECT name AS doer, department FROM delegation
        WHERE planned_date::date < CURRENT_DATE
          AND planned_date::date >= CURRENT_DATE - INTERVAL '30 days'
          AND status IS NULL
    )
    SELECT doer, department, COUNT(*) AS defaulter_count
    FROM combined
    WHERE doer IS NOT NULL AND doer <> ''
    GROUP BY doer, department
    ORDER BY defaulter_count DESC
    LIMIT 15
  `);

  if (rows.length === 0) {
    return {
      message: "Namaste! Pichhle 30 dinon mein koi chronic defaulter (baar-baar overdue/not-done tasks chhodne wala) nahi mila. 🎉",
      exportRows: [],
      exportFilename: null
    };
  }

  const tableRows = rows.map((r, i) => [
    i + 1,
    `<strong>${r.doer}</strong>`,
    r.department || "N/A",
    `<span style="color:#b91c1c;">${r.defaulter_count}</span>`
  ]);

  const message = `
<p>Namaste <strong>admin</strong>! Pichhle 30 dinon mein sabse zyada overdue/not-done tasks chhodne wale top ${rows.length} log niche diye gaye hain:</p>
${buildHtmlTable(["#", "Name", "Department", "Overdue/Not-Done Tasks"], tableRows)}
`;

  const exportRows = rows.map((r, i) => ({
    rank: i + 1,
    name: r.doer,
    department: r.department || "",
    overdue_not_done_tasks: Number(r.defaulter_count)
  }));

  return { message, exportRows, exportFilename: "chronic_defaulters_report" };
}

/**
 * Admin-only report: departments ranked by this month's completion % across
 * all four modules combined, so weak-performing departments stand out.
 */
async function getDepartmentLeaderboard() {
  const pg = await import("../config/postgres.js");
  const pool = pg.default;

  const { rows } = await pool.query(`
    WITH combined AS (
      SELECT department, status::text AS status FROM checklist
        WHERE task_start_date::date >= date_trunc('month', CURRENT_DATE) AND task_start_date::date <= CURRENT_DATE
      UNION ALL
      SELECT COALESCE(doer_department, machine_department) AS department, task_status::text AS status FROM maintenance_task_assign
        WHERE task_start_date::date >= date_trunc('month', CURRENT_DATE) AND task_start_date::date <= CURRENT_DATE
      UNION ALL
      SELECT doer_department AS department, status::text AS status FROM assign_task
        WHERE task_start_date::date >= date_trunc('month', CURRENT_DATE) AND task_start_date::date <= CURRENT_DATE
      UNION ALL
      SELECT department, CASE WHEN status = 'done' THEN 'yes' ELSE 'no' END AS status FROM delegation
        WHERE planned_date::date >= date_trunc('month', CURRENT_DATE) AND planned_date::date <= CURRENT_DATE
    )
    SELECT department,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE LOWER(status) = 'yes') AS completed,
      ROUND(COUNT(*) FILTER (WHERE LOWER(status) = 'yes')::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS completion_pct
    FROM combined
    WHERE department IS NOT NULL AND department <> ''
    GROUP BY department
    HAVING COUNT(*) >= 5
    ORDER BY completion_pct DESC NULLS LAST
    LIMIT 20
  `);

  if (rows.length === 0) {
    return {
      message: "Namaste! Is mahine abhi tak itna data nahi hai ki department leaderboard bana saken.",
      exportRows: [],
      exportFilename: null
    };
  }

  const tableRows = rows.map((r, i) => [
    i + 1,
    `<strong>${r.department}</strong>`,
    r.total,
    r.completed,
    `<span style="color:${Number(r.completion_pct) >= 75 ? "#15803d" : Number(r.completion_pct) >= 50 ? "#b45309" : "#b91c1c"};">${r.completion_pct}%</span>`
  ]);

  const message = `
<p>Namaste <strong>admin</strong>! Is mahine (aaj tak) department-wise completion % ke hisaab se ranking niche di gayi hai:</p>
${buildHtmlTable(["#", "Department", "Total", "Completed", "Completion %"], tableRows)}
`;

  const exportRows = rows.map((r, i) => ({
    rank: i + 1,
    department: r.department,
    total: Number(r.total),
    completed: Number(r.completed),
    completion_pct: Number(r.completion_pct)
  }));

  return { message, exportRows, exportFilename: "department_leaderboard" };
}

/**
 * Admin-only report: this month (partial, up to today) vs last month (full),
 * completion % trend across all four modules combined.
 */
async function getMonthlyTrendComparison() {
  const pg = await import("../config/postgres.js");
  const pool = pg.default;

  const { rows } = await pool.query(`
    WITH cur AS (
      SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE LOWER(status) = 'yes') AS completed
      FROM (
        SELECT status::text AS status FROM checklist WHERE task_start_date::date >= date_trunc('month', CURRENT_DATE) AND task_start_date::date <= CURRENT_DATE
        UNION ALL
        SELECT task_status::text AS status FROM maintenance_task_assign WHERE task_start_date::date >= date_trunc('month', CURRENT_DATE) AND task_start_date::date <= CURRENT_DATE
        UNION ALL
        SELECT status::text AS status FROM assign_task WHERE task_start_date::date >= date_trunc('month', CURRENT_DATE) AND task_start_date::date <= CURRENT_DATE
        UNION ALL
        SELECT CASE WHEN status = 'done' THEN 'yes' ELSE 'no' END AS status FROM delegation WHERE planned_date::date >= date_trunc('month', CURRENT_DATE) AND planned_date::date <= CURRENT_DATE
      ) c
    ),
    prev AS (
      SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE LOWER(status) = 'yes') AS completed
      FROM (
        SELECT status::text AS status FROM checklist WHERE task_start_date::date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND task_start_date::date < date_trunc('month', CURRENT_DATE)
        UNION ALL
        SELECT task_status::text AS status FROM maintenance_task_assign WHERE task_start_date::date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND task_start_date::date < date_trunc('month', CURRENT_DATE)
        UNION ALL
        SELECT status::text AS status FROM assign_task WHERE task_start_date::date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND task_start_date::date < date_trunc('month', CURRENT_DATE)
        UNION ALL
        SELECT CASE WHEN status = 'done' THEN 'yes' ELSE 'no' END AS status FROM delegation WHERE planned_date::date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND planned_date::date < date_trunc('month', CURRENT_DATE)
      ) p
    )
    SELECT cur.total AS cur_total, cur.completed AS cur_completed, prev.total AS prev_total, prev.completed AS prev_completed
    FROM cur, prev
  `);

  const row = rows[0] || { cur_total: 0, cur_completed: 0, prev_total: 0, prev_completed: 0 };
  const curTotal = Number(row.cur_total || 0);
  const curCompleted = Number(row.cur_completed || 0);
  const prevTotal = Number(row.prev_total || 0);
  const prevCompleted = Number(row.prev_completed || 0);
  const curPct = curTotal > 0 ? Math.round((curCompleted / curTotal) * 1000) / 10 : 0;
  const prevPct = prevTotal > 0 ? Math.round((prevCompleted / prevTotal) * 1000) / 10 : 0;
  const delta = Math.round((curPct - prevPct) * 10) / 10;
  const trendIcon = delta > 0 ? "▲" : delta < 0 ? "▼" : "▬";
  const trendColor = delta > 0 ? "#15803d" : delta < 0 ? "#b91c1c" : "#64748b";

  const tableRows = [
    ["Pichla Mahina (poora)", prevTotal, prevCompleted, `${prevPct}%`],
    ["Is Mahina (aaj tak)", curTotal, curCompleted, `${curPct}%`]
  ];

  const message = `
<p>Namaste <strong>admin</strong>! Is mahine (aaj tak) vs pichhle mahine ka completion % trend niche diya gaya hai:</p>
${buildHtmlTable(["Period", "Total", "Completed", "Completion %"], tableRows)}
<p>Trend: <strong style="color:${trendColor};">${trendIcon} ${Math.abs(delta)}%</strong> ${delta > 0 ? "improvement" : delta < 0 ? "decline" : "no change"} pichhle mahine ke mukable.</p>
<p style="font-size:12px; color:#64748b;">Note: "Is Mahina" ka data abhi tak (partial) hai, poore mahine ka nahi — isliye total counts seedhe compare na karein, completion % ko hi trend indicator maanein.</p>
`;

  const exportRows = [
    { period: "Pichla Mahina (poora)", total: prevTotal, completed: prevCompleted, completion_pct: prevPct },
    { period: "Is Mahina (aaj tak)", total: curTotal, completed: curCompleted, completion_pct: curPct }
  ];

  return { message, exportRows, exportFilename: "monthly_trend_comparison" };
}

/**
 * Sanitize and cap incoming chat history from the frontend so it can be
 * safely spliced into the OpenAI messages array as prior turns.
 */
function sanitizeChatHistory(rawHistory) {
  if (!Array.isArray(rawHistory)) return [];
  return rawHistory
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 500) }));
}

/**
 * Detect which month a score query is asking about from the free-text query.
 * Defaults to the current month when no period is mentioned.
 */
function parseScorePeriod(text) {
  const t = text.toLowerCase();
  if (/(pichhle|pichla|pichle|gaye|gata|gaya|last|previous)\s*(mahin[ae]|month)/.test(t)) return "last_month";
  return "current_month";
}

/**
 * Resolve what date window a score query is asking about — an explicit range
 * ("01-07-2026 se 10-07-2026 tak") takes priority over the looser
 * this-month/last-month wording parseScorePeriod alone would fall back to.
 * Returns either { from, to } (YYYY-MM-DD) or the "current_month"/"last_month"
 * string parseScorePeriod already produced elsewhere.
 */
function resolveScorePeriodInput(text) {
  const range = parseDateRange(text);
  if (range) return range;
  return parseScorePeriod(text);
}

/**
 * Resolve the [monthStart, rangeEndExclusive) date window for a score period,
 * shared by the personal score query and the admin department-wise score query
 * so both always compare the same window. Accepts either "current_month"/
 * "last_month", or an explicit { from, to } range (YYYY-MM-DD) from
 * resolveScorePeriodInput.
 */
function resolveScorePeriodRange(period) {
  if (period && typeof period === "object" && period.from && period.to) {
    const toDate = new Date(`${period.to}T00:00:00`);
    const endExclusive = new Date(toDate.getTime() + 24 * 60 * 60 * 1000);
    const fmt = (d) => d.toLocaleDateString("en-CA");
    return { startDate: period.from, endDateExclusive: fmt(endExclusive), displayEndDate: period.to };
  }

  const kolkataDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const fmt = (d) => d.toLocaleDateString("en-CA");

  let monthStart;
  let rangeEndExclusive;
  let displayEnd;

  if (period === "last_month") {
    monthStart = new Date(kolkataDate.getFullYear(), kolkataDate.getMonth() - 1, 1);
    rangeEndExclusive = new Date(kolkataDate.getFullYear(), kolkataDate.getMonth(), 1);
    displayEnd = new Date(rangeEndExclusive.getTime() - 24 * 60 * 60 * 1000);
  } else {
    monthStart = new Date(kolkataDate.getFullYear(), kolkataDate.getMonth(), 1);
    rangeEndExclusive = new Date(kolkataDate.getFullYear(), kolkataDate.getMonth(), kolkataDate.getDate() + 1);
    displayEnd = kolkataDate;
  }

  return { startDate: fmt(monthStart), endDateExclusive: fmt(rangeEndExclusive), displayEndDate: fmt(displayEnd) };
}

/**
 * Compute a single user's monthly completion score (checklist + maintenance +
 * housekeeping combined), including the department/division roll-up overrides
 * used for management reporting.
 */
async function getDirectUserScoreData(username, period = "current_month") {
  const pg = await import("../config/postgres.js");
  const pool = pg.default;

  const { startDate, endDateExclusive, displayEndDate } = resolveScorePeriodRange(period);

  const sql = `
WITH base_tasks AS (
    SELECT u.division, u.department, u.user_name AS doer, u.employee_id, c.status, c.submission_date AS completed_at
    FROM public.checklist c
    JOIN public.users u ON c.name = u.user_name
    WHERE c.task_start_date::date >= $1 AND c.task_start_date::date < $2
      AND u.user_name = $3

    UNION ALL

    SELECT u.division, u.department, u.user_name AS doer, u.employee_id, m.task_status AS status, m.actual_date AS completed_at
    FROM public.maintenance_task_assign m
    JOIN public.users u ON m.doer_name = u.user_name
    WHERE m.task_start_date::date >= $1 AND m.task_start_date::date < $2
      AND u.user_name = $3

    UNION ALL

    SELECT u.division, u.department, u.user_name AS doer, u.employee_id, a.status, a.submission_date AS completed_at
    FROM public.assign_task a
    CROSS JOIN unnest(
        string_to_array(regexp_replace(a.hod, '\\s*(and|&)\\s*', ',', 'gi'), ',')
    ) AS hod_name
    JOIN public.users u ON trim(hod_name) = u.user_name
    WHERE a.task_start_date::date >= $1 AND a.task_start_date::date < $2
      AND u.user_name = $3
),
mapped_tasks AS (
    SELECT
        CASE WHEN doer = 'Birendra Kumar Ray' THEN 'SMS' ELSE division END AS division,
        CASE
            WHEN department IN ('DISPATCH', 'INWARD', 'WB') THEN 'DISPATCH'
            WHEN department IN ('SMS PRODUCTION', 'LAB AND QUALITY CONTROL', 'CRUSHER', 'CCM', 'CCM ELECTRICAL') THEN 'SMS PRODUCTION'
            WHEN department IN ('PIPE MILL PRODUCTION', 'SCAFFOLDING') THEN 'PIPE MILL PRODUCTION'
            WHEN department = 'PC' THEN 'ADMIN'
            ELSE department
        END AS department,
        doer, employee_id, status, completed_at
    FROM base_tasks
),
summary AS (
    SELECT division, department, doer, employee_id,
        COUNT(*) AS total_tasks,
        COUNT(*) FILTER (WHERE lower(status::text) = 'yes') AS total_completed_tasks,
        COUNT(*) FILTER (WHERE completed_at IS NOT NULL AND lower(status::text) = 'no') AS not_done_tasks,
        COUNT(*) FILTER (WHERE completed_at IS NULL) AS pending_tasks
    FROM mapped_tasks
    GROUP BY division, department, doer, employee_id
)
SELECT division, department, doer, employee_id, total_tasks, total_completed_tasks, not_done_tasks, pending_tasks,
    GREATEST(
        COALESCE(ROUND((total_completed_tasks::numeric / NULLIF(total_tasks,0)) * 100 - 100, 2), 0),
        -100
    ) AS completion_score
FROM summary
ORDER BY division, department, doer;
`;

  const { rows } = await pool.query(sql, [startDate, endDateExclusive, username]);
  return {
    row: rows[0] || null,
    startDate,
    endDate: displayEndDate
  };
}

/**
 * Admin-only report: department-wise roll-up using the EXACT same scoring
 * business rules as the personal score above (division/department overrides,
 * completion_score formula), but org-wide (no username filter) and aggregated
 * to department level — so admin's department view and an employee's own
 * score are always computed the same way.
 */
async function getDepartmentWiseScore(period = "current_month") {
  const pg = await import("../config/postgres.js");
  const pool = pg.default;

  const { startDate, endDateExclusive, displayEndDate } = resolveScorePeriodRange(period);

  const sql = `
WITH base_tasks AS (
    SELECT u.division, u.department, u.user_name AS doer, u.employee_id, c.status
    FROM public.checklist c
    JOIN public.users u ON c.name = u.user_name
    WHERE c.task_start_date::date >= $1 AND c.task_start_date::date < $2

    UNION ALL

    SELECT u.division, u.department, u.user_name AS doer, u.employee_id, m.task_status AS status
    FROM public.maintenance_task_assign m
    JOIN public.users u ON m.doer_name = u.user_name
    WHERE m.task_start_date::date >= $1 AND m.task_start_date::date < $2

    UNION ALL

    SELECT u.division, u.department, u.user_name AS doer, u.employee_id, a.status
    FROM public.assign_task a
    CROSS JOIN unnest(
        string_to_array(regexp_replace(a.hod, '\\s*(and|&)\\s*', ',', 'gi'), ',')
    ) AS hod_name
    JOIN public.users u ON trim(hod_name) = u.user_name
    WHERE a.task_start_date::date >= $1 AND a.task_start_date::date < $2
),
mapped_tasks AS (
    SELECT
        CASE WHEN doer = 'Birendra Kumar Ray' THEN 'SMS' ELSE division END AS division,
        CASE
            WHEN department IN ('DISPATCH', 'INWARD', 'WB') THEN 'DISPATCH'
            WHEN department IN ('SMS PRODUCTION', 'LAB AND QUALITY CONTROL', 'CRUSHER', 'CCM', 'CCM ELECTRICAL') THEN 'SMS PRODUCTION'
            WHEN department IN ('PIPE MILL PRODUCTION', 'SCAFFOLDING') THEN 'PIPE MILL PRODUCTION'
            WHEN department = 'PC' THEN 'ADMIN'
            ELSE department
        END AS department,
        doer, employee_id, status
    FROM base_tasks
),
dept_summary AS (
    SELECT department,
        COUNT(DISTINCT doer) AS employee_count,
        COUNT(*) AS total_tasks,
        COUNT(*) FILTER (WHERE lower(status::text) = 'yes') AS total_completed_tasks,
        COUNT(*) FILTER (WHERE lower(status::text) <> 'yes' OR status IS NULL) AS not_completed_tasks
    FROM mapped_tasks
    WHERE department IS NOT NULL
    GROUP BY department
)
SELECT department, employee_count, total_tasks, total_completed_tasks, not_completed_tasks,
    GREATEST(
        COALESCE(ROUND((total_completed_tasks::numeric / NULLIF(total_tasks, 0)) * 100 - 100, 2), 0),
        -100
    ) AS completion_score
FROM dept_summary
ORDER BY completion_score DESC, department ASC;
`;

  const { rows } = await pool.query(sql, [startDate, endDateExclusive]);

  if (rows.length === 0) {
    return {
      message: `Namaste! ${displayEndDate ? "Is period" : "Is mahine"} ke liye koi department score data nahi mila.`,
      exportRows: [],
      exportFilename: null
    };
  }

  const tableRows = rows.map((r) => {
    const score = Number(r.completion_score);
    const scoreColor = score === 0 ? "#15803d" : score >= -20 ? "#b45309" : "#b91c1c";
    return [
      `<strong>${r.department}</strong>`,
      r.employee_count,
      r.total_tasks,
      r.total_completed_tasks,
      r.not_completed_tasks,
      `<span style="color:${scoreColor};">${r.completion_score}</span>`
    ];
  });

  const message = `
<p>Namaste <strong>admin</strong>! <strong>${startDate} se ${displayEndDate}</strong> tak department-wise score niche diya gaya hai (0 = perfect, jitna zyada negative utna zyada miss hua):</p>
${buildHtmlTable(["Department", "Employees", "Total", "Completed", "Not Completed", "Score"], tableRows)}
`;

  const exportRows = rows.map((r) => ({
    department: r.department,
    employee_count: Number(r.employee_count),
    total_tasks: Number(r.total_tasks),
    total_completed_tasks: Number(r.total_completed_tasks),
    not_completed_tasks: Number(r.not_completed_tasks),
    completion_score: Number(r.completion_score)
  }));

  return { message, exportRows, exportFilename: `department_wise_score_${startDate}_to_${displayEndDate}` };
}

/**
 * Admin-only report: same scoring business rules as getDirectUserScoreData
 * and getDepartmentWiseScore, but one row per doer (org-wide, no username
 * filter, no department aggregation) — the individual-level counterpart to
 * the department roll-up, for spotting specific underperforming employees.
 */
async function getDoerWiseScore(period = "current_month") {
  const pg = await import("../config/postgres.js");
  const pool = pg.default;

  const { startDate, endDateExclusive, displayEndDate } = resolveScorePeriodRange(period);

  const sql = `
WITH base_tasks AS (
    SELECT u.division, u.department, u.user_name AS doer, u.employee_id, c.status
    FROM public.checklist c
    JOIN public.users u ON c.name = u.user_name
    WHERE c.task_start_date::date >= $1 AND c.task_start_date::date < $2

    UNION ALL

    SELECT u.division, u.department, u.user_name AS doer, u.employee_id, m.task_status AS status
    FROM public.maintenance_task_assign m
    JOIN public.users u ON m.doer_name = u.user_name
    WHERE m.task_start_date::date >= $1 AND m.task_start_date::date < $2

    UNION ALL

    SELECT u.division, u.department, u.user_name AS doer, u.employee_id, a.status
    FROM public.assign_task a
    CROSS JOIN unnest(
        string_to_array(regexp_replace(a.hod, '\\s*(and|&)\\s*', ',', 'gi'), ',')
    ) AS hod_name
    JOIN public.users u ON trim(hod_name) = u.user_name
    WHERE a.task_start_date::date >= $1 AND a.task_start_date::date < $2
),
mapped_tasks AS (
    SELECT
        CASE WHEN doer = 'Birendra Kumar Ray' THEN 'SMS' ELSE division END AS division,
        CASE
            WHEN department IN ('DISPATCH', 'INWARD', 'WB') THEN 'DISPATCH'
            WHEN department IN ('SMS PRODUCTION', 'LAB AND QUALITY CONTROL', 'CRUSHER', 'CCM', 'CCM ELECTRICAL') THEN 'SMS PRODUCTION'
            WHEN department IN ('PIPE MILL PRODUCTION', 'SCAFFOLDING') THEN 'PIPE MILL PRODUCTION'
            WHEN department = 'PC' THEN 'ADMIN'
            ELSE department
        END AS department,
        doer, employee_id, status
    FROM base_tasks
),
doer_summary AS (
    SELECT division, department, doer, employee_id,
        COUNT(*) AS total_tasks,
        COUNT(*) FILTER (WHERE lower(status::text) = 'yes') AS total_completed_tasks,
        COUNT(*) FILTER (WHERE lower(status::text) <> 'yes' OR status IS NULL) AS not_completed_tasks
    FROM mapped_tasks
    GROUP BY division, department, doer, employee_id
)
SELECT division, department, doer, employee_id, total_tasks, total_completed_tasks, not_completed_tasks,
    GREATEST(
        COALESCE(ROUND((total_completed_tasks::numeric / NULLIF(total_tasks, 0)) * 100 - 100, 2), 0),
        -100
    ) AS completion_score
FROM doer_summary
ORDER BY completion_score ASC, doer ASC;
`;

  const { rows } = await pool.query(sql, [startDate, endDateExclusive]);

  if (rows.length === 0) {
    return {
      message: `Namaste! ${startDate} se ${displayEndDate} tak koi doer-wise score data nahi mila.`,
      exportRows: [],
      exportFilename: null
    };
  }

  // Worst-first is what admin needs to act on, but the chat bubble can only
  // reasonably show so many rows — cap the visible table while the CSV export
  // (below) still carries every doer for full offline review.
  const DISPLAY_LIMIT = 50;
  const displayRows = rows.slice(0, DISPLAY_LIMIT);

  const tableRows = displayRows.map((r) => {
    const score = Number(r.completion_score);
    const scoreColor = score === 0 ? "#15803d" : score >= -20 ? "#b45309" : "#b91c1c";
    return [
      `<strong>${r.doer}</strong>`,
      r.department || "N/A",
      r.total_tasks,
      r.total_completed_tasks,
      r.not_completed_tasks,
      `<span style="color:${scoreColor};">${r.completion_score}</span>`
    ];
  });

  const truncatedNote = rows.length > DISPLAY_LIMIT
    ? `<p style="font-size:12px; color:#64748b;">Sirf sabse kam score wale top ${DISPLAY_LIMIT} (${rows.length} mein se) yahan dikhaye gaye hain — poori list ke liye CSV download karein.</p>`
    : "";

  const message = `
<p>Namaste <strong>admin</strong>! <strong>${startDate} se ${displayEndDate}</strong> tak doer-wise score niche diya gaya hai, sabse kam score pehle (0 = perfect, jitna zyada negative utna zyada miss hua):</p>
${buildHtmlTable(["Doer", "Department", "Total", "Completed", "Not Completed", "Score"], tableRows)}
${truncatedNote}
`;

  // The chat table above stays worst-first (org-wide) for a quick attention
  // list, but the downloaded CSV is easier to work through department-by-
  // department — sort a separate copy by division, then department, then
  // score (worst first within each department) purely for the export.
  const exportSortedRows = [...rows].sort((a, b) => {
    const divCompare = (a.division || "").localeCompare(b.division || "");
    if (divCompare !== 0) return divCompare;
    const deptCompare = (a.department || "").localeCompare(b.department || "");
    if (deptCompare !== 0) return deptCompare;
    return Number(a.completion_score) - Number(b.completion_score);
  });

  const exportRows = exportSortedRows.map((r) => ({
    doer: r.doer,
    employee_id: r.employee_id || "",
    division: r.division || "",
    department: r.department || "",
    total_tasks: Number(r.total_tasks),
    total_completed_tasks: Number(r.total_completed_tasks),
    not_completed_tasks: Number(r.not_completed_tasks),
    completion_score: Number(r.completion_score)
  }));

  return { message, exportRows, exportFilename: `doer_wise_score_${startDate}_to_${displayEndDate}` };
}

export const queryGeneral = async (req, res, next) => {
  try {
    const { queryText, chatHistory } = req.body;
    if (!queryText || !queryText.trim()) {
      return res.status(400).json({ error: "Query text is required." });
    }
    const priorTurns = sanitizeChatHistory(chatHistory);

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

    // ─── DIRECT ADMIN REPORTS INTERCEPTION ─────────────────────────────────
    // Fixed trigger phrases sent by dedicated admin intro-menu buttons (see
    // ChatBot.tsx). Deterministic hand-written SQL rather than LLM-generated,
    // since these are cross-department aggregate/ranking reports where a bad
    // LLM-written query (as happened with the earlier user-search bug) would
    // be hard for an admin to notice was wrong.
    const adminReportHandlers = [
      { regex: /chronic defaulters report/i, fn: () => getChronicDefaultersReport() },
      { regex: /department leaderboard/i, fn: () => getDepartmentLeaderboard() },
      { regex: /monthly trend comparison/i, fn: () => getMonthlyTrendComparison() },
      { regex: /department.?wise score/i, fn: () => getDepartmentWiseScore(resolveScorePeriodInput(queryText)) },
      { regex: /doer.?wise score/i, fn: () => getDoerWiseScore(resolveScorePeriodInput(queryText)) }
    ];
    const matchedAdminReport = adminReportHandlers.find((h) => h.regex.test(queryText));
    if (matchedAdminReport) {
      if (userRole !== "admin") {
        return res.status(200).json({
          success: true,
          resultType: "general",
          message: "Maaf kijiye, yeh report sirf admin ke liye available hai."
        });
      }
      try {
        const { message, exportRows, exportFilename } = await matchedAdminReport.fn();
        return res.status(200).json({
          success: true,
          resultType: "general",
          message,
          exportRows,
          exportFilename
        });
      } catch (reportErr) {
        console.error("Direct admin report error:", reportErr.message);
        return res.status(200).json({
          success: false,
          message: "क्षमा करें, कुछ समस्या आ रही है। कृपया बाद में प्रयास करें।"
        });
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    // ─── DIRECT SCORE INTERCEPTION ──────────────────────────────────────────
    const scoreQueryRegex = /(score|performance|प्रदर्शन|स्कोर|marks|मार्क्स)/i;
    if (scoreQueryRegex.test(queryText)) {
      try {
        const period = resolveScorePeriodInput(queryText);
        const periodLabel = typeof period === "object" ? `${period.from} se ${period.to} tak` : (period === "last_month" ? "pichhle mahine" : "is mahine");
        const { row, startDate, endDate } = await getDirectUserScoreData(username, period);
        if (!row) {
          return res.status(200).json({
            success: true,
            resultType: "general",
            message: `Namaste <strong>${username}</strong>! ${periodLabel} (${startDate} se ${endDate}) ke liye aapka koi task record nahi mila, isliye score calculate nahi ho paya.`
          });
        }
        return res.status(200).json({
          success: true,
          resultType: "scoreData",
          message: `Namaste <strong>${username}</strong>! Aapka ${periodLabel} ka performance score niche diya gaya hai:`,
          startDate,
          endDate,
          scoreData: {
            division: row.division,
            department: row.department,
            doer: row.doer,
            employee_id: row.employee_id,
            total_tasks: Number(row.total_tasks || 0),
            total_completed_tasks: Number(row.total_completed_tasks || 0),
            not_done_tasks: Number(row.not_done_tasks || 0),
            pending_tasks: Number(row.pending_tasks || 0),
            completion_score: Number(row.completion_score || 0)
          }
        });
      } catch (scoreErr) {
        console.error("Direct score interception error:", scoreErr.message);
        // Fall through to normal flow on error
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    // ─── DIRECT TASK INTERCEPTION ───────────────────────────────────────────
    try {
      const taskInterceptionResult = await handleDirectTaskInterception({
        queryText,
        username,
        userRole,
        userDept,
        userDepts
      });
      if (taskInterceptionResult) {
        return res.status(200).json(taskInterceptionResult);
      }
    } catch (interceptorErr) {
      console.error("Direct task interception error:", interceptorErr.message);
      // Fall through to normal OpenAI flow on error
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


    const systemPrompt1 = `You are Sagar Vision, a highly intelligent database assistant for a PostgreSQL database.
Your role is to understand the user's input intent and translate it into a safe, read-only SQL query, conversational reply, or item search parameter.

CURRENT DATE IN KOLKATA (IST): ${currentDateStr} (Use this date to resolve relative date terms like "today", "yesterday", "tomorrow", "this week", "this month", "last month").
Current Time: ${currentTimeStr}

CONVERSATION HISTORY: You will receive prior user/assistant turns from this same chat session before the latest user message. Use that history to resolve follow-up questions, pronouns, and implied subjects (e.g. if the user previously asked about "bearing" stock and now says "aur uska rate?" or "iska indent daal do", resolve "uska"/"iska" to the item/date/person discussed earlier). If the latest message is a standalone question, ignore the history.

DATABASE SCHEMA INFORMATION:
1. Table: public.users
   - Description: Stores user profile records.
   - Columns:
     * user_name (VARCHAR): Unique username (e.g. 'aakash', 'sheelesh').
     * employee_id (VARCHAR): Unique employee identifier.
     * role (a custom enum type, NOT plain text — every comparison/function call on it MUST cast first, e.g. LOWER(role::text), role::text = 'admin'; LOWER(role) alone throws "function lower(role) does not exist"): System role (e.g. 'admin', 'hod', 'user').
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
   - Description: Housekeeping tasks assigned to locations/areas.
   - Columns:
     * department (VARCHAR): Despite the column name, this is actually the LOCATION/AREA being cleaned (e.g. 'Admin Office - First Floor', 'Weight Office & Kata In/Out', 'Back Office') — NOT the organizational department. NEVER use this column when the user is asking about a real department; only use it for location-based filtering (e.g. a housekeeping supervisor's assigned areas via user_access1).
     * doer_department (TEXT): The doer's REAL organizational department (e.g. 'HR', 'WB', 'ADMIN'). Whenever a query needs "department" in the normal sense for this table — filtering by, grouping by, or displaying a department name — use doer_department, never department.
     * name (VARCHAR): Username of the user responsible (joins with users.user_name).
     * task_description (TEXT): Task details.
     * given_by (VARCHAR): Person who assigned the task.
     * frequency (VARCHAR): Frequency of the task ('daily', 'weekly', 'monthly', 'quarterly').
     * status (VARCHAR): Status of completion ('yes' for completed, 'no' for not completed).
     * submission_date (TIMESTAMPTZ): Completion timestamp (NULL if not completed yet).
     * delay (VARCHAR): Information about delays.
     * task_start_date (DATE): Scheduled date for the task.
     * hod (TEXT): Comma-separated list of HOD usernames/names supervising the task (e.g. 'amit, manoj').

5. Table: public.delegation
   - Description: One-time (non-recurring) tasks assigned to a user. A task can be "extended" to a later date instead of completed.
   - Columns:
     * name (VARCHAR): Username of the assignee (joins with users.user_name).
     * department (VARCHAR): Department the task belongs to.
     * task_description (TEXT): Task details.
     * given_by (VARCHAR): Person who assigned the task.
     * frequency (VARCHAR): Always 'one-time' for this table.
     * task_start_date (TIMESTAMP): The ORIGINAL date the task was assigned. This never changes.
     * planned_date (TIMESTAMP): The CURRENT effective due date. Equals task_start_date until the task is extended, then holds the new due date. ALWAYS use planned_date (not task_start_date) to determine whether a delegation task is due "today", "this month", etc.
     * status (TEXT): One of 'done' (completed), 'extend' (deferred to a new planned_date), or NULL (never actioned yet — this is the "pending" state). There is no "failed"/not-done status for delegation tasks.
     * submission_date (TIMESTAMPTZ): Timestamp of the last action taken (either marking done or extending). NULL if never actioned.
     * delay (INTERVAL): How late the task was actioned relative to its due date.
   - IMPORTANT: When computing "completed"/"done" counts for delegation, use status = 'done' only. When computing "pending", use status IS NULL OR status = 'extend'. Delegation has no not-done/failed bucket — never filter it by status = 'no'.

6. Table: public.repair_system
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

7. Table: public.repair_followup
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
  → Manager sees all tasks in their department: filter checklist by department = '${userDept}', assign_task by doer_department = '${userDept}' (assign_task.department is actually a location/area, not the real department — never filter it by department when the intent is "their department").
  → HOD sees all tasks in their division: join with users table on division = '${userDiv}'.
  → If user explicitly asks "my tasks" or "meri tasks", then add name filter for their own name only.
  → For maintenance_task_assign for managers/HODs: filter by COALESCE(doer_department, machine_department) = '${userDept}' (for manager) or join users for division filter (for HOD).

USER SEARCH RULES (for queries about public.users, e.g. "ramesh naam se kitne users hain", "search employee ramesh", "who is ramesh"):
- Names in public.users.user_name are FULL names (e.g. "Ramesh Kumar Pandey"), while the user typically types only a fragment (first name, nickname, or partial spelling) when searching/counting users "by name". ALWAYS use a partial, case-insensitive match for this: LOWER(user_name) LIKE '%' || LOWER($1) || '%' (or user_name ILIKE '%' || $1 || '%').
- NEVER use an exact match (LOWER(user_name) = LOWER($1)) for a "search/count users by name" query — an exact match against a name fragment will almost always return 0 rows even when matching users exist, which is wrong.
- Exact match is only correct when the user is filtering ONE specific person's own already-fully-named tasks/records (the staff-filter case in RULE 1 above), not when they are searching/counting/listing users by a name fragment.
- CRITICAL: Whenever the query SELECTs from public.users to list/search/count users — e.g. "department X ke users dikhao", "sabhi employees ki list", "ramesh naam se kitne users hain" — ALWAYS add LOWER(role::text) <> 'admin' (or LOWER(role::text) IS DISTINCT FROM 'admin' if role can be NULL) to the WHERE clause. Admin/owner accounts must never appear in a department or employee listing shown to another admin — only real staff/employee rows belong there. Remember role is the enum type noted in the schema above — the ::text cast is mandatory, not optional; LOWER(role) without it will throw a Postgres error and fail the whole query.

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
- CRITICAL: NEVER JOIN public.users table when querying checklist, maintenance_task_assign, assign_task, or delegation for task counts or task lists. The user identity is already embedded in the name/doer_name columns. Joining users causes row multiplication and inflated counts. Filter directly: e.g. LOWER(name) = LOWER($1), LOWER(doer_name) = LOWER($1).
- CRITICAL: For maintenance_task_assign, the user's name is in the "doer_name" column, NOT "name". Always use doer_name for filtering, not name.
- When the user asks for "tasks", "checklist", "my tasks", "score", or "performance", they are referring to the tasks in public.checklist, public.maintenance_task_assign, public.assign_task, AND public.delegation (delegation tasks are one-time tasks and count as "my tasks" too, just like the recurring ones).
- If they ask for count or list of general tasks, you should query/union all four tables (public.checklist, public.maintenance_task_assign, public.assign_task, public.delegation).
- For public.delegation specifically: filter/date-range using planned_date (not task_start_date), completed = status = 'done', pending = (status IS NULL OR status = 'extend'). It has no not-done/failed state.
- DO NOT query public.repair_system or public.repair_followup unless they specifically mention "repair", "breakdown", "machine", "repair system", "repair followup", or "gate pass".
- For daily tasks list queries, the output columns should match resultType: "tasks" (source, task_name, doer_name, given_by, frequency, status, completed_at, delay, task_start_date). ALWAYS include doer_name (the assignee — "name" for checklist/assign_task/delegation, "doer_name" for maintenance_task_assign) so admins/managers viewing a department, division, or another user's task list can see whose task each row is.
- For uncompleted tasks count query (ONLY when they specify uncompleted, pending, incomplete, missed, or failed, e.g. "not done count"), the output columns must be: module (e.g. 'Checklist', 'Maintenance', 'Housekeeping', 'Delegation') and count.
- If they ask for total count of tasks (e.g., "kitne tasks hain", "how many tasks do I have", "total tasks count" without specifying "not done" / "pending"), DO NOT filter by status = 'no' or status = 'yes'. Generate a SELECT query that counts the total number of tasks (completed and uncompleted combined) for the user. Keep it scoped to the requested date range (like "this month" -> date_trunc('month', CURRENT_DATE) or similar). Use resultType = 'general' if the output doesn't match standard card shapes.
- Current month range for queries: task_start_date >= date_trunc('month', CURRENT_DATE) AND task_start_date <= CURRENT_DATE (use planned_date instead of task_start_date for the delegation table).
- EXAMPLE correct query for a regular user's total tasks this month (NO JOIN with users):
  SELECT
    'Checklist' AS module, COUNT(*) AS count FROM checklist WHERE LOWER(name) = LOWER($1) AND task_start_date >= date_trunc('month', CURRENT_DATE) AND task_start_date <= CURRENT_DATE
  UNION ALL
  SELECT 'Maintenance' AS module, COUNT(*) AS count FROM maintenance_task_assign WHERE LOWER(doer_name) = LOWER($1) AND task_start_date >= date_trunc('month', CURRENT_DATE) AND task_start_date <= CURRENT_DATE
  UNION ALL
  SELECT 'Housekeeping' AS module, COUNT(*) AS count FROM assign_task WHERE LOWER(name) = LOWER($1) AND task_start_date >= date_trunc('month', CURRENT_DATE) AND task_start_date <= CURRENT_DATE
  UNION ALL
  SELECT 'Delegation' AS module, COUNT(*) AS count FROM delegation WHERE LOWER(name) = LOWER($1) AND planned_date >= date_trunc('month', CURRENT_DATE) AND planned_date <= CURRENT_DATE

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
            ...priorTurns,
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
        error: "क्षमा करें, कुछ समस्या आ रही है। कृपया बाद में प्रयास करें।"
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
          error: "क्षमा करें, कुछ समस्या आ रही है। कृपया बाद में प्रयास करें।"
        });
      }

      // 4. Summarize results using OpenAI Call 2
      const systemPrompt2 = `You are Sagar Vision, a database query explainer.
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
          doer_name: r.doer_name || r.name || r.user_name || "",
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
      error: "क्षमा करें, कुछ समस्या आ रही है। कृपया बाद में प्रयास करें।"
    });

  } catch (err) {
    console.error("Chatbot queryGeneral error:", err.message);
    return res.status(200).json({
      success: false,
      error: "क्षमा करें, कुछ समस्या आ रही है। कृपया बाद में प्रयास करें।"
    });
  }
};

export const queryUsers = async (req, res, next) => {
  return queryGeneral(req, res, next);
};

export const queryTasks = async (req, res, next) => {
  return queryGeneral(req, res, next);
};
