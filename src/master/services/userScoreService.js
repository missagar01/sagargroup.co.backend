import pool from "../config/db.js";

/* -------------------- BASE QUERY -------------------- */
const BASE_QUERY = `
WITH base_tasks AS (
    -- 1️⃣ checklist
    SELECT
        u.division,
        u.department,
        u.user_name AS doer,
        u.employee_id,
        c.status
    FROM public.checklist c
    JOIN public.users u
        ON c.name = u.user_name
    WHERE c.task_start_date::date >= $1
      AND c.task_start_date::date <  $2
      /**USER_FILTER**/

    UNION ALL

    -- 2️⃣ maintenance_task_assign
    SELECT
        u.division,
        u.department,
        u.user_name AS doer,
        u.employee_id,
        m.task_status AS status
    FROM public.maintenance_task_assign m
    JOIN public.users u
        ON m.doer_name = u.user_name
    WHERE m.task_start_date::date >= $1
      AND m.task_start_date::date <  $2
      /**USER_FILTER**/

    UNION ALL

    -- 3️⃣ assign_task
    SELECT
        u.division,
        u.department,
        u.user_name AS doer,
        u.employee_id,
        a.status
    FROM public.assign_task a
    CROSS JOIN unnest(
        string_to_array(
            regexp_replace(a.hod, '\\s*(and|&)\\s*', ',', 'gi'),
            ','
        )
    ) AS hod_name
    JOIN public.users u
        ON trim(hod_name) = u.user_name
    WHERE a.task_start_date::date >= $1
      AND a.task_start_date::date <  $2
      /**USER_FILTER**/
),
summary AS (
    SELECT
        division,
        department,
        doer,
        employee_id,
        COUNT(*) AS total_tasks,
        COUNT(*) FILTER (
            WHERE lower(status::text) = 'yes'
        ) AS total_completed_tasks,
        COUNT(*) FILTER (
            WHERE lower(status::text) <> 'yes'
               OR status IS NULL
        ) AS not_completed_tasks
    FROM base_tasks
    GROUP BY division, department, doer, employee_id
)
SELECT
    division,
    department,
    doer,
    employee_id,
    total_tasks,
    total_completed_tasks,
    not_completed_tasks,
    GREATEST(
        COALESCE(
            ROUND((total_completed_tasks::numeric / NULLIF(total_tasks,0)) * 100 - 100, 2),
            0
        ),
        -100
    ) AS completion_score,
    -- Compatibility aliases for existing frontend
    GREATEST(
        COALESCE(
            ROUND((total_completed_tasks::numeric / NULLIF(total_tasks,0)) * 100 - 100, 2),
            0
        ),
        -100
    ) AS total_score,
    0 AS total_done_on_time,
    0 AS ontime_score
FROM summary
ORDER BY division, department, doer;
`;

/* -------------------- GET ALL USERS -------------------- */
export const fetchAllUserScoresService = async (startDate, endDate) => {
    const query = BASE_QUERY.replace(/\/\*\*USER_FILTER\*\*\//g, "");
    const { rows } = await pool.query(query, [startDate, endDate]);
    return rows;
};

/* -------------------- GET SINGLE USER (BY NAME) -------------------- */
export const fetchUserScoreByIdService = async (
    userName,
    startDate,
    endDate
) => {
    const query = BASE_QUERY.replace(
        /\/\*\*USER_FILTER\*\*\//g,
        "AND u.user_name = $3"
    );

    const { rows } = await pool.query(query, [
        startDate,
        endDate,
        userName,
    ]);

    return rows;
};

