const { getConnection } = require("../config/db.js");
const oracledb = require("oracledb");
const {
  generateCacheKey,
  withCache,
  DEFAULT_TTL,
} = require("../utils/cacheHelper.js");

const TODAYS_VEHICLES_QUERY = `
SELECT t.order_vrno,
       lhs_utility.get_name('emp_code',
           (SELECT DISTINCT a.emp_code
            FROM order_head a
            WHERE a.vrno = t.order_vrno)) AS our_staff_name,
       t.acc_remark AS party_name,
       t.qtyorder,
       lhs_utility.get_name('item_catg', t.item_catg) AS item_group
FROM view_weighbridge_engine t
WHERE t.entity_code = 'SR'
  AND t.order_tcode = 'O'
  AND t.indate >= TRUNC(SYSDATE)
ORDER BY t.order_vrno ASC
`;

async function getTodaysVehicles() {
  return withCache(
    generateCacheKey("todays_vehicles"),
    DEFAULT_TTL.TIMELINE,
    async () => {
      let connection;
      try {
        connection = await getConnection();
        const result = await connection.execute(TODAYS_VEHICLES_QUERY, [], {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
        });
        return result.rows || [];
      } catch (error) {
        console.error("Error fetching today's vehicles:", error);
        throw error;
      } finally {
        if (connection) {
          try {
            await connection.close();
          } catch (closeError) {
            console.error("Error closing Oracle connection:", closeError);
          }
        }
      }
    }
  );
}

module.exports = { getTodaysVehicles };
