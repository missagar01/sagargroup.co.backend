import { pool, maintenancePool } from "../config/db.js";
import { pool as housekeepingPool } from "../config/housekeppingdb.js";

const shouldUpdateValue = (value) =>
  value !== undefined && value !== null && value !== "";

const normalizeYesNoValue = (value) =>
  String(value || "").trim().toLowerCase() === "yes" ? "yes" : "no";



export const fetchChecklist = async (
  page = 0,
  pageSize = 50,
  nameFilter = "",
  startDate,
  endDate
) => {
  try {
    const offset = page * pageSize;
    const filters = ["submission_date IS NULL"];
    const params = [];
    let paramIndex = 1;

    const hasDateRange = startDate && endDate;
    if (hasDateRange) {
      filters.push(`task_start_date >= $${paramIndex++}`);
      params.push(`${startDate} 00:00:00`);
      filters.push(`task_start_date <= $${paramIndex++}`);
      params.push(`${endDate} 23:59:59`);
    }

    if (nameFilter) {
      filters.push(`LOWER(name) = LOWER($${paramIndex++})`);
      params.push(nameFilter);
    }

    const whereClause = filters.join(" AND ");

    // Using DISTINCT ON to get exactly one record per name/task_description
    const dataQuery = `
      SELECT DISTINCT ON (LOWER(name), LOWER(task_description)) *
      FROM checklist
      WHERE ${whereClause}
      ORDER BY LOWER(name), LOWER(task_description), task_start_date ASC
      LIMIT $${paramIndex++}
      OFFSET $${paramIndex}
    `;

    const dataParams = [...params, pageSize, offset];

    const countQuery = `
      SELECT COUNT(*) AS count FROM (
        SELECT 1
        FROM checklist
        WHERE ${whereClause}
        GROUP BY LOWER(name), LOWER(task_description)
      ) AS subquery
    `;

    const [dataRes, countRes] = await Promise.all([
      pool.query(dataQuery, dataParams),
      pool.query(countQuery, params),
    ]);

    const total = parseInt(countRes.rows[0]?.count ?? 0, 10);
    return { data: dataRes.rows, total };
  } catch (err) {
    console.log("Error in fetchChecklist:", err);
    return { data: [], total: 0 };
  }
};


export const fetchDelegation = async (
  page = 0,
  pageSize = 50,
  nameFilter = "",
  startDate,
  endDate
) => {
  try {
    const offset = page * pageSize;
    const filters = ["submission_date IS NULL"];
    const params = [];
    let paramIndex = 1;

    const hasDateRange = startDate && endDate;
    if (hasDateRange) {
      filters.push(`task_start_date >= $${paramIndex++}`);
      params.push(`${startDate} 00:00:00`);
      filters.push(`task_start_date <= $${paramIndex++}`);
      params.push(`${endDate} 23:59:59`);
    }

    if (nameFilter) {
      filters.push(`LOWER(name) = LOWER($${paramIndex++})`);
      params.push(nameFilter);
    }

    const whereClause = filters.join(" AND ");

    // Using DISTINCT ON to get exactly one record per name/task_description
    const dataQuery = `
      SELECT DISTINCT ON (LOWER(name), LOWER(task_description)) *
      FROM delegation
      WHERE ${whereClause}
      ORDER BY LOWER(name), LOWER(task_description), task_start_date ASC
      LIMIT $${paramIndex++}
      OFFSET $${paramIndex}
    `;

    const dataParams = [...params, pageSize, offset];

    const countQuery = `
      SELECT COUNT(*) AS count FROM (
        SELECT 1
        FROM delegation
        WHERE ${whereClause}
        GROUP BY LOWER(name), LOWER(task_description)
      ) AS subquery
    `;

    const [dataRes, countRes] = await Promise.all([
      pool.query(dataQuery, dataParams),
      pool.query(countQuery, params),
    ]);

    const total = parseInt(countRes.rows[0]?.count ?? 0, 10);
    return { data: dataRes.rows, total };
  } catch (err) {
    console.log("Error in fetchDelegation:", err);
    return { data: [], total: 0 };
  }
};

export const fetchMaintenance = async (
  page = 0,
  pageSize = 50,
  nameFilter = "",
  startDate,
  endDate
) => {
  try {
    const offset = page * pageSize;
    const filters = ["actual_date IS NULL"];
    const params = [];
    let paramIndex = 1;

    const hasDateRange = startDate && endDate;
    if (hasDateRange) {
      filters.push(`task_start_date >= $${paramIndex++}`);
      params.push(`${startDate} 00:00:00`);
      filters.push(`task_start_date <= $${paramIndex++}`);
      params.push(`${endDate} 23:59:59`);
    }

    if (nameFilter) {
      filters.push(`LOWER(doer_name) = LOWER($${paramIndex++})`);
      params.push(nameFilter);
    }

    const whereClause = filters.join(" AND ");

    const dataQuery = `
      SELECT DISTINCT ON (LOWER(COALESCE(doer_name, '')), LOWER(COALESCE(description, '')))
        id AS task_id,
        COALESCE(doer_department, machine_department) AS department,
        given_by,
        doer_name AS name,
        description AS task_description,
        task_start_date,
        actual_date AS submission_date,
        frequency,
        task_type,
        priority,
        machine_name,
        serial_no,
        task_status AS status
      FROM maintenance_task_assign
      WHERE ${whereClause}
      ORDER BY
        LOWER(COALESCE(doer_name, '')),
        LOWER(COALESCE(description, '')),
        task_start_date ASC
      LIMIT $${paramIndex++}
      OFFSET $${paramIndex}
    `;

    const dataParams = [...params, pageSize, offset];

    const countQuery = `
      SELECT COUNT(*) AS count FROM (
        SELECT 1
        FROM maintenance_task_assign
        WHERE ${whereClause}
        GROUP BY LOWER(COALESCE(doer_name, '')), LOWER(COALESCE(description, ''))
      ) AS subquery
    `;

    const [dataRes, countRes] = await Promise.all([
      maintenancePool.query(dataQuery, dataParams),
      maintenancePool.query(countQuery, params),
    ]);

    const total = parseInt(countRes.rows[0]?.count ?? 0, 10);
    return { data: dataRes.rows, total };
  } catch (err) {
    console.log("Error in fetchMaintenance:", err);
    return { data: [], total: 0 };
  }
};

export const fetchHousekeeping = async (
  page = 0,
  pageSize = 50,
  nameFilter = "",
  startDate,
  endDate
) => {
  try {
    if (!housekeepingPool) {
      return { data: [], total: 0 };
    }

    const offset = page * pageSize;
    const filters = ["submission_date IS NULL"];
    const params = [];
    let paramIndex = 1;

    const hasDateRange = startDate && endDate;
    if (hasDateRange) {
      filters.push(`task_start_date >= $${paramIndex++}`);
      params.push(`${startDate} 00:00:00`);
      filters.push(`task_start_date <= $${paramIndex++}`);
      params.push(`${endDate} 23:59:59`);
    }

    if (nameFilter) {
      filters.push(`LOWER(name) = LOWER($${paramIndex++})`);
      params.push(nameFilter);
    }

    const whereClause = filters.join(" AND ");

    const dataQuery = `
      SELECT DISTINCT ON (LOWER(COALESCE(name, '')), LOWER(COALESCE(task_description, '')))
        COALESCE(task_id, id::text) AS task_id,
        department,
        given_by,
        name,
        task_description,
        task_start_date,
        submission_date,
        frequency,
        status,
        remark,
        doer_name2,
        hod,
        attachment
      FROM assign_task
      WHERE ${whereClause}
      ORDER BY
        LOWER(COALESCE(name, '')),
        LOWER(COALESCE(task_description, '')),
        task_start_date ASC
      LIMIT $${paramIndex++}
      OFFSET $${paramIndex}
    `;

    const dataParams = [...params, pageSize, offset];

    const countQuery = `
      SELECT COUNT(*) AS count FROM (
        SELECT 1
        FROM assign_task
        WHERE ${whereClause}
        GROUP BY LOWER(COALESCE(name, '')), LOWER(COALESCE(task_description, ''))
      ) AS subquery
    `;

    const [dataRes, countRes] = await Promise.all([
      housekeepingPool.query(dataQuery, dataParams),
      housekeepingPool.query(countQuery, params),
    ]);

    const total = parseInt(countRes.rows[0]?.count ?? 0, 10);
    return { data: dataRes.rows, total };
  } catch (err) {
    console.log("Error in fetchHousekeeping:", err);
    return { data: [], total: 0 };
  }
};


export const deleteChecklistTasks = async (tasks) => {
  let deletedCount = 0;

  for (const t of tasks) {
    const result = await pool.query(
      `
      DELETE FROM checklist
      WHERE name = $1
      AND task_description = $2
      AND submission_date IS NULL
      AND DATE(task_start_date) = CURRENT_DATE
      `,
      [t.name, t.task_description]
    );
    deletedCount += result.rowCount || 0;
  }

  if (deletedCount === 0) {
    throw new Error("Only current day checklist tasks can be deleted.");
  }

  return tasks;
};


export const deleteDelegationTasks = async (taskIds) => {
  const result = await pool.query(
    `
    DELETE FROM delegation
    WHERE task_id = ANY($1)
    AND submission_date IS NULL
    AND DATE(task_start_date) = CURRENT_DATE
    `,
    [taskIds]
  );

  if ((result.rowCount || 0) === 0) {
    throw new Error("Only current day delegation tasks can be deleted.");
  }

  return taskIds;
};

export const deleteMaintenanceTasks = async (taskIds) => {
  const normalizedTaskIds = Array.isArray(taskIds)
    ? taskIds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value))
    : [];

  if (normalizedTaskIds.length === 0) {
    return [];
  }

  const result = await maintenancePool.query(
    `
    DELETE FROM maintenance_task_assign
    WHERE id = ANY($1::int[])
      AND actual_date IS NULL
      AND DATE(task_start_date) = CURRENT_DATE
    `,
    [normalizedTaskIds]
  );

  if ((result.rowCount || 0) === 0) {
    throw new Error("Only current day maintenance tasks can be deleted.");
  }

  return normalizedTaskIds;
};

export const deleteHousekeepingTasks = async (taskIds) => {
  if (!housekeepingPool) {
    return [];
  }

  const normalizedTaskIds = Array.isArray(taskIds)
    ? taskIds
        .map((value) => (value !== undefined && value !== null ? String(value).trim() : ""))
        .filter(Boolean)
    : [];

  if (normalizedTaskIds.length === 0) {
    return [];
  }

  const numericTaskIds = normalizedTaskIds
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value));

  const result = await housekeepingPool.query(
    `
    DELETE FROM assign_task
    WHERE submission_date IS NULL
      AND DATE(task_start_date) = CURRENT_DATE
      AND (
        id = ANY($1::int[])
        OR task_id = ANY($2::text[])
      )
    `,
    [numericTaskIds, normalizedTaskIds]
  );

  if ((result.rowCount || 0) === 0) {
    throw new Error("Only current day housekeeping tasks can be deleted.");
  }

  return normalizedTaskIds;
};


export const updateChecklistTask = async (updatedTask, originalTask) => {
  try {
    // Validate that task_id is provided
    if (!updatedTask.task_id) {
      throw new Error("task_id is required for updating a task");
    }

    // Build dynamic update query based on provided fields
    // Only update fields that are explicitly provided AND not empty strings
    const updates = [];
    const values = [];
    let paramIndex = 1;

    // Helper function to check if value should be updated
    const shouldUpdate = (value) => {
      return value !== undefined && value !== null && value !== '';
    };

    // Add fields to update if they are provided and not empty
    if (shouldUpdate(updatedTask.department)) {
      updates.push(`department = $${paramIndex++}`);
      values.push(updatedTask.department);
    }

    if (shouldUpdate(updatedTask.given_by)) {
      updates.push(`given_by = $${paramIndex++}`);
      values.push(updatedTask.given_by);
    }

    if (shouldUpdate(updatedTask.name)) {
      updates.push(`name = $${paramIndex++}`);
      values.push(updatedTask.name);
    }

    if (shouldUpdate(updatedTask.task_description)) {
      updates.push(`task_description = $${paramIndex++}`);
      values.push(updatedTask.task_description);
    }

    if (shouldUpdate(updatedTask.task_start_date)) {
      updates.push(`task_start_date = $${paramIndex++}`);
      values.push(updatedTask.task_start_date);
    }

    if (shouldUpdate(updatedTask.frequency)) {
      updates.push(`frequency = $${paramIndex++}`);
      values.push(updatedTask.frequency);
    }

    if (shouldUpdate(updatedTask.enable_reminder)) {
      updates.push(`enable_reminder = $${paramIndex++}`);
      // Convert to lowercase to match database enum (yes/no)
      // Database enum expects lowercase "yes" or "no"
      const reminderValue = String(updatedTask.enable_reminder || '').trim().toLowerCase();
      values.push(reminderValue === 'yes' ? 'yes' : 'no');
    }

    if (shouldUpdate(updatedTask.require_attachment)) {
      updates.push(`require_attachment = $${paramIndex++}`);
      // Convert to lowercase to match database enum (yes/no)
      // Database enum expects lowercase "yes" or "no"
      const attachmentValue = String(updatedTask.require_attachment || '').trim().toLowerCase();
      values.push(attachmentValue === 'yes' ? 'yes' : 'no');
    }

    if (shouldUpdate(updatedTask.remark)) {
      updates.push(`remark = $${paramIndex++}`);
      values.push(updatedTask.remark);
    }

    if (updates.length === 0) {
      throw new Error("No fields to update - all fields are empty");
    }

    // Add task_id for WHERE clause
    values.push(updatedTask.task_id);

    const sql = `
      UPDATE checklist
      SET ${updates.join(', ')}
      WHERE task_id = $${paramIndex}
        AND DATE(task_start_date) = CURRENT_DATE
      RETURNING *;
    `;

    const res = await pool.query(sql, values);

    if (res.rows.length === 0) {
      throw new Error(`Only current day checklist tasks can be edited.`);
    }

    return res.rows;
  } catch (err) {
    console.error("Error updating checklist task:", err);
    throw err;
  }
};

export const updateDelegationTask = async (updatedTask) => {
  try {
    if (!updatedTask.task_id) {
      throw new Error("task_id is required for updating a delegation task");
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (shouldUpdateValue(updatedTask.department)) {
      updates.push(`department = $${paramIndex++}`);
      values.push(updatedTask.department);
    }

    if (shouldUpdateValue(updatedTask.given_by)) {
      updates.push(`given_by = $${paramIndex++}`);
      values.push(updatedTask.given_by);
    }

    if (shouldUpdateValue(updatedTask.name)) {
      updates.push(`name = $${paramIndex++}`);
      values.push(updatedTask.name);
    }

    if (shouldUpdateValue(updatedTask.task_description)) {
      updates.push(`task_description = $${paramIndex++}`);
      values.push(updatedTask.task_description);
    }

    if (shouldUpdateValue(updatedTask.task_start_date)) {
      updates.push(`task_start_date = $${paramIndex++}`);
      values.push(updatedTask.task_start_date);
      updates.push(`planned_date = $${paramIndex++}`);
      values.push(updatedTask.task_start_date);
    }

    if (shouldUpdateValue(updatedTask.frequency)) {
      updates.push(`frequency = $${paramIndex++}`);
      values.push(updatedTask.frequency);
    }

    if (shouldUpdateValue(updatedTask.enable_reminder)) {
      updates.push(`enable_reminder = $${paramIndex++}`);
      values.push(normalizeYesNoValue(updatedTask.enable_reminder));
    }

    if (shouldUpdateValue(updatedTask.require_attachment)) {
      updates.push(`require_attachment = $${paramIndex++}`);
      values.push(normalizeYesNoValue(updatedTask.require_attachment));
    }

    if (shouldUpdateValue(updatedTask.division)) {
      updates.push(`division = $${paramIndex++}`);
      values.push(updatedTask.division);
    }

    if (updates.length === 0) {
      throw new Error("No fields to update - all fields are empty");
    }

    values.push(updatedTask.task_id);

    const sql = `
      UPDATE delegation
      SET ${updates.join(", ")}
      WHERE task_id = $${paramIndex}
        AND submission_date IS NULL
        AND DATE(task_start_date) = CURRENT_DATE
      RETURNING *;
    `;

    const res = await pool.query(sql, values);

    if (res.rows.length === 0) {
      throw new Error(`Only current day delegation tasks can be edited.`);
    }

    return res.rows;
  } catch (err) {
    console.error("Error updating delegation task:", err);
    throw err;
  }
};

export const updateMaintenanceTask = async (updatedTask) => {
  try {
    if (!updatedTask.task_id) {
      throw new Error("task_id is required for updating a maintenance task");
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (shouldUpdateValue(updatedTask.department)) {
      updates.push(`doer_department = $${paramIndex++}`);
      values.push(updatedTask.department);
      updates.push(`machine_department = $${paramIndex++}`);
      values.push(updatedTask.department);
    }

    if (shouldUpdateValue(updatedTask.given_by)) {
      updates.push(`given_by = $${paramIndex++}`);
      values.push(updatedTask.given_by);
    }

    if (shouldUpdateValue(updatedTask.name)) {
      updates.push(`doer_name = $${paramIndex++}`);
      values.push(updatedTask.name);
    }

    if (shouldUpdateValue(updatedTask.machine_name)) {
      updates.push(`machine_name = $${paramIndex++}`);
      values.push(updatedTask.machine_name);
    }

    if (shouldUpdateValue(updatedTask.serial_no)) {
      updates.push(`serial_no = $${paramIndex++}`);
      values.push(updatedTask.serial_no);
    }

    if (shouldUpdateValue(updatedTask.task_description)) {
      updates.push(`description = $${paramIndex++}`);
      values.push(updatedTask.task_description);
    }

    if (shouldUpdateValue(updatedTask.task_start_date)) {
      updates.push(`task_start_date = $${paramIndex++}`);
      values.push(updatedTask.task_start_date);
    }

    if (shouldUpdateValue(updatedTask.frequency)) {
      updates.push(`frequency = $${paramIndex++}`);
      values.push(updatedTask.frequency);
    }

    if (shouldUpdateValue(updatedTask.task_type)) {
      updates.push(`task_type = $${paramIndex++}`);
      values.push(updatedTask.task_type);
    }

    if (shouldUpdateValue(updatedTask.priority)) {
      updates.push(`priority = $${paramIndex++}`);
      values.push(updatedTask.priority);
    }

    if (shouldUpdateValue(updatedTask.division)) {
      updates.push(`division = $${paramIndex++}`);
      values.push(updatedTask.division);
    }

    if (updates.length === 0) {
      throw new Error("No fields to update - all fields are empty");
    }

    values.push(updatedTask.task_id);

    const sql = `
      UPDATE maintenance_task_assign
      SET ${updates.join(", ")}
      WHERE id = $${paramIndex}
        AND actual_date IS NULL
        AND DATE(task_start_date) = CURRENT_DATE
      RETURNING
        id AS task_id,
        COALESCE(doer_department, machine_department) AS department,
        given_by,
        doer_name AS name,
        description AS task_description,
        task_start_date,
        actual_date AS submission_date,
        frequency,
        task_type,
        priority,
        machine_name,
        serial_no,
        task_status AS status,
        division;
    `;

    const res = await maintenancePool.query(sql, values);

    if (res.rows.length === 0) {
      throw new Error(`Only current day maintenance tasks can be edited.`);
    }

    return res.rows;
  } catch (err) {
    console.error("Error updating maintenance task:", err);
    throw err;
  }
};

// ------------------------ FETCH USERS (UNIQUE NAMES) ------------------------
export const fetchUsers = async () => {
  try {
    const checklistAndDelegationSql = `
      SELECT name
      FROM (
        SELECT DISTINCT name FROM checklist WHERE name IS NOT NULL AND name <> ''
        UNION
        SELECT DISTINCT name FROM delegation WHERE name IS NOT NULL AND name <> ''
      ) t
      ORDER BY LOWER(name)
    `;

    const maintenanceSql = `
      SELECT DISTINCT doer_name AS name
      FROM maintenance_task_assign
      WHERE doer_name IS NOT NULL AND doer_name <> ''
    `;

    const housekeepingSql = `
      SELECT DISTINCT name
      FROM assign_task
      WHERE name IS NOT NULL AND name <> ''
    `;

    const [mainResult, maintenanceResult, housekeepingResult] = await Promise.all([
      pool.query(checklistAndDelegationSql),
      maintenancePool.query(maintenanceSql),
      housekeepingPool ? housekeepingPool.query(housekeepingSql) : Promise.resolve({ rows: [] }),
    ]);

    const mergedNames = [...new Set(
      [...mainResult.rows, ...maintenanceResult.rows, ...housekeepingResult.rows]
        .map((row) => (typeof row?.name === "string" ? row.name.trim() : ""))
        .filter(Boolean)
    )].sort((left, right) => left.localeCompare(right));

    return mergedNames.map((name) => ({ user_name: name }));
  } catch (err) {
    console.log(err);
    return [];
  }
};


