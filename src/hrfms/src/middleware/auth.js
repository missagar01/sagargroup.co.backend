const jwt = require('jsonwebtoken');

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
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.split(' ')[1] || null;
  }

  return authHeader;
}

function authenticateToken(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ success: false, message: 'Missing token' });
  }

  try {
    const jwtSecret = getJwtSecret();
    if (!jwtSecret) {
      return res.status(500).json({ success: false, message: 'JWT secret not configured' });
    }

    const payload = jwt.verify(token, jwtSecret);
    req.user = payload;
    return next();
  } catch (_error) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

function authorizeRoles(...roles) {
  return (req, res, next) => {
    if (!roles.length) {
      return next();
    }

    const userRole = String(req.user?.role || '').toLowerCase();
    if (!userRole) {
      return res.status(403).json({ success: false, message: 'Role required' });
    }

    const allowedRoles = roles.map((role) => String(role).toLowerCase());
    const hasRole = allowedRoles.includes(userRole);
    if (!hasRole) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    return next();
  };
}

module.exports = {
  authenticateToken,
  authorizeRoles
};
