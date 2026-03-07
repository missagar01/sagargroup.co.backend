import { getConnection } from "../config/db.js";
import oracledb from "../config/oracleClient.js";

/**
 * Get active store indent items (SI) grouped by level 4 from Oracle.
 */
export async function getStoreIndentItems() {
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
          "GROUPNAME": { type: oracledb.STRING },
          "ITEM_CODE": { type: oracledb.STRING },
          "ITEMNAME": { type: oracledb.STRING }
        }
      }
    );
    return {
      success: true,
      data: result.rows.map((row) => ({
        groupname: row.GROUPNAME,
        item_code: row.ITEM_CODE,
        itemname: row.ITEMNAME,
      }))
    };

  } catch (err) {
    console.error('[getStoreIndentItems] Oracle error:', err);
    return { success: false, error: err.message || "Failed to fetch store indent items." };
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('[getStoreIndentItems] Error closing connection:', err);
      }
    }
  }
}

/**
 * Get unique, active store indent item categories.
 */
export async function getStoreIndentCategories() {
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

    return {
      success: true,
      data: result.rows.map((row) => row.ITEM_CATG_NAME),
    };
  } catch (err) {
    console.error('[getStoreIndentCategories] Oracle error:', err);
    return { success: false, error: err.message || "Failed to fetch item categories." };
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('[getStoreIndentCategories] Error closing connection:', err);
      }
    }
  }
}
