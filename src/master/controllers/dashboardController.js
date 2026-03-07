import dashboardService from "../services/dashboardService.js";

/* -------------------- HELPERS -------------------- */

const DASHBOARD_TYPE_RE = /^[a-z_][a-z0-9_]*$/i;

const normalizeDashboardType = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return "checklist";
    if (!DASHBOARD_TYPE_RE.test(normalized)) return "checklist";
    return normalized;
};

const normalizeFilter = (value) => {
    const normalized = String(value || "").trim();
    return normalized || "all";
};

const normalizeRole = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "admin" || normalized === "user") return normalized;
    return undefined;
};

const getEnforcedFilters = (req) => {
    const { role: queryRole, username: queryUsername, staffFilter, departmentFilter, dashboardType } = req.query;
    const authUser = req.user;

    const isAdmin = authUser.role === "admin" || authUser.user_name === "admin";

    // If not admin, override query params with auth user data
    const role = isAdmin ? normalizeRole(queryRole) : "user";
    const username = isAdmin
        ? String(queryUsername || authUser.user_name || "").trim()
        : String(authUser.user_name || "").trim();

    return {
        dashboardType: normalizeDashboardType(dashboardType),
        staffFilter: normalizeFilter(staffFilter),
        departmentFilter: normalizeFilter(departmentFilter),
        role,
        username
    };
};

/* -------------------- CONTROLLERS -------------------- */

export const getTotalTask = async (req, res, next) => {
    try {
        const filters = getEnforcedFilters(req);

        if (filters.dashboardType === "checklist") {
            const result = await dashboardService.countUnifiedChecklistRows({
                ...filters,
                taskView: "all"
            });
            return res.json(result);
        }

        const result = await dashboardService.getTotalTaskCount({
            ...filters,
            table: filters.dashboardType
        });

        res.json(result);
    } catch (err) {
        next(err);
    }
};

export const getCompletedTask = async (req, res, next) => {
    try {
        const filters = getEnforcedFilters(req);

        if (filters.dashboardType === "checklist") {
            const result = await dashboardService.countChecklistSources(
                {
                    ...filters,
                    taskView: "all"
                },
                ({ source, conditions, params }) => {
                    if (source.name === "maintenance") {
                        conditions.push(`${source.submissionColumn} IS NOT NULL`);
                    } else if (source.statusColumnSafe && source.statusColumn) {
                        conditions.push(`LOWER(${source.statusColumn}::text) = 'yes'`);
                    }

                    return { conditions, params };
                }
            );

            return res.json(result);
        }

        const result = await dashboardService.getCompletedTaskCount({
            ...filters,
            table: filters.dashboardType
        });

        res.json(result);
    } catch (err) {
        next(err);
    }
};

export const getPendingTask = async (req, res, next) => {
    try {
        const filters = getEnforcedFilters(req);

        if (filters.dashboardType === "checklist") {
            const result = await dashboardService.countUnifiedChecklistRows({
                ...filters,
                taskView: "recent"
            });

            return res.json(result);
        }

        const result = await dashboardService.getPendingTaskCount({
            ...filters,
            table: filters.dashboardType
        });

        res.json(result);

    } catch (err) {
        next(err);
    }
};

export const getPendingToday = async (req, res, next) => {
    try {
        const filters = getEnforcedFilters(req);

        const result = await dashboardService.getPendingTodayCount({
            ...filters,
            table: filters.dashboardType
        });

        res.json(result);
    } catch (err) {
        next(err);
    }
};

export const getCompletedToday = async (req, res, next) => {
    try {
        const filters = getEnforcedFilters(req);

        const result = await dashboardService.getCompletedTodayCount({
            ...filters,
            table: filters.dashboardType
        });

        res.json(result);
    } catch (err) {
        next(err);
    }
};

export const getOverdueTask = async (req, res, next) => {
    try {
        const filters = getEnforcedFilters(req);

        if (filters.dashboardType === "checklist") {
            const result = await dashboardService.countUnifiedChecklistRows({
                ...filters,
                taskView: "overdue"
            });
            return res.json(result);
        }

        const result = await dashboardService.getOverdueTaskCount({
            ...filters,
            table: filters.dashboardType
        });

        res.json(result);

    } catch (err) {
        next(err);
    }
};




