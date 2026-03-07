// Authentication middleware
import jwt from "jsonwebtoken";

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

function extractToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (typeof header === "string") {
    const parts = header.split(" ");
    if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
      return parts[1];
    }
    if (parts.length === 1 && parts[0].length > 0) {
      return parts[0];
    }
  }

  const cookieToken = req.cookies?.token || req.cookies?.access_token || null;
  return cookieToken || null;
}

export function authenticate(req, res, next) {
  try {
    const secret = getJwtSecret();
    if (!secret) {
      return res.status(500).json({ ok: false, message: "JWT secret not configured" });
    }

    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ ok: false, message: "Missing authorization token" });
    }

    const verifyOptions = {};
    if (process.env.JWT_ISSUER) verifyOptions.issuer = process.env.JWT_ISSUER;

    try {
      req.user = jwt.verify(token, secret, verifyOptions);
      return next();
    } catch (verifyErr) {
      // Allow shared login tokens that may not include an issuer claim.
      if (verifyOptions.issuer && verifyErr?.name === "JsonWebTokenError") {
        req.user = jwt.verify(token, secret);
        return next();
      }
      throw verifyErr;
    }
  } catch (err) {
    const code = err?.name === "TokenExpiredError" ? 401 : 401;
    return res.status(code).json({ ok: false, message: "Invalid or expired token" });
  }
}

export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ ok: false, message: "Unauthenticated" });
    }
    if (!allowedRoles || allowedRoles.length === 0) return next();

    const userRole = req.user?.role || req.user?.Role || null;
    if (!userRole) {
      return res.status(403).json({ ok: false, message: "Forbidden: missing role" });
    }
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ ok: false, message: "Forbidden: insufficient role" });
    }
    return next();
  };
}

export function optionalAuth(req, res, next) {
  const secret = getJwtSecret();
  const token = extractToken(req);
  if (!secret || !token) return next();
  try {
    const verifyOptions = {};
    if (process.env.JWT_ISSUER) verifyOptions.issuer = process.env.JWT_ISSUER;
    try {
      req.user = jwt.verify(token, secret, verifyOptions);
    } catch (verifyErr) {
      if (verifyOptions.issuer && verifyErr?.name === "JsonWebTokenError") {
        req.user = jwt.verify(token, secret);
      }
    }
  } catch (_) {
    // ignore errors and proceed as unauthenticated
  }
  return next();
}









