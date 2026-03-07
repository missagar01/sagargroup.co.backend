const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const db = require("../config/db.js");

const JWT_EXPIRES_IN = "24h";

function getJwtSecret() {
  return (
    process.env.JWT_SECRET ||
    process.env.JWT_SCREAT ||
    process.env.JWT_SECREAT ||
    process.env.jwt_secret ||
    process.env.jwt_screat ||
    process.env.jwt_secreat ||
    null
  );
}

const generateToken = (user) => {
  const jwtSecret = getJwtSecret();
  if (!jwtSecret) {
    throw new Error("JWT secret not configured");
  }

  return jwt.sign(
    {
      id: user.username,
      username: user.username,
      userType: user.usertype,
    },
    jwtSecret,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

const verifyToken = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    // Support both "Bearer token" and just "token" formats
    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.split(" ")[1] 
      : authHeader;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    const jwtSecret = getJwtSecret();
    if (!jwtSecret) {
      return res.status(500).json({
        success: false,
        message: "JWT secret not configured",
      });
    }

    const decoded = jwt.verify(token, jwtSecret);

    // Map token payload from shared login to lead-to-order format
    // Shared login token has: id, username (which is user_name), role, user_access
    // Lead-to-order expects: username, userType
    const username = decoded.username || decoded.user_name || decoded.id;
    const userType = decoded.role || decoded.userType || 'user';

    // Set user in request for use in controllers
    req.user = {
      username: username,
      userType: userType,
      role: decoded.role,
      id: decoded.id,
      user_access: decoded.user_access,
      page_access: decoded.page_access,
      system_access: decoded.system_access,
    };

    next();
  } catch (error) {
    console.error("Token verification error:", error.message);
    
    // Provide more specific error messages
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: "Token has expired",
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }

    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

// login removed - use /api/auth/login instead

const getUserData = async (req, res) => {
  try {
    const { username, userType } = req.user;
    let fmsQuery;
    let enquiryQuery;
    let fmsParams = [];
    let enquiryParams = [];

    if (userType === "admin") {
      fmsQuery = `
        SELECT *, 'fms_leads' AS source 
        FROM fms_leads
        ORDER BY created_at DESC
      `;
      enquiryQuery = `
        SELECT *, 'enquiry_to_order' AS source
        FROM enquiry_to_order
        ORDER BY timestamp DESC
      `;
    } else {
      fmsQuery = `
        SELECT *, 'fms_leads' AS source 
        FROM fms_leads
        WHERE sc_name = $1
        ORDER BY created_at DESC
      `;
      fmsParams = [username];

      enquiryQuery = `
        SELECT *, 'enquiry_to_order' AS source
        FROM enquiry_to_order
        WHERE sales_coordinator_name = $1
        ORDER BY timestamp DESC
      `;
      enquiryParams = [username];
    }

    const fmsResult = await db.query(fmsQuery, fmsParams);
    const enquiryResult = await db.query(enquiryQuery, enquiryParams);
    const finalData = [...fmsResult.rows, ...enquiryResult.rows];

    res.json({
      success: true,
      userType,
      count: finalData.length,
      data: finalData,
    });
  } catch (error) {
    console.error("Get data error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching data",
      error: error.message,
    });
  }
};

const createUser = async (req, res) => {
  try {
    const { username, password, usertype } = req.body;
    const currentUser = req.user;

    if (currentUser.userType !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only admin can create users",
      });
    }

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required",
      });
    }

    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      return res.status(400).json({
        success: false,
        message: "Username can only contain letters, numbers, and underscores (3-30 characters)",
      });
    }

    const checkResult = await db.query("SELECT username FROM login WHERE username = $1", [username]);
    if (checkResult.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Username already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const insertResult = await db.query(
      `
      INSERT INTO login (username, password, usertype) 
      VALUES ($1, $2, $3) 
      RETURNING username, usertype, created_at
    `,
      [username, hashedPassword, usertype || "user"]
    );

    res.status(201).json({
      success: true,
      message: "User created successfully",
      user: insertResult.rows[0],
    });
  } catch (error) {
    console.error("Create user error:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while creating user",
      error: error.message,
    });
  }
};

const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const { username } = req.user;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required",
      });
    }

    const userResult = await db.query("SELECT password FROM login WHERE username = $1", [username]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = userResult.rows[0];
    let isPasswordValid;
    if (user.password.startsWith("$2a$") || user.password.startsWith("$2b$")) {
      isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    } else {
      isPasswordValid = currentPassword === user.password;
    }

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.query("UPDATE login SET password = $1 WHERE username = $2", [hashedPassword, username]);

    res.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("Update password error:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while updating password",
      error: error.message,
    });
  }
};


module.exports = {
  verifyToken,
  getUserData,
  createUser,
  updatePassword,
};
