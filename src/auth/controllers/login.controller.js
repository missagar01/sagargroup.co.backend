const jwt = require("jsonwebtoken");
const { loginQuery } = require("../../../config/pg.js");

const JWT_SECRET = process.env.JWT_SECRET || "change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "30d";

// Hardcoded query with existing columns only
async function buildUserSelectQuery() {
  return `
    SELECT 
      id,
      user_name,
      password,
      email_id,
      department,
      given_by,
      role,
      COALESCE(status, 'active') as status,
      user_access,
      page_access,
      system_access,
      remark,
      employee_id
    FROM users
    WHERE TRIM(user_name) = $1
    LIMIT 1
  `;
}

// Cache the query string
let cachedUserSelectQuery = null;

function signToken(user) {
  const payload = {
    id: user.id,
    username: user.user_name || user.username,
    user_name: user.user_name || user.username,
    role: user.role || 'user',
    // Explicitly include access fields in token
    user_access: user.user_access || '',
    page_access: user.page_access || '',
    system_access: user.system_access || '',
    employee_id: user.employee_id || '',
    email_id: user.email_id || '',
    department: user.department || ''
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function normalizePermissions(raw = null) {
  if (!raw) return { read: true, write: false, update: false, delete: false };
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return { read: true, write: false, update: false, delete: false };
    }
  }
  return raw;
}

async function login(req, res) {
  // Support both 'username' and 'user_name' in request body
  const username = req.body.username || req.body.user_name;
  const password = req.body.password;

  // Validate input
  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: "username and password are required"
    });
  }

  try {
    // Build or use cached query
    if (!cachedUserSelectQuery) {
      console.log('Building user select query for the first time...');
      cachedUserSelectQuery = await buildUserSelectQuery();
    }

    // Query user from login database
    const result = await loginQuery(cachedUserSelectQuery, [username.trim()]);

    if (!result.rows || result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    const user = result.rows[0];
    const storedPassword = user.password || "";

    // Password comparison - plain text only (no hashing)
    const passwordMatches = storedPassword === password;

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    // Normalize values - convert "NULL" strings to actual null
    const normalizeValue = (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value === 'string' && (value.toUpperCase() === 'NULL' || value.trim() === '')) return null;
      return value;
    };

    // Normalize user data
    const normalizedUser = {
      id: user.id,
      role: user.role || 'user',
      user_name: user.user_name,
      user_access: normalizeValue(user.user_access),
      page_access: normalizeValue(user.page_access),
      system_access: normalizeValue(user.system_access),
      employee_id: normalizeValue(user.employee_id),
      email_id: normalizeValue(user.email_id),
      department: normalizeValue(user.department),
      // Additional fields for compatibility (optional)
      username: user.user_name, // Alias for compatibility
      status: user.status || 'active',
    };

    // Generate JWT token with normalized data
    const token = signToken(normalizedUser);

    // Return success response with user data
    // Include the requested fields: id, role, user_name, user_access, page_access, system_access, employee_id, email_id
    console.log('Sending user data to frontend:', JSON.stringify(normalizedUser, null, 2));
    // Return success response with user data
    // Include the requested fields: id, role, user_name, user_access, page_access, system_access, employee_id, email_id
    console.log('Sending user data to frontend:', JSON.stringify(normalizedUser, null, 2));
    return res.status(200).json({
      success: true,
      data: {
        user: normalizedUser,
        token,
        // Also pass access fields at the top level of data for easy access
        user_access: normalizedUser.user_access,
        page_access: normalizedUser.page_access,
        system_access: normalizedUser.system_access,
        role: normalizedUser.role
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({
      success: false,
      message: "Login failed",
      error: process.env.NODE_ENV === "development" ? err.message : "Internal server error"
    });
  }
}

function logout(req, res) {
  // Stateless logout - simply acknowledge and allow frontend to clear tokens
  return res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
}

module.exports = {
  login,
  logout,
};
