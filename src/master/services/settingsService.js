import pool from "../config/db.js";

const getAllUsers = async () => {
    const result = await pool.query(`
        SELECT *
        FROM users
        WHERE user_name IS NOT NULL
        ORDER BY id ASC
    `);
    return result.rows;
};

const getUserById = async (id) => {
    const result = await pool.query(
        `
        SELECT *
        FROM users
        WHERE id = $1
        `,
        [id]
    );
    return result.rows[0];
};

const getSystemAccess = async (id) => {
    const result = await pool.query(
        "SELECT system_access FROM users WHERE id = $1",
        [id]
    );
    return result.rows[0];
};

const updateSystemAccess = async (id, systemAccess) => {
    const result = await pool.query(
        `
        UPDATE users
        SET system_access = $1
        WHERE id = $2
        RETURNING *
        `,
        [systemAccess, id]
    );
    return result.rows[0];
};

export default {
    getAllUsers,
    getUserById,
    getSystemAccess,
    updateSystemAccess,
};
