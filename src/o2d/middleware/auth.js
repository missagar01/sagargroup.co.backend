const jwt = require("jsonwebtoken");

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

function getTokenFromHeader(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || typeof header !== "string") return null;
  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") return null;
  return parts[1];
}

function authenticate(req, res, next) {
  const token = getTokenFromHeader(req);
  if (!token) {
    return res.status(401).json({ success: false, message: "Authorization token missing" });
  }

  try {
    const jwtSecret = getJwtSecret();
    if (!jwtSecret) {
      return res.status(500).json({ success: false, message: "JWT secret not configured" });
    }

    const payload = jwt.verify(token, jwtSecret);
    req.user = payload;
    next();
  } catch (_err) {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const role = (req.user.role || "").toString().toLowerCase();
  const allowed =
    role === "admin" ||
    role === "all access" ||
    role.includes("all access"); // for stored page-name lists containing "All Access"

  if (!allowed) {
    return res.status(403).json({ success: false, message: "Permission denied" });
  }

  return next();
}

module.exports = { authenticate, requireAdmin };
