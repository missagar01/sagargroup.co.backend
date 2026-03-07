const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { StatusCodes } = require('http-status-codes');
const loginRepository = require('../repositories/login.repository');
const config = require('../../../config/env');
const ApiError = require('../utils/apiError');

const getJwtSecret = () =>
  process.env.JWT_SECRET ||
  process.env.JWT_SCREAT ||
  process.env.JWT_SECREAT ||
  process.env.jwt_secret ||
  process.env.jwt_screat ||
  process.env.jwt_secreat ||
  config.jwt.secret ||
  null;

const buildToken = (user) => {
  const role = user.role || 'user';
  const payload = {
    sub: user.id,
    id: user.id,
    username: user.username,
    employee_id: user.employee_id,
    role,
    created_at: user.created_at
  };
  const jwtSecret = getJwtSecret();
  if (!jwtSecret) {
    throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'JWT secret not configured');
  }

  return jwt.sign(payload, jwtSecret, { expiresIn: config.jwt.expiresIn });
};

// login function removed - use /api/auth/login instead
// This function is kept for reference but not exported
const _login = async ({ user_name, employee_id, password, username }) => {
  const lookupName = user_name ?? username;
  const user = await loginRepository.findLoginForAuth({
    userName: lookupName,
    employeeId: employee_id
  });
  if (!user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid credentials');
  }

  // Support hashed (in password_hash or password) and plain-text (password) storage.
  const hashToCheck = user.password_hash ?? user.password;
  const bcryptMatch = hashToCheck
    ? await bcrypt.compare(password, hashToCheck).catch(() => false)
    : false;
  const plainMatch = user.password ? user.password === password : false;

  if (!bcryptMatch && !plainMatch) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid credentials');
  }

  const createdAt = user.created_at ?? user.create_at ?? user.createdate;
  const createdAtIso = createdAt ? new Date(createdAt).toISOString() : null;

  const safeUser = {
    id: user.id,
    username: user.user_name ?? user.username,
    employee_id: user.employee_id,
    role: user.role || 'user',
    created_at: createdAtIso
  };
  const token = buildToken(safeUser);
  return { user: safeUser, token };
};

const generateUserId = () => {
  const bytes = crypto.randomBytes(3);
  const segment = bytes.toString('hex').toUpperCase();
  return `USR-${segment}`;
};

const formatLoginRow = (row) => ({
  id: row.id,
  user_name: row.user_name,
  role: row.role,
  user_id: row.user_id,
  email: row.email,
  number: row.number,
  department: row.department,
  give_by: row.give_by,
  status: row.status,
  user_acess: row.user_acess,
  employee_id: row.employee_id,
  create_at: row.create_at,
  createdate: row.createdate,
  updatedate: row.updatedate
});

const register = async (payload) => {
  const {
    user_name,
    password,
    role = 'user',
    user_id,
    email,
    number,
    department,
    give_by,
    status,
    user_acess,
    employee_id
  } = payload;

  const newUser = await loginRepository.insertLogin({
    user_name,
    password,
    role,
    user_id: user_id || generateUserId(),
    email,
    number,
    department,
    give_by,
    status,
    user_acess,
    employee_id
  });

  return formatLoginRow(newUser);
};

const listRegistrations = async () => {
  const rows = await loginRepository.findAllLogins();
  return rows.map(formatLoginRow);
};

const getRegistration = async (id) => {
  const row = await loginRepository.findLoginById(id);
  if (!row) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  }
  return formatLoginRow(row);
};

const updateRegistration = async (id, updates) => {
  const row = await loginRepository.updateLogin(id, updates);
  if (!row) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  }
  return formatLoginRow(row);
};

const deleteRegistration = async (id) => {
  const row = await loginRepository.deleteLogin(id);
  if (!row) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  }
  return row;
};

module.exports = {
  // login removed - use /api/auth/login instead
  register,
  listRegistrations,
  getRegistration,
  updateRegistration,
  deleteRegistration
};
