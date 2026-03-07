import pool from "../config/postgres.js";

// 1️⃣ Fetch all tasks
export const fetchAllTasks = async () => {
  try {
    const query = `
      SELECT *
      FROM repair_system
      ORDER BY id DESC;
    `;
    const { rows } = await pool.query(query);
    return rows;
  } catch (error) {
    console.error("Error in fetchAllTasks:", error.message);
    // Return empty array if table doesn't exist
    if (error.message.includes('does not exist')) {
      console.warn("⚠️ repair_system table does not exist, returning empty array");
      return [];
    }
    throw error;
  }
};

// 2️⃣ Pending → actual_4 IS NULL OR status != 'done'
export const fetchPendingTasks = async () => {
  try {
    const query = `
      SELECT *
      FROM repair_system
      WHERE status IS NULL OR status != 'done';
    `;
    const { rows } = await pool.query(query);
    return rows;
  } catch (error) {
    console.error("Error in fetchPendingTasks:", error.message);
    if (error.message.includes('does not exist')) {
      return [];
    }
    throw error;
  }
};

// 3️⃣ Completed → status = 'done'
export const fetchCompletedTasks = async () => {
  try {
    const query = `
      SELECT *
      FROM repair_system
      WHERE status = 'done';
    `;
    const { rows } = await pool.query(query);
    return rows;
  } catch (error) {
    console.error("Error in fetchCompletedTasks:", error.message);
    if (error.message.includes('does not exist')) {
      return [];
    }
    throw error;
  }
};

// 4️⃣ Department-wise count
export const fetchDepartmentWiseCount = async () => {
  try {
    const query = `
      SELECT department, COUNT(*) AS count
      FROM repair_system
      GROUP BY department
      ORDER BY department ASC;
    `;
    const { rows } = await pool.query(query);
    return rows;
  } catch (error) {
    console.error("Error in fetchDepartmentWiseCount:", error.message);
    if (error.message.includes('does not exist')) {
      return [];
    }
    throw error;
  }
};

// 5️⃣ Payment Type Distribution
export const fetchPaymentTypeDistribution = async () => {
  try {
    const query = `
      SELECT payment_type AS type, SUM(total_bill_amount) AS amount
      FROM repair_system
      GROUP BY payment_type;
    `;
    const { rows } = await pool.query(query);
    return rows;
  } catch (error) {
    console.error("Error in fetchPaymentTypeDistribution:", error.message);
    if (error.message.includes('does not exist')) {
      return [];
    }
    throw error;
  }
};

// 6️⃣ Vendor-wise repair cost
export const fetchVendorWiseCosts = async () => {
  try {
    const query = `
      SELECT vendor_name AS vendor, SUM(total_bill_amount) AS cost
      FROM repair_system
      GROUP BY vendor_name
      ORDER BY cost DESC
      LIMIT 5;
    `;
    const { rows } = await pool.query(query);
    return rows;
  } catch (error) {
    console.error("Error in fetchVendorWiseCosts:", error.message);
    if (error.message.includes('does not exist')) {
      return [];
    }
    throw error;
  }
};
