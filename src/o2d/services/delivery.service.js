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
    GROUP BY 
        t.vrno,
        t.contract_vrdate,
        t.contract_qty,
        t.vrdate
)
SELECT 
    -- Monthly/Period Stats (Based on filtered range)
    COUNT(*) AS monthly_total,
    SUM(CASE WHEN delivery_late = 'Yes' THEN 1 ELSE 0 END) AS monthly_late,
    
    -- Daily Stats (Last Day of the selected range)
    SUM(CASE WHEN TRUNC(vrdate) = TRUNC(TO_DATE(:endDate, 'YYYY-MM-DD')) THEN 1 ELSE 0 END) AS daily_total,
    SUM(CASE WHEN delivery_late = 'Yes' AND TRUNC(vrdate) = TRUNC(TO_DATE(:endDate, 'YYYY-MM-DD')) THEN 1 ELSE 0 END) AS daily_late
FROM raw_data
`;

async function getDeliveryStats({ startDate, endDate } = {}) {
    // Default to Current Month if no dates provided
    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const defaultEnd = now.toISOString().slice(0, 10);

    const p_start = startDate || defaultStart;
    const p_end = endDate || defaultEnd;

    const cacheKey = generateCacheKey("delivery_stats_v3", { p_start, p_end });

    return await withCache(cacheKey, DEFAULT_TTL.DASHBOARD, async () => {
        let connection;
        try {
            connection = await getConnection();

            const binds = {
                startDate: p_start,
                endDate: p_end
            };

            const result = await connection.execute(DELIVERY_STATS_QUERY, binds, {
                outFormat: oracledb.OUT_FORMAT_OBJECT
            });

            const row = (result.rows && result.rows[0]) ? result.rows[0] : {};

            // Extract Monthly/Period Stats
            const monthlyTotal = row.MONTHLY_TOTAL || 0;
            const monthlyLate = row.MONTHLY_LATE || 0;
            const monthlyOnTime = monthlyTotal - monthlyLate;

            let monthlyScore = 0;
            if (monthlyTotal > 0) {
                // Formula: (Late / Total) * 100
                monthlyScore = Math.round((monthlyLate / monthlyTotal) * 100);
            }

            // Extract Daily Stats (Last day of range)
            const dailyTotal = row.DAILY_TOTAL || 0;
            const dailyLate = row.DAILY_LATE || 0;
            const dailyOnTime = dailyTotal - dailyLate;

            let dailyScore = 0;
            if (dailyTotal > 0) {
                // Formula: (Late / Total) * 100
                dailyScore = Math.round((dailyLate / dailyTotal) * 100);
            }

            return {
                monthly: {
                    period: startDate ? "Selected Period" : "Current Month",
                    total: monthlyTotal,
                    late: monthlyLate,
                    on_time: monthlyOnTime,
                    score: `${monthlyScore}%`
                },
                daily: {
                    period: startDate ? "Selected Date (End)" : "Current Date",
                    total: dailyTotal,
                    late: dailyLate,
                    on_time: dailyOnTime,
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

module.exports = { getDeliveryStats };
