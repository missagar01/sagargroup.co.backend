// src/services/stockService.js
import { getConnection } from "../config/db.js";
import { getOrSetCache, cacheKeys, DEFAULT_TTL } from "./redisCache.js";

/**
 * ⚙️ Fetch item stock from Oracle for a given date range.
 * - Uses Redis cache for fast retrieval
 * - Falls back to Oracle if cache miss
 * - Production-ready with error handling
 */
export async function fetchItemStock(fromDate, toDate) {
  const cacheKey = cacheKeys.stock(fromDate, toDate);

  return await getOrSetCache(
    cacheKey,
    async () => {
      const conn = await getConnection();
      try {
        // 1) Set the date window in the package
        const plsql = `
          BEGIN
            LHS_UTILITY.SET_FROM_DATE( TO_DATE(:p_from, 'DD-MON-RR') );
            LHS_UTILITY.SET_TO_DATE( TO_DATE(:p_to,  'DD-MON-RR') );
          END;
        `;
        await conn.execute(plsql, {
          p_from: fromDate,
          p_to: toDate,
        });

        // 2) Main query (same logic, thoda clean)
        const sql = `
          SELECT
            NVL(ITEM_CODE, 'N.A.')                               AS COL1,
            NVL(LHS_UTILITY.GET_NAME('ITEM_CODE', ITEM_CODE), 'N.A.') AS COL2,
            NVL(UM, ' ')                                         AS COL3,
            SUM(NVL(YRCLQTY_ENGINE, 0))                          AS COL4,
            SUM(NVL(YROPAQTY, 0))                                AS COL5
          FROM VIEW_ITEM_STOCK_ENGINE
          WHERE ENTITY_CODE = 'SR'
            AND (
                div_code IN ('C1','C2','CO','F1','F2','F3','PM','R1','R2','RM','RP','SM')
                OR div_code IS NULL
            )
            AND ITEM_NATURE IN ('SI')
          GROUP BY
            ITEM_CODE,
            LHS_UTILITY.GET_NAME('ITEM_CODE', ITEM_CODE),
            NVL(UM, ' ')
          HAVING
            SUM(NVL(YROPAQTY, 0)) > 0
            AND SUM(NVL(YRCLQTY_ENGINE, 0)) > 0
          ORDER BY
            ITEM_CODE,
            LHS_UTILITY.GET_NAME('ITEM_CODE', ITEM_CODE),
            NVL(UM, ' ')
        `;

        const result = await conn.execute(sql, [], {
          outFormat: 4002, // oracledb.OUT_FORMAT_OBJECT
        });

        return result.rows ?? [];
      } finally {
        await conn.close();
      }
    },
    DEFAULT_TTL.STOCK
  );
}
