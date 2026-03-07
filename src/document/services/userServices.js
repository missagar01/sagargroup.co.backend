import pool from "../config/db.js";

// FETCH USERS
export async function getAllUsersService() {
  const query = `
    SELECT id, username, name, email, role, last_login
    FROM users
    ORDER BY id DESC
  `;
  const result = await pool.query(query);
  return result.rows;
}

// CREATE USER
export async function createUserService({ username, name, email, password, role }) {
  const hashed = password;

  const query = `
    INSERT INTO users (username, name, email, password, role)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, username, name, email, role, last_login
  `;

  const result = await pool.query(query, [
    username,
    name,
    email,
    hashed,
    role
  ]);

  return result.rows[0];
}

// UPDATE USER
export async function updateUserService({
  identifier,
  username,
  name,
  email,
  password,
  role
}) {
  const lookup = identifier ?? username;
  if (!lookup) return null;

  const isNumericId = /^\d+$/.test(String(lookup));
  const identifierField = isNumericId ? "id" : "username";
  const identifierValue = isNumericId ? Number(lookup) : lookup;

  const existingQuery = `
    SELECT id, username, name, email, role, password
    FROM users
    WHERE ${identifierField}=$1
    LIMIT 1
  `;
  const existingResult = await pool.query(existingQuery, [identifierValue]);
  if (existingResult.rows.length === 0) return null;

  const existing = existingResult.rows[0];

  const updatedUsername = username ?? existing.username;
  const updatedName = name ?? existing.name;
  const updatedEmail = email ?? existing.email;
  const updatedRole = role ?? existing.role;

  let updatedPassword = existing.password;
  if (password) {
    updatedPassword = password;
  }

  const query = `
    UPDATE users
    SET username=$1, name=$2, email=$3, password=$4, role=$5
    WHERE ${identifierField}=$6
    RETURNING id, username, name, email, role, last_login
  `;

  const result = await pool.query(query, [
    updatedUsername,
    updatedName,
    updatedEmail,
    updatedPassword,
    updatedRole,
    identifierValue
  ]);

  return result.rows[0];
}

// DELETE USER
export async function deleteUserService(username) {
  await pool.query("DELETE FROM users WHERE username=$1", [username]);
}


// current permissions fetch service

export const getCurrentPermissionsService = async (userId) => {
  const result = await pool.query(
    "SELECT subscription_access_system FROM users WHERE id = $1",
    [userId]
  );

  if (!result.rows.length) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  return result.rows[0].subscription_access_system ?? {};
};