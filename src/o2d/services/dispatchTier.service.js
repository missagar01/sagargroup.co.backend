const oracledb = require("oracledb");
const { getConnection } = require("../config/db.js");
const { generateCacheKey, withCache, DEFAULT_TTL } = require("../utils/cacheHelper.js");

function parseDateParam(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const match = dateStr.match(/^\d{4}-\d{2}-\d{2}$/);
  if (!match) return null;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

function classifyTier(quantity) {
  const q = Number(quantity || 0);
  if (q <= 50) return "bronze";
  if (q <= 100) return "silver";
  if (q <= 150) return "gold";
  if (q <= 200) return "platinum";
  return "diamond";
}

async function getCustomerDispatchTiers({ fromDate, toDate } = {}) {
  const now = new Date();
  // Default to 1st of current month
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultTo = now;

  const parsedFrom = parseDateParam(fromDate) || defaultFrom;
  const parsedTo = parseDateParam(toDate) || defaultTo;

  const safeFrom = parsedFrom.toISOString().slice(0, 10);
  const safeTo = parsedTo.toISOString().slice(0, 10);

  const cacheKey = generateCacheKey("dispatch_tiers", {
    fromDate: safeFrom,
    toDate: safeTo,
  });

  return await withCache(cacheKey, DEFAULT_TTL.DASHBOARD || 300, async () => {
    let connection;
    try {
      connection = await getConnection();
      if (!connection) {
        throw new Error("Failed to establish Oracle database connection");
      }

      const binds = {
        p_from_date: safeFrom,
        p_to_date: safeTo,
      };


      const query = `
        SELECT lhs_utility.get_name('acc_code', t.acc_code) AS customer_name,
               ROUND(SUM(t.qtyissued), 2) AS quantity
        FROM view_itemtran_engine t
        WHERE t.series = 'SA'
          AND t.acc_code IS NOT NULL
          AND t.div_code = 'PM'
          AND t.acc_vrno <> 'CANCELLED'
          AND t.vrdate >= TO_DATE(:p_from_date, 'YYYY-MM-DD')
          AND t.vrdate <= TO_DATE(:p_to_date, 'YYYY-MM-DD')
        GROUP BY t.acc_code
        ORDER BY lhs_utility.get_name('acc_code', t.acc_code) ASC
      `;

      const result = await connection.execute(query, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });

      const rows = result.rows || [];

      const tiers = {
        bronze: [],
        silver: [],
        gold: [],
        platinum: [],
        diamond: [],
      };

      let totalQuantity = 0;

      rows.forEach((row) => {
        const customerName = (row.CUSTOMER_NAME || "").trim();
        const quantity = Number(row.QUANTITY || 0);
        if (!customerName) return;

        totalQuantity += quantity;
        const tier = classifyTier(quantity);
        const item = {
          name: customerName,
          quantity: Number(quantity.toFixed(2)),
          tier,
        };

        tiers[tier].push(item);
      });

      // Sort customers within each tier by quantity descending (highest dispatches first) or name
      Object.keys(tiers).forEach((k) => {
        tiers[k].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));
      });

      const tierStats = {
        bronze: {
          label: "Bronze",
          range: "0 - 50 MT",
          count: tiers.bronze.length,
          quantity: Number(tiers.bronze.reduce((s, c) => s + c.quantity, 0).toFixed(2)),
        },
        silver: {
          label: "Silver",
          range: "51 - 100 MT",
          count: tiers.silver.length,
          quantity: Number(tiers.silver.reduce((s, c) => s + c.quantity, 0).toFixed(2)),
        },
        gold: {
          label: "Gold",
          range: "101 - 150 MT",
          count: tiers.gold.length,
          quantity: Number(tiers.gold.reduce((s, c) => s + c.quantity, 0).toFixed(2)),
        },
        platinum: {
          label: "Platinum",
          range: "151 - 200 MT",
          count: tiers.platinum.length,
          quantity: Number(tiers.platinum.reduce((s, c) => s + c.quantity, 0).toFixed(2)),
        },
        diamond: {
          label: "Diamond",
          range: "200+ MT",
          count: tiers.diamond.length,
          quantity: Number(tiers.diamond.reduce((s, c) => s + c.quantity, 0).toFixed(2)),
        },
      };

      return {
        tiers,
        summary: {
          totalCustomers: rows.length,
          totalQuantity: Number(totalQuantity.toFixed(2)),
          tierStats,
        },
        filters: {
          fromDate: safeFrom,
          toDate: safeTo,
        },
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      console.error("❌ Error in getCustomerDispatchTiers:", error.message);
      throw new Error(`Dispatch tiers data fetch failed: ${error.message}`);
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (closeError) {
          console.error("⚠️ Error closing Oracle connection:", closeError.message);
        }
      }
    }
  });
}

module.exports = {
  getCustomerDispatchTiers,
  classifyTier,
};
