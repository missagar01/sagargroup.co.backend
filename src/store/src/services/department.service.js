import { withPgClient } from "../config/postgres.js";

/**
 * Fetches HOD details from 'departments' table by department name.
 */
export async function getHODByDepartment(departmentName) {
  if (!departmentName) return null;

  return withPgClient(async (client) => {
    const { rows } = await client.query(
      `
      SELECT id, department, hod, mobile_number
      FROM departments
      WHERE UPPER(department) = UPPER($1)
      LIMIT 1
      `,
      [departmentName.trim()]
    );

    return rows[0] || null;
  });
}

/**
 * Fetches all departments.
 */
export async function getAllDepartments() {
  return withPgClient(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM departments ORDER BY department ASC`
    );
    return rows;
  });
}

/**
 * Creates a new department.
 */
export async function createDepartment(data) {
  const { department, hod, mobile_number } = data;
  return withPgClient(async (client) => {
    const { rows } = await client.query(
      `
      INSERT INTO departments (department, hod, mobile_number)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [department, hod, mobile_number]
    );
    return rows[0];
  });
}

/**
 * Updates an existing department.
 */
export async function updateDepartment(id, data) {
  const { department, hod, mobile_number } = data;
  return withPgClient(async (client) => {
    const { rows } = await client.query(
      `
      UPDATE departments
      SET department = $1, hod = $2, mobile_number = $3
      WHERE id = $4
      RETURNING *
      `,
      [department, hod, mobile_number, id]
    );
    return rows[0];
  });
}

/**
 * Deletes a department.
 */
export async function deleteDepartment(id) {
  return withPgClient(async (client) => {
    await client.query(`DELETE FROM departments WHERE id = $1`, [id]);
    return { success: true };
  });
}
