// src/services/uom.service.js
import { getConnection } from "../config/db.js";
import oracledb from "../config/oracleClient.js";
import { getOrSetCache, cacheKeys, DEFAULT_TTL } from "./redisCache.js";

export async function getUomItemsService() {
  try {
    const result = await getOrSetCache(
      cacheKeys.uomItems(),
      async () => {
        const conn = await getConnection();
        try {
          const sql = `
            SELECT t.item_code,
                   t.item_name,
                   t.um
            FROM item_mast t
            WHERE t.item_nature = 'SI'
              AND t.item_status <> 'C'
            ORDER BY t.item_name
          `;

          const result = await conn.execute(sql, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT,
          });

          return result.rows || [];
        } finally {
          if (conn) {
            try {
              await conn.close();
            } catch (closeErr) {
              console.error("Error closing Oracle connection:", closeErr);
            }
          }
        }
      },
      DEFAULT_TTL.UOM
    );

    return {
      ok: true,
      rows: result || [],
    };
  } catch (err) {
    console.error("getUomItemsService error:", err);
    return {
      ok: false,
      error: err.message || "Oracle query failed",
    };
  }
}
