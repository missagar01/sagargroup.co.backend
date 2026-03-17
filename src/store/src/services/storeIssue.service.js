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
                    SELECT t.vrno AS VRNO,
                           t.vrdate AS VRDATE,
                           t.irfield1 AS REQUESTER,
                           CASE 
                               WHEN t.div_code = 'PM' THEN 'PIPE MILL' 
                               WHEN t.div_code = 'RP' THEN 'STRIP MILL' 
                               WHEN t.div_code = 'SM' THEN 'SMS' 
                           END AS DIVISION,
                           lhs_utility.get_name('dept_code', t.dept_code) AS DEPARTMENT,
                           t.item_code AS ITEM_CODE,
                           t.item_name AS ITEM_NAME,
                           t.qtyissued AS QTYISSUED,
                           CASE 
                               WHEN t.remark = 'NULL' OR t.remark IS NULL THEN '' 
                               ELSE t.remark 
                           END AS PURPOSE
                    FROM view_itemtran_engine t
                    WHERE t.entity_code = 'SR'
                      AND t.trantype = 'MS'
                      AND t.vrdate >= DATE '2026-02-01'
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
