import { getConnection } from "../config/db.js";
import oracledb from "oracledb";

// 🟢 Fetch pending approvals
export async function getPendingApprovals() {
  const conn = await getConnection();
  try {
    const result = await conn.execute(
      `SELECT INDENT_NUMBER, INDENTER_NAME, DEPARTMENT, PRODUCT_NAME, VENDOR_TYPE,
              VENDOR_NAME_1, RATE_1, PAYMENT_TERM_1, VENDOR_NAME_2, RATE_2, PAYMENT_TERM_2,
              VENDOR_NAME_3, RATE_3, PAYMENT_TERM_3
         FROM STORE_INDENT
        WHERE PLANNED_3 IS NOT NULL
          AND ACTUAL_3 IS NULL
          AND VENDOR_TYPE = 'Three Party'`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    // Map vendors
    return result.rows.map((row) => ({
      indentNo: row.INDENT_NUMBER,
      indenter: row.INDENTER_NAME,
      department: row.DEPARTMENT,
      product: row.PRODUCT_NAME,
      vendorType: row.VENDOR_TYPE,
      vendors: Array.from({ length: 15 }, (_, i) => {
        const n = i + 1;
        return {
          name: row[`VENDOR_NAME_${n}`],
          rate: row[`RATE_${n}`],
          term: row[`PAYMENT_TERM_${n}`],
        };
      }).filter((v) => v.name && v.rate),
    }));
  } finally {
    await conn.close();
  }
}

// 🟠 Fetch history
export async function getApprovalHistory() {
  const conn = await getConnection();
  try {
    const result = await conn.execute(
      `SELECT INDENT_NUMBER, INDENTER_NAME, DEPARTMENT, PRODUCT_NAME,
              APPROVED_VENDOR_NAME, APPROVED_RATE, APPROVED_PAYMENT_TERM, ACTUAL_3
         FROM STORE_INDENT
        WHERE ACTUAL_3 IS NOT NULL
          AND VENDOR_TYPE = 'Three Party'
        ORDER BY ACTUAL_3 DESC`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return result.rows.map((row) => ({
      indentNo: row.INDENT_NUMBER,
      indenter: row.INDENTER_NAME,
      department: row.DEPARTMENT,
      product: row.PRODUCT_NAME,
      approvedVendor: row.APPROVED_VENDOR_NAME,
      approvedRate: row.APPROVED_RATE,
      approvedPaymentTerm: row.APPROVED_PAYMENT_TERM,
      date: row.ACTUAL_3,
    }));
  } finally {
    await conn.close();
  }
}

// 🔵 Approve vendor
// 🔵 Approve vendor
export async function approveVendor(indentNumber, vendorName, rate, term) {
  const conn = await getConnection();
  try {
    const sql = `
      UPDATE STORE_INDENT
      SET APPROVED_VENDOR_NAME = :vendorName,
          APPROVED_RATE = :rate,
          APPROVED_PAYMENT_TERM = :term,
          APPROVED_DATE = SYSDATE,         -- ✅ Fix: Save approval date
          ACTUAL_3 = SYSDATE,              -- Existing logic
          TIME_DELAY_3 = (SYSDATE - PLANNED_3)
      WHERE INDENT_NUMBER = :indentNumber
    `;

    const result = await conn.execute(
      sql,
      { indentNumber, vendorName, rate, term },
      { autoCommit: true }
    );

    return { success: true, rowsUpdated: result.rowsAffected };
  } finally {
    await conn.close();
  }
}

