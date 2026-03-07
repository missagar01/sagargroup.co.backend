const jwt = require('jsonwebtoken');
const { StatusCodes } = require('http-status-codes');
const config = require('../../../config/env');
const ApiError = require('../utils/apiError');
const tokenBlacklist = require('../utils/tokenBlacklist');

const getJwtSecret = () =>
  process.env.JWT_SECRET ||
  process.env.JWT_SCREAT ||
  process.env.JWT_SECREAT ||
  process.env.jwt_secret ||
  process.env.jwt_screat ||
  process.env.jwt_secreat ||
  config.jwt.secret ||
  null;

const extractToken = (req) => {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || typeof header !== 'string') {
    return null;
  }
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }
  return token;
};

const requireAuth = (req, _res, next) => {
  const token = extractToken(req);
  if (!token) {
    return next(new ApiError(StatusCodes.UNAUTHORIZED, 'Authorization token missing'));
  }

  try {
    const jwtSecret = getJwtSecret();
    if (!jwtSecret) {
      return next(new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'JWT secret not configured'));
    }

    const decoded = jwt.verify(token, jwtSecret);
    if (tokenBlacklist.isBlacklisted(token)) {
      return next(new ApiError(StatusCodes.UNAUTHORIZED, 'Token has been logged out'));
    }
    req.user = decoded;
    req.token = token;
    return next();
  } catch (error) {
    return next(new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid or expired token'));
  }
};

const requireRoles = (...allowedRoles) => (req, _res, next) => {
  if (!req.user) {
    return next(new ApiError(StatusCodes.FORBIDDEN, 'Authentication required'));
  }

  if (!allowedRoles.length) {
    return next();
  }

  const role = req.user.role;
  if (allowedRoles.includes(role)) {
    return next();
  }

  return next(new ApiError(StatusCodes.FORBIDDEN, 'Insufficient role'));
};

module.exports = { requireAuth, requireRoles };
