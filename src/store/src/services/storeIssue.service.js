import { getConnection } from "../config/db.js";
import oracledb from "oracledb";
import { getOrSetCache, cacheKeys, DEFAULT_TTL } from "./redisCache.js";

/**
 * Fetch material issue transactions (MS) for SR entity
 * Optimized with Redis cache and date filtering
 */
export const getStoreIssues = async () => {
    return await getOrSetCache(
        cacheKeys.storeIssue(),
        async () => {
            let connection;
            try {
                connection = await getConnection();

                const query = `
                    SELECT t.vrno,
                           t.vrdate,
                           t.irfield1 as requester,
                           CASE 
                               WHEN t.div_code = 'PM' THEN 'PIPE MILL' 
                               WHEN t.div_code = 'RP' THEN 'STRIP MILL' 
                               WHEN t.div_code = 'SM' THEN 'SMS' 
                           END as division,
                           lhs_utility.get_name('dept_code', t.dept_code) as department,
                           t.item_code,
                           t.item_name,
                           t.qtyissued,
                           CASE 
                               WHEN t.remark = 'NULL' OR t.remark IS NULL THEN '' 
                               ELSE t.remark 
                           END as purpose
                    FROM view_itemtran_engine t
                    WHERE t.entity_code = 'SR'
                      AND t.trantype = 'MS'
                      AND t.vrdate >= TO_DATE('01-02-2026', 'DD-MM-YYYY')
                    ORDER BY t.vrdate ASC
                `;

                const result = await connection.execute(query, [], {
                    outFormat: oracledb.OUT_FORMAT_OBJECT
                });

                return {
                    success: true,
                    data: result.rows || []
                };
            } catch (err) {
                console.error("Error in storeIssue.service.js:", err);
                throw err;
            } finally {
                if (connection) {
                    try {
                        await connection.close();
                    } catch (err) {
                        console.error("Error closing connection:", err);
                    }
                }
            }
        },
        DEFAULT_TTL.STORE_ISSUE
    );
};
