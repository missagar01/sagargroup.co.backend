// controllers/settingController.js
import { pool } from "../config/db.js";

const normalizeDepartmentAccess = (value, fallbackDepartment = null) => {
  const source =
    value !== undefined && value !== null && value !== ""
      ? value
      : fallbackDepartment;

  if (source === undefined) {
    return undefined;
  }

  if (source === null || source === "") {
    return null;
  }

  const items = Array.isArray(source) ? source : String(source).split(",");
  const normalized = [...new Set(
    items
      .map((item) => (typeof item === "string" ? item.trim() : String(item).trim()))
      .filter(Boolean)
  )];

  return normalized.length > 0 ? normalized.join(",") : null;
};

const normalizeStringValue = (
  value,
  { maxLength = 500, trim = true, emptyToNull = false } = {}
) => {
  if (value === null) return null;
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    value = value
      .map((item) => (typeof item === "string" ? item : String(item)))
      .join(", ");
  }

  let str = typeof value === "string" ? value : String(value);
  if (trim) {
    str = str.trim();
  }

  if (emptyToNull && str === "") {
    return null;
  }

  if (maxLength && str.length > maxLength) {
    return str.substring(0, maxLength);
  }

  return str;
};

const sanitizePasswordValue = (value) => {
  if (value === null || value === undefined) return undefined;
  const trimmed = typeof value === "string" ? value.trim() : String(value).trim();
  return trimmed === "" ? undefined : trimmed;
};

const isEmployeeIdUniqueViolation = (error) =>
  error?.code === "23505" &&
  ["users_employee_id_key", "idx_users_employee_id"].includes(error?.constraint);

/*******************************
 * 1) GET USERS
 *******************************/
export const getUsers = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM users
      WHERE user_name IS NOT NULL
      ORDER BY id ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching users:", error);
    res.status(500).json({ error: "Database error" });
  }
};


/*******************************
 * 1.1) GET USER BY ID
 *******************************/
export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT *
      FROM users
      WHERE id = $1
    `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("❌ Error fetching user by id:", error);
    res.status(500).json({ error: "Database error" });
  }
};


/*******************************
 * 2) CREATE USER
 *******************************/
export const createUser = async (req, res) => {
  try {
    const {
      username,
      password,
      email,
      phone,
      department,
      givenBy,
      employee_id,
      role,
      status,
      user_access,
      departments,
      user_access1,
      system_access,
      page_access,
      division,
      designation
    } = req.body;

    const normalizedDepartmentAccess = normalizeDepartmentAccess(
      user_access !== undefined ? user_access : departments,
      department
    );
    const normalizedEmployeeId = normalizeStringValue(employee_id, {
      maxLength: 500,
      emptyToNull: true
    });

    // Prepare values array with proper null handling
    const values = [
      username || null,
      password || null,
      email || null,
      phone || null,
      department || null,
      givenBy || null,
      role || 'user',
      status || 'active',
      normalizedDepartmentAccess ?? null,
      normalizedEmployeeId,
      user_access1 || null,
      system_access || null,
      page_access || null,
      division || null,
      designation || null
    ];

    const query = `
      INSERT INTO users (
        user_name, password, email_id, number, department,
        given_by, role, status, user_access, employee_id, user_access1, system_access, page_access, division, designation
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;

    const result = await pool.query(query, values);

    res.json(result.rows[0]);

  } catch (error) {
    console.error("❌ Error creating user:", error);
    if (isEmployeeIdUniqueViolation(error)) {
      return res.status(409).json({
        error: "Employee ID already exists",
        message: "Employee ID already exists. Leave it blank or use a unique value."
      });
    }
    res.status(500).json({ error: error.message || "Database error" });
  }
};


/*******************************
 * 3) UPDATE USER
 *******************************/
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;

    const parsePayload = (body) => {
      if (!body) return {};
      if (typeof body === "object") return body;
      if (typeof body === "string") {
        try {
          return JSON.parse(body);
        } catch (err) {
          console.warn("Unable to parse request body as JSON", err.message);
          return {};
        }
      }
      return {};
    };

    const payload = parsePayload(req.body);
    const normalizedPayload = Array.isArray(payload)
      ? payload.reduce((acc, value) => ({ ...acc, ...value }), {})
      : payload;

    const existingResult = await pool.query(
      `
      SELECT *
      FROM users
      WHERE id = $1
    `,
      [id]
    );
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const fieldMap = {
      username: "user_name",
      user_name: "user_name",
      password: "password",
      email: "email_id",
      email_id: "email_id",
      phone: "number",
      number: "number",
      department: "department",
      givenBy: "given_by",
      given_by: "given_by",
      employee_id: "employee_id",
      role: "role",
      status: "status",
      user_access: "user_access",
      departments: "user_access",
      user_access1: "user_access1",
      system_access: "system_access",
      page_access: "page_access",
      division: "division",
      designation: "designation",
      remark: "remark",
      leave_date: "leave_date",
      leave_end_date: "leave_end_date"
    };

    const sanitizeRules = {
      user_name: { maxLength: 500 },
      email_id: { maxLength: 500 },
      number: { maxLength: 500 },
      department: { maxLength: 500 },
      given_by: { maxLength: 500 },
      role: { maxLength: 100 },
      status: { maxLength: 100 },
      user_access: { maxLength: 100000 },
      user_access1: { maxLength: 100000 },
      system_access: { maxLength: 500 },
      page_access: { maxLength: 500 },
      division: { maxLength: 500 },
      designation: { maxLength: 500 },
      remark: { maxLength: 1000 },
      employee_id: { maxLength: 500, emptyToNull: true },
      leave_date: {},
      leave_end_date: {}
    };

    const updates = {};

    for (const [bodyKey, columnName] of Object.entries(fieldMap)) {
      if (!Object.prototype.hasOwnProperty.call(normalizedPayload, bodyKey)) {
        continue;
      }
      const rawValue = normalizedPayload[bodyKey];
      if (columnName === "password") {
        const sanitized = sanitizePasswordValue(rawValue);
        if (sanitized === undefined) {
          continue;
        }
        updates[columnName] = sanitized;
        continue;
      }

      if (columnName === "user_access") {
        const sanitized = normalizeDepartmentAccess(
          rawValue,
          normalizedPayload.department
        );
        if (sanitized === undefined) {
          continue;
        }
        updates[columnName] = sanitized;
        continue;
      }

      const rules = sanitizeRules[columnName] || { maxLength: 500 };
      const sanitized = normalizeStringValue(rawValue, rules);

      if (sanitized === undefined) {
        continue;
      }

      updates[columnName] = sanitized;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields provided for update" });
    }

    const columns = [];
    const values = [];
    let placeholderIndex = 1;

    for (const [column, value] of Object.entries(updates)) {
      columns.push(`${column} = $${placeholderIndex++}`);
      values.push(value);
    }

    const query = `
      UPDATE users
      SET ${columns.join(", ")}
      WHERE id = $${placeholderIndex}
      RETURNING *
    `;
    values.push(id);

    const result = await pool.query(query, values);

    res.json(result.rows[0]);

  } catch (error) {
    console.error("❌ Error in updateUser controller:", error);
    console.error("Error details:", {
      message: error.message,
      stack: error.stack
    });
    if (isEmployeeIdUniqueViolation(error)) {
      return res.status(409).json({
        error: "Employee ID already exists",
        message: "Employee ID already exists. Leave it blank or use a unique value."
      });
    }
    return res.status(500).json({
      error: "Server error",
      message: error.message || "Failed to update user"
    });
  }
};


/*******************************
 * 4) DELETE USER
 *******************************/
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(`DELETE FROM users WHERE id = $1`, [id]);

    res.json({ message: "User deleted", id });

  } catch (error) {
    console.error("❌ Error deleting user:", error);
    res.status(500).json({ error: "Database error" });
  }
};


/*******************************
 * 5) GET ALL DEPARTMENTS
 *******************************/
export const getDepartments = async (req, res) => {
  try {
    const { division } = req.query;
    let query = `
      SELECT id, department_name AS department, division_name AS division
      FROM checklist_departments
    `;
    const params = [];
    
    if (division) {
      query += ` WHERE LOWER(TRIM(division_name)) = LOWER(TRIM($1))`;
      params.push(division);
    }
    
    query += ` ORDER BY department_name ASC`;
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching departments:", error);
    res.status(500).json({ error: "Database error" });
  }
};


/*******************************
 * 6) GET UNIQUE DEPARTMENTS ONLY
 *******************************/
export const getDepartmentsOnly = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT department_name AS department
      FROM checklist_departments
      WHERE department_name IS NOT NULL AND department_name <> ''
      ORDER BY department_name ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching unique departments:", error);
    res.status(500).json({ error: "Database error" });
  }
};


/*******************************
 * 7) GET UNIQUE GIVEN_BY VALUES
 *******************************/
export const getGivenByData = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, manager_name AS given_by
      FROM checklist_given_by
      ORDER BY manager_name ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching given_by data:", error);
    res.status(500).json({ error: "Database error" });
  }
};


/*******************************
 * 8) CREATE DEPARTMENT
 *******************************/
export const createDepartment = async (req, res) => {
  try {
    const { name, division } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "Department name is required" });
    }

    const departmentName = name.trim();
    const divisionName = division?.trim() || null;

    // Check if department already exists
    const existingDept = await pool.query(
      `SELECT id FROM checklist_departments WHERE LOWER(department_name) = LOWER($1) LIMIT 1`,
      [departmentName]
    );

    if (existingDept.rows.length > 0) {
      return res.status(409).json({ error: "Department already exists" });
    }

    const result = await pool.query(`
      INSERT INTO checklist_departments (department_name, division_name)
      VALUES ($1, $2)
      RETURNING id, department_name AS department, division_name AS division
    `, [departmentName, divisionName]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("❌ Error creating dept:", error);
    res.status(500).json({ error: "Database error", details: error.message });
  }
};


/*******************************
 * 9) UPDATE DEPARTMENT
 *******************************/
export const updateDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const { department, division } = req.body;

    if (!id) {
      return res.status(400).json({ error: "Department ID is required" });
    }

    if (!department) {
      return res.status(400).json({ error: "Department name is required" });
    }

    const result = await pool.query(`
      UPDATE checklist_departments 
      SET department_name = $1, division_name = $2
      WHERE id = $3
      RETURNING id, department_name AS department, division_name AS division
    `, [department.trim(), division?.trim() || null, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Department not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("❌ Error updating dept:", error);
    res.status(500).json({ error: "Database error", details: error.message });
  }
};


/*******************************
 * 10) DELETE DEPARTMENT
 *******************************/
export const deleteDepartment = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "Department ID is required" });
    }

    const result = await pool.query(`
      DELETE FROM checklist_departments WHERE id = $1 RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Department not found" });
    }

    res.json({ message: "Department deleted successfully", id });
  } catch (error) {
    console.error("❌ Error deleting department:", error);
    res.status(500).json({ error: "Database error", details: error.message });
  }
};


/*******************************
 * 11) DIVISIONS CRUD
 *******************************/
export const getDivisions = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, division_name AS division, status
      FROM checklist_divisions
      ORDER BY division_name ASC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching divisions:", error);
    res.status(500).json({ error: "Database error" });
  }
};

export const createDivision = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "Division name is required" });
    }

    const divisionName = name.trim();

    const existing = await pool.query(
      `SELECT id FROM checklist_divisions WHERE LOWER(division_name) = LOWER($1) LIMIT 1`,
      [divisionName]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Division already exists" });
    }

    const result = await pool.query(`
      INSERT INTO checklist_divisions (division_name)
      VALUES ($1)
      RETURNING id, division_name AS division, status
    `, [divisionName]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("❌ Error creating division:", error);
    res.status(500).json({ error: "Database error" });
  }
};

export const updateDivision = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!id || !name || name.trim() === "") {
      return res.status(400).json({ error: "ID and division name are required" });
    }

    const result = await pool.query(`
      UPDATE checklist_divisions
      SET division_name = $1
      WHERE id = $2
      RETURNING id, division_name AS division, status
    `, [name.trim(), id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Division not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("❌ Error updating division:", error);
    res.status(500).json({ error: "Database error" });
  }
};

export const deleteDivision = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      DELETE FROM checklist_divisions WHERE id = $1 RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Division not found" });
    }

    res.json({ message: "Division deleted successfully", id });
  } catch (error) {
    console.error("❌ Error deleting division:", error);
    res.status(500).json({ error: "Database error" });
  }
};


/*******************************
 * 12) MANAGERS (GIVEN BY) CRUD
 *******************************/
export const createGivenBy = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "Manager name is required" });
    }

    const managerName = name.trim();

    const existing = await pool.query(
      `SELECT id FROM checklist_given_by WHERE LOWER(manager_name) = LOWER($1) LIMIT 1`,
      [managerName]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Manager already exists" });
    }

    const result = await pool.query(`
      INSERT INTO checklist_given_by (manager_name)
      VALUES ($1)
      RETURNING id, manager_name AS given_by, status
    `, [managerName]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("❌ Error creating manager:", error);
    res.status(500).json({ error: "Database error" });
  }
};

export const updateGivenBy = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!id || !name || name.trim() === "") {
      return res.status(400).json({ error: "ID and manager name are required" });
    }

    const result = await pool.query(`
      UPDATE checklist_given_by
      SET manager_name = $1
      WHERE id = $2
      RETURNING id, manager_name AS given_by, status
    `, [name.trim(), id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Manager not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("❌ Error updating manager:", error);
    res.status(500).json({ error: "Database error" });
  }
};

export const deleteGivenBy = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      DELETE FROM checklist_given_by WHERE id = $1 RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Manager not found" });
    }

    res.json({ message: "Manager deleted successfully", id });
  } catch (error) {
    console.error("❌ Error deleting manager:", error);
    res.status(500).json({ error: "Database error" });
  }
};




export const patchSystemAccess = async (req, res) => {
  try {
    const { id } = req.params;
    let { system_access } = req.body;

    if (!system_access) {
      return res.status(400).json({ error: "system_access is required" });
    }

    system_access = system_access.trim().toUpperCase();

    const existing = await pool.query(
      "SELECT system_access FROM users WHERE id = $1",
      [id]
    );

    let current = [];

    if (existing.rows[0]?.system_access) {
      current = existing.rows[0].system_access
        .split(",")
        .map(v => v.trim().toUpperCase());
    }

    if (current.includes(system_access)) {
      current = current.filter(v => v !== system_access);
    } else {
      current.push(system_access);
    }

    const result = await pool.query(
      `
      UPDATE users
      SET system_access = $1
      WHERE id = $2
      RETURNING *
      `,
      [current.join(","), id]
    );

    res.json(result.rows[0]);

  } catch (error) {
    console.error("Error patching system_access:", error);
    res.status(500).json({ error: "Database error" });
  }
};


/*******************************
 * PATCH VERIFY ACCESS (SIMPLE)
 *******************************/
export const patchVerifyAccess = async (req, res) => {
  try {
    const { id } = req.params;
    const { verify_access } = req.body;

    if (verify_access === undefined) {
      return res.status(400).json({ error: "verify_access is required" });
    }

    const result = await pool.query(
      `
      UPDATE users
      SET verify_access = $1
      WHERE id = $2
      RETURNING id, verify_access
      `,
      [verify_access, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error("❌ Error patching verify_access:", error);
    res.status(500).json({ error: "Database error" });
  }
};


export const patchVerifyAccessDept = async (req, res) => {
  try {
    const { id } = req.params;
    let { verify_access_dept } = req.body;

    // ✅ If nothing is sent, just return current user (no error)
    if (!verify_access_dept) {
      const existingUser = await pool.query(
        "SELECT * FROM users WHERE id = $1",
        [id]
      );
      return res.json(existingUser.rows[0]);
    }

    verify_access_dept = verify_access_dept.trim().toUpperCase();

    const existing = await pool.query(
      "SELECT verify_access_dept FROM users WHERE id = $1",
      [id]
    );

    let current = [];

    if (existing.rows[0]?.verify_access_dept) {
      current = existing.rows[0].verify_access_dept
        .split(",")
        .map(v => v.trim().toUpperCase())
        .filter(Boolean);
    }

    // 🔁 Toggle logic (UNCHANGED)
    if (current.includes(verify_access_dept)) {
      current = current.filter(v => v !== verify_access_dept);
    } else {
      current.push(verify_access_dept);
    }

    const result = await pool.query(
      `
      UPDATE users
      SET verify_access_dept = $1
      WHERE id = $2
      RETURNING *
      `,
      [current.length ? current.join(",") : null, id]
    );

    res.json(result.rows[0]);

  } catch (error) {
    console.error("Error patching verify_access_dept:", error);
    res.status(500).json({ error: "Database error" });
  }
};

