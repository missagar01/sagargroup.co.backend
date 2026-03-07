import { getConnection } from "../config/db.js";
import oracledb from "oracledb";

export async function vendorRateUpdatePending() {
  const conn = await getConnection();
  try {
    const result = await conn.execute(
      `SELECT 
         INDENT_NUMBER, INDENTER_NAME, DEPARTMENT, PRODUCT_NAME,
         APPROVED_QUANTITY, UOM, VENDOR_TYPE, PLANNED_2, ACTUAL_2
       FROM STORE_INDENT
       WHERE PLANNED_2 IS NOT NULL AND ACTUAL_2 IS NULL
       ORDER BY PLANNED_2`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return result.rows;
  } finally {
    await conn.close();
  }
}

// 🟠 Vendor rate history
export async function vendorRateUpdateHistory() {
  const conn = await getConnection();
  try {
    const result = await conn.execute(
      `SELECT 
         INDENT_NUMBER, INDENTER_NAME, DEPARTMENT, PRODUCT_NAME,
         APPROVED_QUANTITY, UOM, VENDOR_TYPE, ACTUAL_2,
         VENDOR_NAME_1 AS APPROVED_VENDOR, RATE_1 AS APPROVED_RATE,
         PAYMENT_TERM_1 AS APPROVED_TERM
       FROM STORE_INDENT
       WHERE PLANNED_2 IS NOT NULL AND ACTUAL_2 IS NOT NULL
       ORDER BY ACTUAL_2 DESC`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return result.rows;
  } finally {
    
    await conn.close();
  }
}

// 🔵 Update vendors and mark ACTUAL_2
export async function updateVendorRate(indentNumber, vendors) {
  let conn;
  try {
    conn = await getConnection();

    if (!indentNumber || !Array.isArray(vendors) || vendors.length === 0) {
      throw new Error("Invalid vendor data");
    }

    const setClauses = [];
    const binds = { indentNumber }; // ✅ Always include this

    // Build dynamic SQL for up to 15 vendors
    vendors.forEach((vendor, index) => {
      const n = index + 1;
      if (n > 15) return;

      setClauses.push(`VENDOR_NAME_${n} = :vendorName${n}`);
      setClauses.push(`RATE_${n} = :rate${n}`);
      setClauses.push(`PAYMENT_TERM_${n} = :paymentTerm${n}`);

      binds[`vendorName${n}`] = vendor.vendorName;
      binds[`rate${n}`] = vendor.rate;
      binds[`paymentTerm${n}`] = vendor.paymentTerm;
    });

    // Always set ACTUAL_2 to mark completion
    setClauses.push(`ACTUAL_2 = SYSDATE`);

    // 🟢 Add approved vendor details only if we didn’t already set vendor 1
    const hasVendor1 = setClauses.some(c => c.startsWith("VENDOR_NAME_1"));
    if (!hasVendor1) {
      setClauses.push(`VENDOR_NAME_1 = :approvedVendor`);
      setClauses.push(`RATE_1 = :approvedRate`);
      setClauses.push(`PAYMENT_TERM_1 = :approvedTerm`);

      binds.approvedVendor = vendors[0]?.vendorName || null;
      binds.approvedRate = vendors[0]?.rate || null;
      binds.approvedTerm = vendors[0]?.paymentTerm || null;
    }

    // 🧹 Clean up unused binds but always keep indentNumber
    Object.keys(binds).forEach((key) => {
      if (key !== "indentNumber" && !setClauses.join(" ").includes(`:${key}`)) {
        delete binds[key];
      }
    });

    const sql = `
      UPDATE STORE_INDENT
      SET ${setClauses.join(", ")}
      WHERE INDENT_NUMBER = :indentNumber
    `;

    console.log("🟢 Executing Vendor Rate Update SQL:", sql);
    console.log("🟢 Bind Params:", binds);

    const result = await conn.execute(sql, binds, { autoCommit: true });
    return { success: true, rowsUpdated: result.rowsAffected };
  } catch (err) {
    console.error("Error updating vendor rate:", err);
    throw err;
  } finally {
    if (conn) await conn.close();
  }
}
