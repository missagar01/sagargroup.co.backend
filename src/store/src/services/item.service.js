import { getConnection } from "../config/db.js";
import oracledb from "../config/oracleClient.js";
import { getOrSetCache, cacheKeys, DEFAULT_TTL } from "./redisCache.js";

/**
 * Get active store indent items (SI) grouped by level 4 from Oracle.
 */
export async function getStoreIndentItems() {
  try {
    const data = await getOrSetCache(
      cacheKeys.itemsMaster(),
      async () => {
        let connection;
        try {
          connection = await getConnection();

          const sql = `
            SELECT DISTINCT t.level_4_name AS groupname,
                            t.item_code,
                            UPPER(t.item_name) AS itemname
            FROM view_item_mast_engine t
            WHERE t.item_nature = 'SI'
            ORDER BY t.level_4_name ASC`;

          const result = await connection.execute(sql, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT,
            fetchInfo: {
              GROUPNAME: { type: oracledb.STRING },
              ITEM_CODE: { type: oracledb.STRING },
              ITEMNAME: { type: oracledb.STRING },
            },
          });

          return (result.rows || []).map((row) => ({
            groupname: row.GROUPNAME,
            item_code: row.ITEM_CODE,
            itemname: row.ITEMNAME,
          }));
        } finally {
          if (connection) {
            try {
              await connection.close();
            } catch (err) {
              console.error("[getStoreIndentItems] Error closing connection:", err);
            }
          }
        }
      },
      DEFAULT_TTL.ITEMS
    );

    return {
      success: true,
      data,
    };
  } catch (err) {
    console.error('[getStoreIndentItems] Oracle error:', err);
    return { success: false, error: err.message || "Failed to fetch store indent items." };
  }
}

/**
 * Get unique, active store indent item categories.
 */
export async function getStoreIndentCategories() {
  try {
    const data = await getOrSetCache(
      cacheKeys.itemCategories(),
      async () => {
        let connection;
        try {
          connection = await getConnection();

          const result = await connection.execute(
            `SELECT DISTINCT t.item_catg_name
             FROM view_item_mast_engine t
             WHERE t.item_nature = 'SI'
               AND (t.item_status IN ('U', 'N') OR t.item_status IS NULL)
               AND t.item_catg_name IS NOT NULL
             ORDER BY t.item_catg_name`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );

          return (result.rows || []).map((row) => row.ITEM_CATG_NAME);
        } finally {
          if (connection) {
            try {
              await connection.close();
            } catch (err) {
              console.error('[getStoreIndentCategories] Error closing connection:', err);
            }
          }
        }
      },
      DEFAULT_TTL.ITEMS
    );

    return {
      success: true,
      data,
    };
  } catch (err) {
    console.error('[getStoreIndentCategories] Oracle error:', err);
    return { success: false, error: err.message || "Failed to fetch item categories." };
  }
}



