// import maintenancePool from "../config/db.js";
import { maintenancePool } from "../../config/db.js";

// 🟢 Get all machines
export const getAllMachines = async (filters = {}) => {
  const { machineName, department } = filters;
  const conditions = [];
  const values = [];

  if (machineName) {
    values.push(machineName);
    conditions.push(`LOWER(TRIM(machine_name)) = LOWER(TRIM($${values.length}))`);
  }

  if (department) {
    values.push(department);
    conditions.push(`LOWER(TRIM(department)) = LOWER(TRIM($${values.length}))`);
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const result = await maintenancePool.query(
    `
      SELECT *
      FROM form_responses
      ${whereClause}
      ORDER BY machine_name ASC, id DESC
    `,
    values
  );

  return result.rows;
};

// 🟢 Get a machine by Serial No
export const getMachineBySerial = async (serialNo) => {
  const result = await maintenancePool.query(
    `SELECT * FROM form_responses WHERE LOWER(TRIM(serial_no)) = LOWER(TRIM($1)) LIMIT 1`,
    [serialNo]
  );
  return result.rows[0];
};

// 🟢 Get a machine by Tag No
export const getMachineByTag = async (tagNo) => {
  const result = await maintenancePool.query(
    `SELECT * FROM form_responses WHERE LOWER(TRIM(tag_no)) = LOWER(TRIM($1)) LIMIT 1`,
    [tagNo]
  );
  return result.rows[0];
};

// 🟢 Update machine info
export const updateMachine = async (serialNo, data) => {
  const fieldMap = {
    machine_name: "machine_name",
    model_no: "model_no",
    manufacturer: "manufacturer",
    department: "department",
    location: "location",
    purchase_date: "purchase_date",
    purchase_price: "purchase_price",
    vendor: "vendor",
    warranty_expiration: "warranty_expiration",
    initial_maintenance_date: "initial_maintenance_date",
    notes: "notes",
    tag_no: "tag_no",
    user_allot: "user_allot"
  };

  const updates = [];
  const values = [];
  let i = 1;

  for (const key in data) {
    if (fieldMap[key]) {
      let value = data[key];

      // Convert empty string → NULL
      if (value === "" || value === undefined) {
        value = null;
      }

      updates.push(`${fieldMap[key]} = $${i}`);
      values.push(value);
      i++;
    }
  }

  if (updates.length === 0) return false;

  values.push(serialNo);

  const query = `
    UPDATE form_responses
    SET ${updates.join(", ")}
    WHERE LOWER(TRIM(serial_no)) = LOWER(TRIM($${i}))
    RETURNING *;
  `;

  const result = await maintenancePool.query(query, values);
  return result.rowCount > 0;
};

// 🟢 Update machine info via Tag No
export const updateMachineByTag = async (tagNo, data) => {
  const fieldMap = {
    machine_name: "machine_name",
    model_no: "model_no",
    manufacturer: "manufacturer",
    department: "department",
    location: "location",
    purchase_date: "purchase_date",
    purchase_price: "purchase_price",
    vendor: "vendor",
    warranty_expiration: "warranty_expiration",
    initial_maintenance_date: "initial_maintenance_date",
    notes: "notes",
    tag_no: "tag_no",
    user_allot: "user_allot"
  };

  const updates = [];
  const values = [];
  let i = 1;

  for (const key in data) {
    if (fieldMap[key]) {
      let value = data[key];

      // Convert empty string → NULL
      if (value === "" || value === undefined) {
        value = null;
      }

      updates.push(`${fieldMap[key]} = $${i}`);
      values.push(value);
      i++;
    }
  }

  if (updates.length === 0) return false;

  values.push(tagNo);

  const query = `
    UPDATE form_responses
    SET ${updates.join(", ")}
    WHERE LOWER(TRIM(tag_no)) = LOWER(TRIM($${i}))
    RETURNING *;
  `;

  const result = await maintenancePool.query(query, values);
  return result.rowCount > 0;
};


// 🟢 Get maintenance history + analytics
export const getMachineHistory = async (serialNo) => {
  try {
    const query = `
      SELECT
        task_no AS task_no,
        serial_no AS serial_no,
        machine_name AS machine_name,
        task_type AS task_type,
        task_start_date AS task_start_date,
        actual_date AS actual_date,
        doer_name AS doer_name,
        maintenance_cost AS maintenance_cost,
        temperature_status AS temperature_status,
        remarks AS remarks
      FROM maintenance_task_assign
      WHERE LOWER(TRIM(serial_no)) = LOWER(TRIM($1))
        AND COALESCE(actual_date::text, '') <> ''  -- ✅ only completed
      ORDER BY task_start_date DESC;
    `;

    let result;
    try {
      result = await maintenancePool.query(query, [serialNo]);
    } catch (err) {
      // if table name is capitalized
      if (err.code === "42P01") {
        result = await maintenancePool.query(
          query.replace(
            /FROM maintenance_task_assign/,
            'FROM "Maintenance_Task_Assign"'
          ),
          [serialNo]
        );
      } else {
        throw err;
      }
    }

    return result.rows;
  } catch (err) {
    console.error("❌ Error fetching history:", err);
    throw err;
  }
};

// 🟢 Get maintenance history via Tag No
export const getMachineHistoryByTag = async (tagNo) => {
  try {
    const query = `
      SELECT
        task_no AS task_no,
        tag_no AS tag_no,
        machine_name AS machine_name,
        task_type AS task_type,
        task_start_date AS task_start_date,
        actual_date AS actual_date,
        doer_name AS doer_name,
        maintenance_cost AS maintenance_cost,
        temperature_status AS temperature_status,
        remarks AS remarks
      FROM maintenance_task_assign
      WHERE LOWER(TRIM(tag_no)) = LOWER(TRIM($1))
        AND COALESCE(actual_date::text, '') <> ''  -- ✅ only completed
      ORDER BY task_start_date DESC;
    `;

    let result;
    try {
      result = await maintenancePool.query(query, [tagNo]);
    } catch (err) {
      // if table name is capitalized
      if (err.code === "42P01") {
        result = await maintenancePool.query(
          query.replace(
            /FROM maintenance_task_assign/,
            'FROM "Maintenance_Task_Assign"'
          ),
          [tagNo]
        );
      } else {
        throw err;
      }
    }

    return result.rows;
  } catch (err) {
    console.error("❌ Error fetching history:", err);
    throw err;
  }
};


