import pool from "../config/db.js";

const DEFAULT_DASHBOARD_TABLE = "checklist";
const DASHBOARD_TABLE_RE = /^[a-z_][a-z0-9_]*$/i;

const resolveDashboardTable = async (table) => {
    const requested = String(table || "").trim().toLowerCase();
    const candidate = requested || DEFAULT_DASHBOARD_TABLE;

    if (!DASHBOARD_TABLE_RE.test(candidate)) {
        return DEFAULT_DASHBOARD_TABLE;
    }

    const tableCheck = await pool.query(
        `
        SELECT COALESCE(to_regclass($1), to_regclass($2)) AS regclass
        `,
        [candidate, `public.${candidate}`]
    );

    if (tableCheck.rows[0]?.regclass) {
        return candidate;
    }

    if (candidate !== DEFAULT_DASHBOARD_TABLE) {
        const fallbackCheck = await pool.query(
            `
            SELECT COALESCE(to_regclass($1), to_regclass($2)) AS regclass
            `,
            [DEFAULT_DASHBOARD_TABLE, `public.${DEFAULT_DASHBOARD_TABLE}`]
        );

        if (fallbackCheck.rows[0]?.regclass) {
            return DEFAULT_DASHBOARD_TABLE;
        }
    }

    const err = new Error("Dashboard checklist table not found");
    err.statusCode = 500;
    throw err;
};

/**
 * Get current month date range
 */
const getCurrentMonthRange = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentDay = new Date();

    const firstDayStr = firstDay.toISOString().split('T')[0];
    const currentDayStr = currentDay.toISOString().split('T')[0];

    return { firstDayStr, currentDayStr };
};

/**
 * Count unified checklist rows
 */
const countUnifiedChecklistRows = async ({ staffFilter, departmentFilter, role, username, taskView }) => {
    const { firstDayStr, currentDayStr } = getCurrentMonthRange();
    const params = [];
    let idx = 1;

    let conditions = [`task_start_date >= $${idx++}`, `task_start_date <= $${idx++}`];
    params.push(`${firstDayStr} 00:00:00`, `${currentDayStr} 23:59:59`);

    // Task view filter
    if (taskView === "recent") {
        conditions = [`task_start_date::date = CURRENT_DATE`];
        params.length = 0;
        idx = 1;
    } else if (taskView === "overdue") {
        conditions = [
            `task_start_date::date < CURRENT_DATE`,
            `task_start_date >= $1`,
            `submission_date IS NULL`
        ];
        params.length = 0;
        params.push(`${firstDayStr} 00:00:00`);
        idx = 2; // Reset to 2 since $1 is already used
    }

    // Role filter
    if (role === "user" && username) {
        conditions.push(`name = $${idx++}`);
        params.push(username);
    }

    // Staff filter (admin only)
    if (role === "admin" && staffFilter !== "all") {
        conditions.push(`name = $${idx++}`);
        params.push(staffFilter);
    }

    // Department filter
    if (departmentFilter !== "all") {
        conditions.push(`department = $${idx++}`);
        params.push(departmentFilter);
    }

    const query = `
        SELECT COUNT(*) AS count
        FROM checklist
        WHERE ${conditions.join(' AND ')}
    `;

    const result = await pool.query(query, params);
    return { count: Number(result.rows[0].count) };
};

/**
 * Count checklist sources with custom conditions
 */
const countChecklistSources = async (filters, conditionBuilder) => {
    const { staffFilter, departmentFilter, role, username, taskView } = filters;
    const { firstDayStr, currentDayStr } = getCurrentMonthRange();
    const params = [];
    let idx = 1;

    let conditions = [`task_start_date >= $${idx++}`, `task_start_date <= $${idx++}`];
    params.push(`${firstDayStr} 00:00:00`, `${currentDayStr} 23:59:59`);

    // Apply custom condition builder
    const source = {
        name: "checklist",
        statusColumn: "status",
        statusColumnSafe: true,
        submissionColumn: "submission_date"
    };

    const builderResult = conditionBuilder({ source, conditions, params });
    conditions = builderResult.conditions;

    // Role filter
    if (role === "user" && username) {
        conditions.push(`name = $${idx++}`);
        params.push(username);
    }

    // Staff filter
    if (role === "admin" && staffFilter !== "all") {
        conditions.push(`name = $${idx++}`);
        params.push(staffFilter);
    }

    // Department filter
    if (departmentFilter !== "all") {
        conditions.push(`department = $${idx++}`);
        params.push(departmentFilter);
    }

    const query = `
        SELECT COUNT(*) AS count
        FROM checklist
        WHERE ${conditions.join(' AND ')}
    `;

    const result = await pool.query(query, params);
    return { count: Number(result.rows[0].count) };
};

const getTotalTaskCount = async ({ table, staffFilter, departmentFilter, role, username }) => {
    const safeTable = await resolveDashboardTable(table);
    const { firstDayStr, currentDayStr } = getCurrentMonthRange();
    const params = [];
    let idx = 1;

    let query = `
        SELECT COUNT(*) AS count
        FROM ${safeTable}
        WHERE task_start_date >= $${idx++}
        AND task_start_date <= $${idx++}
    `;
    params.push(`${firstDayStr} 00:00:00`, `${currentDayStr} 23:59:59`);

    if (role === "user" && username) {
        query += ` AND name=$${idx++}`;
        params.push(username);
    }

    if (role === "admin" && staffFilter !== "all") {
        query += ` AND name=$${idx++}`;
        params.push(staffFilter);
    }

    if (safeTable === "checklist" && departmentFilter !== "all") {
        query += ` AND department=$${idx++}`;
        params.push(departmentFilter);
    }

    const result = await pool.query(query, params);
    return { count: Number(result.rows[0].count) };
};

const getCompletedTaskCount = async ({ table, staffFilter, departmentFilter, role, username }) => {
    const safeTable = await resolveDashboardTable(table);
    const { firstDayStr, currentDayStr } = getCurrentMonthRange();
    const params = [];
    let idx = 1;

    let query = `
        SELECT COUNT(*) AS count
        FROM ${safeTable}
        WHERE task_start_date >= $${idx++}
        AND task_start_date <= $${idx++}
    `;
    params.push(`${firstDayStr} 00:00:00`, `${currentDayStr} 23:59:59`);

    if (safeTable === "checklist") {
        query += ` AND status = 'yes' `;
    } else {
        query += ` AND submission_date IS NOT NULL `;
    }

    if (role === "user" && username) {
        query += ` AND name=$${idx++}`;
        params.push(username);
    }
    if (role === "admin" && staffFilter !== "all") {
        query += ` AND name=$${idx++}`;
        params.push(staffFilter);
    }
    if (safeTable === "checklist" && departmentFilter !== "all") {
        query += ` AND department=$${idx++}`;
        params.push(departmentFilter);
    }

    const result = await pool.query(query, params);
    return { count: Number(result.rows[0].count) };
};

const getPendingTaskCount = async ({ table, staffFilter, departmentFilter, role, username }) => {
    const safeTable = await resolveDashboardTable(table);
    const params = [];
    let idx = 1;

    let query = `
        SELECT COUNT(*) AS count
        FROM ${safeTable}
        WHERE task_start_date::date = CURRENT_DATE
        AND submission_date IS NULL
    `;

    if (role === "user" && username) {
        query += ` AND name=$${idx++}`;
        params.push(username);
    }

    if (role === "admin" && staffFilter !== "all") {
        query += ` AND name=$${idx++}`;
        params.push(staffFilter);
    }

    if (safeTable === "checklist" && departmentFilter !== "all") {
        query += ` AND department=$${idx++}`;
        params.push(departmentFilter);
    }

    const result = await pool.query(query, params);
    return { count: Number(result.rows[0].count) };
};

const getPendingTodayCount = async ({ table, staffFilter, departmentFilter, role, username }) => {
    const safeTable = await resolveDashboardTable(table);
    const params = [];
    let idx = 1;

    let query = `
        SELECT COUNT(*) AS count
        FROM ${safeTable}
        WHERE task_start_date::date = CURRENT_DATE
        AND submission_date IS NULL
    `;

    if (role === "user" && username) {
        query += ` AND name=$${idx++}`;
        params.push(username);
    }

    if (role === "admin" && staffFilter !== "all") {
        query += ` AND name=$${idx++}`;
        params.push(staffFilter);
    }

    if (safeTable === "checklist" && departmentFilter !== "all") {
        query += ` AND department=$${idx++}`;
        params.push(departmentFilter);
    }

    const result = await pool.query(query, params);
    return Number(result.rows[0].count);
};

const getCompletedTodayCount = async ({ table, staffFilter, departmentFilter, role, username }) => {
    const safeTable = await resolveDashboardTable(table);
    const params = [];
    let idx = 1;

    let query = `
        SELECT COUNT(*) AS count
        FROM ${safeTable}
        WHERE submission_date::date = CURRENT_DATE
    `;

    if (role === "user" && username) {
        query += ` AND name=$${idx++}`;
        params.push(username);
    }

    if (role === "admin" && staffFilter !== "all") {
        query += ` AND name=$${idx++}`;
        params.push(staffFilter);
    }

    if (safeTable === "checklist" && departmentFilter !== "all") {
        query += ` AND department=$${idx++}`;
        params.push(departmentFilter);
    }

    const result = await pool.query(query, params);
    return Number(result.rows[0].count);
};

const getOverdueTaskCount = async ({ table, staffFilter, departmentFilter, role, username }) => {
    const safeTable = await resolveDashboardTable(table);
    const { firstDayStr } = getCurrentMonthRange();
    const params = [];
    let idx = 1;

    let query = `
        SELECT COUNT(*) AS count
        FROM ${safeTable}
        WHERE task_start_date::date < CURRENT_DATE
        AND submission_date IS NULL
        AND task_start_date >= $${idx++}
    `;
    params.push(`${firstDayStr} 00:00:00`);

    if (role === "user" && username) {
        query += ` AND name=$${idx++}`;
        params.push(username);
    }

    if (role === "admin" && staffFilter !== "all") {
        query += ` AND name=$${idx++}`;
        params.push(staffFilter);
    }

    if (safeTable === "checklist" && departmentFilter !== "all") {
        query += ` AND department=$${idx++}`;
        params.push(departmentFilter);
    }

    const result = await pool.query(query, params);
    return { count: Number(result.rows[0].count) };
};

export default {
    countUnifiedChecklistRows,
    countChecklistSources,
    getTotalTaskCount,
    getCompletedTaskCount,
    getPendingTaskCount,
    getPendingTodayCount,
    getCompletedTodayCount,
    getOverdueTaskCount,
};
