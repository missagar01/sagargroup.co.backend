const { getConnection } = require("../config/db.js");
const oracledb = require("oracledb");
const { generateCacheKey, withCache, DEFAULT_TTL } = require("../utils/cacheHelper.js");

const DELIVERY_STATS_QUERY = `
WITH raw_data AS (
    SELECT 
        t.vrno,
        t.contract_vrdate,
        t.contract_qty,
        t.vrdate,
        CASE
            WHEN TRUNC(t.vrdate) > 
                 TRUNC(
                    t.contract_vrdate + 
                    CASE 
                        WHEN t.contract_qty < 51 THEN 7
                        WHEN t.contract_qty BETWEEN 51 AND 100 THEN 14
                        WHEN t.contract_qty > 100 THEN 20
                        ELSE 0
                    END
                 )
            THEN 'Yes'
            ELSE 'No'
        END AS delivery_late
    FROM view_itemtran_engine t
    WHERE t.entity_code = 'SR'
      AND t.series = 'SA'
      AND t.div_code = 'PM'
      -- Dynamic Date Filtering
      AND t.vrdate >= TO_DATE(:startDate, 'YYYY-MM-DD')
      AND t.vrdate <  TO_DATE(:endDate,   'YYYY-MM-DD') + 1
      -- Sales Person Filter (compare against name, not emp_code)
      AND (:salesPerson IS NULL OR 
           lhs_utility.get_name('emp_code', (SELECT a.emp_code FROM view_order_engine a WHERE a.vrno = t.contract_vrno AND a.entity_code = 'SR')) = :salesPerson)
    GROUP BY 
        t.vrno,
        t.contract_vrdate,
        t.contract_qty,
        t.vrdate,
        t.contract_vrno
),
latest_date AS (
    SELECT MAX(TRUNC(vrdate)) as max_dt FROM raw_data
)
SELECT 
    -- Monthly/Period Stats (Based on filtered range)
    COUNT(*) AS monthly_total,
    SUM(CASE WHEN delivery_late = 'Yes' THEN 1 ELSE 0 END) AS monthly_late,
    
    -- Daily Stats (Latest Active Date in range)
    SUM(CASE WHEN TRUNC(vrdate) = (SELECT max_dt FROM latest_date) THEN 1 ELSE 0 END) AS daily_total,
    SUM(CASE WHEN delivery_late = 'Yes' AND TRUNC(vrdate) = (SELECT max_dt FROM latest_date) THEN 1 ELSE 0 END) AS daily_late,
    
    -- Return the max date for reference (Wrapped in MAX to satisfy aggregate rule)
    MAX((SELECT TO_CHAR(max_dt, 'YYYY-MM-DD') FROM latest_date)) as daily_date
FROM raw_data
`;

const DELIVERY_REPORT_QUERY = `
SELECT 
    CASE
        WHEN sp.sales_person IN ('DIRECT', 'DC GOUTAM', 'P.S GEDAM')
        THEN 'ANIL MISHRA'
        ELSE sp.sales_person
    END AS sales_person,

    t.vrno AS invoice_no,
    lhs_utility.get_name('acc_code', t.acc_code) AS client_name,
    t.contract_vrdate AS souda_date,
    t.contract_qty AS souda_qty,
    SUM(t.qtyissued) AS invoice_qty,

    TRUNC(
        t.contract_vrdate + 
        CASE 
            WHEN t.contract_qty < 51 THEN 7
            WHEN t.contract_qty BETWEEN 51 AND 100 THEN 14
            WHEN t.contract_qty > 100 THEN 20
            ELSE 0
        END
    ) AS promise_date,

    t.vrdate AS delivery_date,
    (t.vrdate - t.contract_vrdate) AS lift_days,

    CASE
        WHEN TRUNC(t.vrdate) > 
             TRUNC(
                t.contract_vrdate + 
                CASE 
                    WHEN t.contract_qty < 51 THEN 7
                    WHEN t.contract_qty BETWEEN 51 AND 100 THEN 14
                    WHEN t.contract_qty > 100 THEN 20
                    ELSE 0
                END
             )
        THEN 'Yes'
        ELSE 'No'
    END AS delivery_late

FROM view_itemtran_engine t

LEFT JOIN (
    SELECT 
        a.vrno,
        lhs_utility.get_name('emp_code', a.emp_code) AS sales_person
    FROM view_order_engine a
    WHERE a.entity_code = 'SR'
) sp ON sp.vrno = t.contract_vrno

WHERE t.entity_code = 'SR'
  AND t.series = 'SA'
  AND t.div_code = 'PM'
  -- Dynamic Date Filtering
  AND t.vrdate >= TO_DATE(:startDate, 'YYYY-MM-DD')
  AND t.vrdate <  TO_DATE(:endDate,   'YYYY-MM-DD') + 1

GROUP BY 
    CASE
        WHEN sp.sales_person IN ('DIRECT', 'DC GOUTAM', 'P.S GEDAM')
        THEN 'ANIL MISHRA'
        ELSE sp.sales_person
    END,
    t.vrno,
    t.acc_code,
    t.contract_vrdate,
    t.contract_qty,
    t.vrdate,
    t.contract_vrno

ORDER BY t.vrno ASC
`;

async function getDeliveryStats({ startDate, endDate, salesPerson } = {}) {
    // Default to Current Month if no dates provided
    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const defaultEnd = now.toISOString().slice(0, 10);

    const p_start = startDate || defaultStart;
    const p_end = endDate || defaultEnd;
    const p_salesPerson = salesPerson || null;

    const cacheKey = generateCacheKey("delivery_stats_v6", { p_start, p_end, p_salesPerson });

    return await withCache(cacheKey, DEFAULT_TTL.DASHBOARD, async () => {
        let connection;
        try {
            connection = await getConnection();

            const binds = {
                startDate: p_start,
                endDate: p_end,
                salesPerson: p_salesPerson
            };

            const result = await connection.execute(DELIVERY_STATS_QUERY, binds, {
                outFormat: oracledb.OUT_FORMAT_OBJECT
            });

            const row = (result.rows && result.rows[0]) ? result.rows[0] : {};

            // Extract Monthly/Period Stats
            const monthlyTotal = row.MONTHLY_TOTAL || 0;
            const monthlyLate = row.MONTHLY_LATE || 0;

            let monthlyScore = 0;
            if (monthlyTotal > 0) {
                // Formula: (Late / Total) * 100
                monthlyScore = ((monthlyLate / monthlyTotal) * 100).toFixed(2);
            }

            // Extract Daily Stats (Latest Active Date)
            const dailyTotal = row.DAILY_TOTAL || 0;
            const dailyLate = row.DAILY_LATE || 0;
            const dailyDate = row.DAILY_DATE || "No Data";

            let dailyScore = 0;
            if (dailyTotal > 0) {
                // Formula: (Late / Total) * 100
                dailyScore = ((dailyLate / dailyTotal) * 100).toFixed(2);
            }

            return {
                monthly: {
                    period: startDate ? "Selected Period" : "Current Month",
                    startDate: p_start,
                    endDate: p_end,
                    total: monthlyTotal,
                    late: monthlyLate,
                    score: `${monthlyScore}%`
                },
                daily: {
                    period: dailyDate !== "No Data" ? `Latest Active (${dailyDate})` : "Current Date",
                    date: dailyDate,
                    total: dailyTotal,
                    late: dailyLate,
                    score: `${dailyScore}%`
                }
            };

        } catch (error) {
            console.error("Error in getDeliveryStats:", error);
            throw error;
        } finally {
            if (connection) {
                try {
                    await connection.close();
                } catch (err) {
                    console.error("Error closing connection:", err);
                }
            }
        }
    });
}

async function getDeliveryReport({ startDate, endDate, salesPerson } = {}) {
    const now = new Date();

    // Calculate Financial Year Start Date (April 1st)
    // If current month is April or later, use current year's April 1st
    // Otherwise, use previous year's April 1st
    const currentMonth = now.getMonth(); // 0-indexed (0 = January, 3 = April)
    const financialYearStart = currentMonth >= 3
        ? new Date(now.getFullYear(), 3, 1)      // April 1st of current year
        : new Date(now.getFullYear() - 1, 3, 1); // April 1st of previous year

    const defaultStart = financialYearStart.toISOString().slice(0, 10);
    const defaultEnd = now.toISOString().slice(0, 10);

    const p_start = startDate || defaultStart;
    const p_end = endDate || defaultEnd;

    const cacheKey = generateCacheKey("delivery_report_v4", { p_start, p_end });

    return await withCache(cacheKey, DEFAULT_TTL.DASHBOARD, async () => {
        let connection;
        try {
            connection = await getConnection();

            const binds = {
                startDate: p_start,
                endDate: p_end
            };

            const result = await connection.execute(DELIVERY_REPORT_QUERY, binds, {
                outFormat: oracledb.OUT_FORMAT_OBJECT
            });

            return result.rows;

        } catch (error) {
            console.error("Error in getDeliveryReport:", error);
            throw error;
        } finally {
            if (connection) {
                try {
                    await connection.close();
                } catch (err) {
                    console.error("Error closing connection:", err);
                }
            }
        }
    });
}

async function getSalespersonDeliveryStats({ startDate, endDate } = {}) {
    // Default to Current Month if no dates provided
    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const defaultEnd = now.toISOString().slice(0, 10);

    const p_start = startDate || defaultStart;
    const p_end = endDate || defaultEnd;

    const cacheKey = generateCacheKey("salesperson_delivery_stats_v1", { p_start, p_end });

    return await withCache(cacheKey, DEFAULT_TTL.DASHBOARD, async () => {
        let connection;
        try {
            connection = await getConnection();

            const query = `
            WITH salesperson_data AS (
                SELECT 
                    CASE
                        WHEN sp.sales_person IN ('DIRECT', 'DC GOUTAM', 'P.S GEDAM')
                        THEN 'ANIL MISHRA'
                        ELSE sp.sales_person
                    END AS sales_person,
                    t.vrno,
                    t.contract_vrdate,
                    t.contract_qty,
                    t.vrdate,
                    CASE
                        WHEN TRUNC(t.vrdate) > 
                             TRUNC(
                                t.contract_vrdate + 
                                CASE 
                                    WHEN t.contract_qty < 51 THEN 7
                                    WHEN t.contract_qty BETWEEN 51 AND 100 THEN 14
                                    WHEN t.contract_qty > 100 THEN 20
                                    ELSE 0
                                END
                             )
                        THEN 'Yes'
                        ELSE 'No'
                    END AS delivery_late
                FROM view_itemtran_engine t
                LEFT JOIN (
                    SELECT 
                        a.vrno,
                        lhs_utility.get_name('emp_code', a.emp_code) AS sales_person
                    FROM view_order_engine a
                    WHERE a.entity_code = 'SR'
                ) sp ON sp.vrno = t.contract_vrno
                WHERE t.entity_code = 'SR'
                  AND t.series = 'SA'
                  AND t.div_code = 'PM'
                  AND t.vrdate >= TO_DATE(:startDate, 'YYYY-MM-DD')
                  AND t.vrdate <  TO_DATE(:endDate,   'YYYY-MM-DD') + 1
                GROUP BY 
                    sp.sales_person,
                    t.vrno,
                    t.contract_vrdate,
                    t.contract_qty,
                    t.vrdate,
                    t.contract_vrno
            ),
            latest_date AS (
                SELECT MAX(TRUNC(vrdate)) as max_dt FROM salesperson_data
            )
            SELECT 
                sales_person,
                COUNT(*) AS monthly_total,
                SUM(CASE WHEN delivery_late = 'Yes' THEN 1 ELSE 0 END) AS monthly_late,
                SUM(CASE WHEN TRUNC(vrdate) = (SELECT max_dt FROM latest_date) THEN 1 ELSE 0 END) AS daily_total,
                SUM(CASE WHEN delivery_late = 'Yes' AND TRUNC(vrdate) = (SELECT max_dt FROM latest_date) THEN 1 ELSE 0 END) AS daily_late,
                MAX((SELECT TO_CHAR(max_dt, 'YYYY-MM-DD') FROM latest_date)) as daily_date
            FROM salesperson_data
            WHERE sales_person IS NOT NULL
            GROUP BY sales_person
            ORDER BY sales_person
            `;

            const binds = {
                startDate: p_start,
                endDate: p_end
            };

            const result = await connection.execute(query, binds, {
                outFormat: oracledb.OUT_FORMAT_OBJECT
            });

            // Process results into a more usable format
            const salesPersonStats = {};

            result.rows.forEach(row => {
                const salesPerson = row.SALES_PERSON;
                const monthlyTotal = row.MONTHLY_TOTAL || 0;
                const monthlyLate = row.MONTHLY_LATE || 0;
                const dailyTotal = row.DAILY_TOTAL || 0;
                const dailyLate = row.DAILY_LATE || 0;
                const dailyDate = row.DAILY_DATE || "No Data";

                const monthlyScore = monthlyTotal > 0 ? ((monthlyLate / monthlyTotal) * 100).toFixed(2) : "0.00";
                const dailyScore = dailyTotal > 0 ? ((dailyLate / dailyTotal) * 100).toFixed(2) : "0.00";

                salesPersonStats[salesPerson] = {
                    monthly: {
                        total: monthlyTotal,
                        late: monthlyLate,
                        score: `${monthlyScore}%`
                    },
                    daily: {
                        date: dailyDate,
                        total: dailyTotal,
                        late: dailyLate,
                        score: `${dailyScore}%`
                    }
                };
            });

            return salesPersonStats;

        } catch (error) {
            console.error("Error in getSalespersonDeliveryStats:", error);
            throw error;
        } finally {
            if (connection) {
                try {
                    await connection.close();
                } catch (err) {
                    console.error("Error closing connection:", err);
                }
            }
        }
    });
}

module.exports = {
    getDeliveryStats,
    getDeliveryReport,
    getSalespersonDeliveryStats
};


