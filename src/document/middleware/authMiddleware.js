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

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || req.headers.Authorization;
  let token = null;

  if (typeof header === "string") {
    const [scheme, value] = header.split(" ");
    if (scheme?.toLowerCase() === "bearer" && value) {
      token = value;
    } else if (header.trim()) {
      token = header.trim();
    }
  }

  if (!token)
    return res.status(401).json({ error: "Not authorized. No token provided." });

  try {
    const secret = getJwtSecret();
    if (!secret) {
      return res.status(500).json({ error: "JWT secret is not configured." });
    }

    const decoded = jwt.verify(token, secret);
    req.user = decoded; // username, role
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid token" });
  }
}
